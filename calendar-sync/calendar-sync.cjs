'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
function notifyCompletion(mode,ok,launch=spawn,platform=process.platform) {
  if(platform!=='win32')return;
  const label=mode==='--sync'?'同期':mode==='--auth'?'接続設定':'プレビュー';
  const message=ok?label+'が完了しました。マクロの「処理状況・結果を確認」からレポートを開けます。':label+'でエラーが発生しました。「処理状況・結果を確認」からレポートを確認してください。';
  const script="$shell=New-Object -ComObject WScript.Shell; [void]$shell.Popup('"+message+"',10,'Mery Google 同期',"+(ok?64:48)+")";
  try {
    const child=launch('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore'});
    child.on('error',()=>{});child.unref();
  } catch {}
}
const progressPage=require('./progress.cjs');
const tasks=require('./tasks-sync.cjs');
const core=require('./calendar-sync-core.cjs');
const google=require('./calendar-google.cjs');
const {SyncStore}=require('./calendar-store.cjs');
const DEFAULT_HUB='C:\\Projects\\ai-work-hub';
function decodeFile(buffer) {
  if(buffer[0]===255 && buffer[1]===254) return buffer.subarray(2).toString('utf16le');
  if(buffer[0]===254 && buffer[1]===255) {const copy=Buffer.from(buffer.subarray(2));copy.swap16();return copy.toString('utf16le');}
  return buffer.toString('utf8').replace(/^\uFEFF/,'');
}
function readConfiguration(hub) {
  const dir=path.join(hub,'.mery-calendar');
  const file=path.join(dir,'config.json');
  const user=fs.existsSync(file)?JSON.parse(decodeFile(fs.readFileSync(file))):{};
  const calendarId=user.calendarId||'primary';
  if(typeof calendarId!=='string'||!calendarId.trim()) throw new Error('calendarId が不正です。');
  return {todoPaths:user.todoPaths,taskListId:user.taskListId,calendarId,credentialsPath:path.resolve(hub,user.credentialsPath||'.mery-calendar/oauth-client.json'),tokenPath:path.join(dir,'token.dpapi'),statePath:path.join(dir,'sync.sqlite'),reportPath:path.join(hub,'CALENDAR_SYNC_REPORT.md'),lockPath:path.join(dir,'sync.lock'),hub,dir};
}
async function synchronize(documents,state,events,api,calendarId,apply=false,onProgress=()=>{}) {
  if(state.calendarId && state.calendarId!==calendarId) throw new Error('同期先のカレンダーが変更されています。別の作業ハブを使うか、既存の同期関係を確認してください。');
  const parsed={TASKS:core.parseDocument(documents.TASKS,'TASKS'),LOG:core.parseDocument(documents.LOG,'LOG')};
  const local=[...parsed.TASKS.items,...parsed.LOG.items];
  if(new Set(local.map(x=>x.id)).size!==local.length) throw new Error('TASKS と LOG で同期IDが重複しています。コピーした項目の <!-- mery-calendar:... --> を片方から削除してください。');
  const entries=state.entries||{};
  const known=new Map(Object.entries(entries).map(([id,x])=>[x.eventId,{id,...x.local}]));
  const remote=events.filter(event=>known.has(event.id)||event.extendedProperties?.private?.meryId||/^\[(TASKS(?: ✓)?|LOG)\]\s/.test(event.summary||'')).map(event=>core.fromEvent(event,calendarId,known.get(event.id)));
  const operations=core.planSync(local,remote,entries);
  const docs={TASKS:parsed.TASKS.text,LOG:parsed.LOG.text};
  const nextState={version:1,calendarId,entries:{...entries}};
  const pulls=[],removals=[],errors=[];
  if(apply) {
    let processed=0;
    for(const operation of operations) {
      onProgress({stage:"LOG を同期しています",done:processed++,total:operations.length,item:operation.local?.text||operation.remote?.text||""});
      const {id,action,local:l,remote:r,base}=operation;
      const eventId=r?.eventId||base?.eventId||'a'+id;
      const resource='calendars/'+encodeURIComponent(calendarId)+'/events/'+encodeURIComponent(eventId);
      try {
        if(action==='conflict') continue;
        if(action==='forget') {delete nextState.entries[id];continue;}
        if(action==='deleteRemote') {
          await api.request('DELETE',resource+'?sendUpdates=none',null,r.etag);
          delete nextState.entries[id];continue;
        }
        if(action==='deleteLocal') {removals.push(id);delete nextState.entries[id];continue;}
        let saved=r;
        if(action==='createRemote') {
          const event=await api.request('POST','calendars/'+encodeURIComponent(calendarId)+'/events?sendUpdates=none',{id:eventId,...core.toEvent(l)});
          saved=core.fromEvent(event,calendarId,l);
        } else if(action==='push') {
          const event=await api.request('PATCH',resource+'?sendUpdates=none',core.toEvent(l),r.etag);
          saved=core.fromEvent(event,calendarId,l);
        } else if(action==='pull') pulls.push(r);
        if(saved?.unsupported) throw new Error(saved.unsupported);
        const item=action==='pull'?r:l;
        nextState.entries[id]={eventId:saved.eventId,local:core.fields(item),remote:core.fields(saved)};
      } catch(error) {errors.push({id,message:error.message});}
    }
  }
  return {documents:apply?core.applyItems(docs,pulls,removals):documents,state:nextState,operations,errors};
}
function report(result,apply) {
  const labels={createRemote:'カレンダーへ新規登録',push:'カレンダーを更新',pull:'Mery へ反映',deleteRemote:'カレンダーから削除',deleteLocal:'Mery から削除',conflict:'競合・要確認',adopt:'変更なし',forget:'同期情報を整理'};
  const counts={};for(const o of result.operations) counts[o.action]=(counts[o.action]||0)+1;
  let text='# Google カレンダー同期'+(apply?'結果':'プレビュー')+'\n\n';
  for(const [key,label] of Object.entries(labels)) text+='- '+label+': '+(counts[key]||0)+'件\n';
  text+='- 通信エラー: '+result.errors.length+'件\n\n';
  for(const o of result.operations.filter(x=>x.action!=='adopt'&&x.action!=='forget')) {
    const item=o.local||o.remote||o.base?.local;
    text+='## '+labels[o.action]+'\n\n'+(item?.kind||'')+' / '+(item?.date||'')+' / '+(item?.text||o.id)+'\n\n';
    if(o.action==='conflict') text+='Mery とカレンダーの変更が競合するか、未対応の予定形式です。自動で上書きしません。\n\nMery: '+JSON.stringify(o.local?core.fields(o.local):null)+'\n\nカレンダー: '+JSON.stringify(o.remote?.unsupported|| (o.remote&&!o.remote.deleted?core.fields(o.remote):null))+'\n\n';
  }
  for(const error of result.errors) text+='## エラー\n\n'+error.id+': '+error.message+'\n\n';
  return text;
}
function backupAndSave(file,text,original) {
  if(fs.existsSync(file) && !fs.readFileSync(file).equals(original)) throw new Error('同期中にファイルが変更されました。再実行してください: '+file);
  const timestamp=new Date().toISOString().replace(/[-:.TZ]/g,'')+'_'+crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(file.replace(/\.md$/,'_backup_'+timestamp+'.md'),original,{flag:'wx'});
  const tmp=file+'.'+timestamp+'.tmp';
  fs.writeFileSync(tmp,'\uFEFF'+text,'utf8');fs.renameSync(tmp,file);
}
async function cli(args=process.argv.slice(2)) {
  const hubIndex=args.indexOf('--hub');
  const hub=hubIndex>=0?args[hubIndex+1]:DEFAULT_HUB;
  if(!hub) throw new Error('--hub に作業フォルダーを指定してください。');
  const config=readConfiguration(hub);
  fs.mkdirSync(config.dir,{recursive:true});
  let lock,store;
  try {lock=fs.openSync(config.lockPath,'wx');} catch {throw new Error('別の同期処理が実行中です。異常終了した場合は .mery-calendar/sync.lock を確認してください。');}
  const mode=args.includes('--auth')?'--auth':args.includes('--sync')?'--sync':'--preview';
  const statusPath=path.join(config.dir,'run-status.json');let runError;
  let live={phase:'running',mode,pid:process.pid,startedAt:new Date().toISOString()};
  const writeStatus=value=>{live={...live,...value};const tmp=statusPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(live));fs.renameSync(tmp,statusPath);fs.writeFileSync(path.join(config.dir,'progress.html'),progressPage.render(live));};
  const onProgress=value=>writeStatus({...value,phase:'running'});
  try {
    writeStatus({phase:'running',mode,pid:process.pid,startedAt:new Date().toISOString()});
    const offline=args.includes('--offline-preview');
    const auth=args.includes('--auth');
    const apply=args.includes('--sync');
    onProgress({stage:auth?'ブラウザーでのログインを待っています':'Google に接続しています'});
    const api=offline?null:await google.connect(config,auth);
    if(auth) {
      const calendars=await google.listCalendars(api);
      const text='# Google カレンダー接続完了\n\n設定ファイル: '+path.join(config.dir,'config.json')+'\n\n現在の calendarId: `'+config.calendarId+'`\n\n## 利用できるカレンダー\n\n'+calendars.map(x=>'- '+x.summary+' / '+x.accessRole+'\n  ID: `'+x.id+'`').join('\n')+'\n';
      fs.writeFileSync(config.reportPath,'\uFEFF'+text,'utf8');console.log(text);return;
    }
    // Bind SQLite mappings to the real calendar ID, rather than the account-dependent primary alias.
    if(!offline && config.calendarId==='primary') {
      const primary=(await google.listCalendars(api)).find(calendar=>calendar.primary);
      if(!primary?.id) throw new Error('Google のメインカレンダーを特定できませんでした。');
      config.calendarId=primary.id;
    }
    const useTasks=args.includes('--tasks');
    if(!useTasks&&fs.existsSync(path.join(config.dir,'tasks-ids.json')))throw new Error('ID別ファイル方式では --tasks を指定するか、更新済みの Mery 同期マクロを使用してください。');
    if(useTasks&&offline)throw new Error('My Tasks は接続ありのプレビューを使用してください。');
    const taskReport=useTasks?await tasks.run(config,api,apply,onProgress):'';
    const originals={},documents={};
    for(const kind of ['TASKS','LOG']) {
      const file=path.join(hub,kind+'.md');
      if(!fs.existsSync(file)) throw new Error(kind+'.md がありません。両方のファイルを作成してから同期してください。');
      originals[kind]=fs.readFileSync(file);documents[kind]=decodeFile(originals[kind]);
    }
    store=new SyncStore(config.statePath);
    const state=store.load();
    if(apply) {
      // Persist identifiers before sending requests so interrupted first syncs can be retried.
      const stamped={TASKS:useTasks?{text:documents.TASKS,items:[]}:core.parseDocument(documents.TASKS,'TASKS'),LOG:core.parseDocument(documents.LOG,'LOG')};
      const ids=[...stamped.TASKS.items,...stamped.LOG.items].map(x=>x.id);
      if(new Set(ids).size!==ids.length) throw new Error('TASKS と LOG で同期IDが重複しています。');
      for(const kind of ['TASKS','LOG']) if(stamped[kind].text!==documents[kind]) {
        backupAndSave(path.join(hub,kind+'.md'),stamped[kind].text,originals[kind]);
        originals[kind]=fs.readFileSync(path.join(hub,kind+'.md'));documents[kind]=decodeFile(originals[kind]);
      }
    }
    onProgress({stage:"カレンダーの予定を読み込んでいます",done:null,total:null,item:""});
    const events=offline?[]:await google.listAll(api,config.calendarId);
    if(offline && Object.keys(state.entries).length) throw new Error('既に同期済みです。削除誤判定を防ぐため、接続ありのプレビューを使用してください。');
    const legacy=Object.fromEntries(Object.entries(state.entries).filter(([,x])=>x.local.kind==='TASKS'));
    const logState=useTasks?{...state,entries:Object.fromEntries(Object.entries(state.entries).filter(([,x])=>x.local.kind==='LOG'))}:state;
    const logEvents=useTasks?events.filter(x=>x.extendedProperties?.private?.meryKind==='LOG'||/^\[LOG\] /.test(x.summary||'')||Object.values(logState.entries).some(y=>y.eventId===x.id)):events;
    const result=await synchronize(useTasks?{...documents,TASKS:''}:documents,logState,logEvents,api,config.calendarId,apply,onProgress);
    if(useTasks){result.documents.TASKS=documents.TASKS;result.state.entries={...legacy,...result.state.entries};}
    if(apply) {
      // Check both originals before saving either file. Preserve snapshots before every rewrite.
      for(const kind of ['TASKS','LOG']) if(!fs.readFileSync(path.join(hub,kind+'.md')).equals(originals[kind])) throw new Error('同期中に '+kind+'.md が変更されました。結果を確認して再実行してください。');
      for(const kind of ['TASKS','LOG']) if(result.documents[kind]!==documents[kind]) backupAndSave(path.join(hub,kind+'.md'),result.documents[kind],originals[kind]);
      store.save(result.state,result);
    }
    const text=report(result,apply)+taskReport;
    fs.writeFileSync(config.reportPath,'\uFEFF'+text,'utf8');console.log(text);
    if(result.errors.length) process.exitCode=1;
  } catch(error) {
    runError=error.message;
    fs.writeFileSync(config.reportPath,'\uFEFF# Google 同期エラー\n\n'+runError+'\n','utf8');
    throw error;
  } finally {
    try {if(store) store.close();} finally {
      fs.closeSync(lock);fs.unlinkSync(config.lockPath);
      writeStatus({phase:'completed',mode,stage:'処理終了',item:'',done:null,total:null,ok:!runError&&!process.exitCode,error:runError||null,finishedAt:new Date().toISOString()});
      if(args.includes('--tasks'))notifyCompletion(mode,!runError&&!process.exitCode);
    }
  }
}
module.exports={decodeFile,readConfiguration,synchronize,report,cli,notifyCompletion};
if(require.main===module) cli().catch(error=>{
  console.error(error.message);process.exitCode=1;
  try {
    const args=process.argv.slice(2),i=args.indexOf('--hub');
    const hub=i>=0?args[i+1]:DEFAULT_HUB;
    fs.writeFileSync(path.join(hub,'CALENDAR_SYNC_REPORT.md'),'\uFEFF# Google カレンダー同期エラー\n\n'+error.message+'\n','utf8');
  } catch {}
});
