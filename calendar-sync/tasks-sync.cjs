'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const core=require('./calendar-sync-core.cjs');
const identities=require('./task-identities.cjs');
const marker=/\s*<!-- mery-calendar:([a-f0-9]{32}) -->/;
const dueMarker=/\s*<!-- mery-due:(\d{4}-\d{2}-\d{2}) -->/;
function decode(b){if(b[0]===255&&b[1]===254)return b.subarray(2).toString('utf16le');if(b[0]===254&&b[1]===255){const c=Buffer.from(b.subarray(2));c.swap16();return c.toString('utf16le');}return b.toString('utf8').replace(/^\uFEFF/,'');}
function parse(text,file,isTasks){
  if(isTasks){const p=core.parseDocument(text,'TASKS');return {...p,items:p.items.map(x=>({...x,file}))};}
  const lines=text.replace(/\r\n?/g,'\n').split('\n'),items=[];let fence='';
  for(let index=0;index<lines.length;index++){
    const line=lines[index],f=line.match(/^\s*(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1][0];else if(fence===f[1][0])fence='';continue;}if(fence)continue;
    const m=line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.+)$/);if(!m)continue;
    const id=m[2].match(marker)?.[1]||crypto.randomBytes(16).toString('hex'),date=m[2].match(dueMarker)?.[1]||'';
    if(date&&!(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date))throw Error('TODO の日付が不正です: '+file);
    const body=m[2].replace(marker,'').replace(dueMarker,'').trim();if(!body)continue;
    if(!m[2].match(marker))lines[index]=line+' <!-- mery-calendar:'+id+' -->';
    items.push({id,file,index,kind:'TODO',text:body,done:m[1].toLowerCase()==='x',date});
  }
  for(const line of lines){const id=line.match(marker)?.[1];if(id&&!items.some(x=>x.id===id))throw Error('同期済み TODO を解析できません: '+file);}
  return {text:lines.join('\n'),items};
}
const fields=x=>({text:x.text,done:!!x.done,date:x.date||''});
const equal=(a,b)=>JSON.stringify(fields(a))===JSON.stringify(fields(b));
function resource(x,notes=''){return {title:x.text,status:x.done?'completed':'needsAction',due:x.date?x.date+'T00:00:00.000Z':null,notes};}
async function pages(api,route,params={}){const items=[];let page='';do{const r=await api.tasksRequest('GET',route+'?'+new URLSearchParams({...params,...(page?{pageToken:page}:{})}));items.push(...(r.items||[]));page=r.nextPageToken||'';}while(page);return items;}
function save(file,text,original){if(!fs.readFileSync(file).equals(original))throw Error('同期中に変更されました: '+file);fs.writeFileSync(file+'.backup_'+Date.now()+'_'+crypto.randomBytes(3).toString('hex')+'.md',original,{flag:'wx'});const temp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';fs.writeFileSync(temp,'\uFEFF'+text);fs.renameSync(temp,file);}
function todayDate(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function updateDocument(doc,item,remote,today=todayDate()){
  if(item.kind==='TASKS'&&remote&&item.date===today&&item.section==='今日やる'){
    const lines=doc.split('\n'),index=lines.findIndex(line=>line.match(marker)?.[1]===item.id);
    if(index>=0){lines[index]='- ['+(remote.done?'x':' ')+'] '+remote.text+(item.start?' @'+item.start+'-'+item.end:'')+' <!-- mery-calendar:'+item.id+' -->';return lines.join('\n');}
  }
  if(item.kind==='TASKS')return core.applyItems({TASKS:doc,LOG:''},remote?[{...item,...fields(remote),date:today,section:'今日やる'}]:[],remote?[]:[item.id]).TASKS;
  const lines=doc.split('\n'),index=lines.findIndex(x=>x.match(marker)?.[1]===item.id);if(index<0)throw Error('TODO 項目が見つかりません。');
  if(!remote)lines.splice(index,1);else{const prefix=lines[index].match(/^(\s*[-*]\s+)\[[ xX]\]\s*/)[1];lines[index]=prefix+'['+(remote.done?'x':' ')+'] '+remote.text+(remote.date?' <!-- mery-due:'+remote.date+' -->':'')+' <!-- mery-calendar:'+item.id+' -->';}return lines.join('\n');
}
async function run(config,api,apply){
  const lists=await pages(api,'users/@me/lists',{maxResults:'100'});
  const list=config.taskListId?lists.find(x=>x.id===config.taskListId):lists.find(x=>x.title==='My Tasks');
  if(!list)throw Error('My Tasks が見つかりません。.mery-calendar/config.json の taskListId に対象リストIDを指定してください。利用可能: '+lists.map(x=>x.title+' / '+x.id).join(', '));
  let paths=config.todoPaths;
  if(paths===undefined){const view=path.join(config.hub,'PROJECT_TODO.md');const source=fs.existsSync(view)?decode(fs.readFileSync(view)).match(/^Source:\s*`([^`]+)`/m)?.[1]:null;paths=source?[source]:[];}
  if(!Array.isArray(paths)||paths.some(x=>typeof x!=='string'||!x))throw Error('todoPaths は TODO.md のフルパスの配列にしてください。');
  const files=[path.join(config.hub,'TASKS.md'),...paths.map(x=>path.resolve(config.hub,x))];
  if(new Set(files.map(x=>x.toLowerCase())).size!==files.length)throw Error('同期対象ファイルが重複しています。');
  const docs=new Map(),local=new Map();
  const identityFile=path.join(config.dir,'tasks-ids.json');let snapshots=identities.load(identityFile);
  for(const file of files){const original=fs.readFileSync(file),text=decode(original),parsed=parse(file===files[0]?identities.restore(text,snapshots):text,file,file===files[0]);docs.set(file,{original,...parsed});for(const x of parsed.items){if(local.has(x.id))throw Error('同期IDがファイル間で重複しています。コピー先の同期マーカーを削除してください。');local.set(x.id,x);}}
  function saveDocument(file,text,d){
    let visible=text;if(file===files[0]){snapshots=identities.checkpoint(identityFile,text,snapshots);visible=identities.strip(text);}
    if(visible!==decode(d.original)){save(file,visible,d.original);d.original=fs.readFileSync(file);}d.text=text;
  }
  const db=new DatabaseSync(path.join(config.dir,'tasks.sqlite'));let summary='\n## My Tasks\n\n';
  try{
    db.exec('CREATE TABLE IF NOT EXISTS state (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS binding (id INTEGER PRIMARY KEY CHECK(id=1), account TEXT NOT NULL, list TEXT NOT NULL)');
    const binding=db.prepare('SELECT * FROM binding').get();if(binding&&(binding.account!==config.calendarId||binding.list!==list.id))throw Error('My Tasks の同期アカウントまたはリストが変更されています。');
    const state=new Map(db.prepare('SELECT * FROM state').all().map(x=>[x.id,JSON.parse(x.value)]));
    if(!snapshots.length&&state.size&&![...local.keys()].some(id=>state.has(id))&&[...state.values()].some(b=>b.file===files[0]))throw Error('TASKS のIDファイルがありません。IDを削除する前の TASKS.md または tasks-ids.json を復元してください。');
    for(const b of state.values())if(!docs.has(b.file))throw Error('同期済み TODO が対象から外れています。todoPaths に戻してください: '+b.file);
    const route='lists/'+encodeURIComponent(list.id)+'/tasks';
    const remoteList=await pages(api,route,{maxResults:'100',showCompleted:'true',showDeleted:'true',showHidden:'true'}),remote=new Map();
    for(const r of remoteList){let id=[...state].find(([,b])=>b.remoteId===r.id)?.[0]||r.notes?.match(/^Mery sync: ([a-f0-9]{32})$/m)?.[1];if(!id){if(r.deleted||r.hidden)continue;id=crypto.createHash('sha256').update(list.id+'\0'+r.id).digest('hex').slice(0,32);}if(remote.has(id))throw Error('My Tasks の同期IDが重複しています。');remote.set(id,{...r,text:r.title||'',done:r.status==='completed',date:r.due?.slice(0,10)||''});}
    const today=config.today||todayDate();
    summary+='リスト: '+list.title+' / Google取得: '+remoteList.length+'件 / 同期対象: '+local.size+'件 / 照合済み: '+remote.size+'件\n\n';
    if(apply){db.prepare('INSERT OR IGNORE INTO binding VALUES(1,?,?)').run(config.calendarId,list.id);for(const [file,d] of docs)if(file===files[0]||d.text!==decode(d.original))saveDocument(file,d.text,d);}
    for(const id of new Set([...local.keys(),...state.keys(),...remote.keys()])){
      const l=local.get(id),r=remote.get(id),b=state.get(id);let action;
      if(apply&&r&&b?.remoteId===r.id&&r.notes?.split(/\r?\n/).includes('Mery sync: '+id)){
        try{const notes=r.notes.split(/\r?\n/).filter(line=>line!=='Mery sync: '+id).join('\n');const updated=await api.tasksRequest('PATCH',route+'/'+encodeURIComponent(r.id),{notes},r.etag);r.notes=notes;r.etag=updated?.etag||r.etag;}
        catch(error){summary+='- IDメモの整理を保留: '+(r.text||id)+' / '+error.message+'\n';process.exitCode=1;}
      }
      if(!b)action=!l?(r&&!r.deleted?'Mery 新規取込':'同期情報整理'):l&&r&&!r.deleted?(equal(l,r)?'変更なし':'競合'):l&&r?.deleted?'競合':'新規登録';
      else if(!l&&(!r||r.deleted))action='同期情報整理';
      else if(!l)action=equal(r,b.remote)?'Google から削除':'競合';
      else if(!r||r.deleted)action=equal(l,b.local)?'Mery から削除':'競合';
      else{const lc=!equal(l,b.local),rc=!equal(r,b.remote);action=lc&&rc?(equal(l,r)?'変更なし':'競合'):lc?'Google 更新':rc?'Mery 更新':'変更なし';}
      if(r&&!r.deleted&&(!r.text.trim()||/[\r\n]/.test(r.text)))action='競合';
      if(action==='変更なし'&&l?.kind==='TASKS'&&(!l.done||l.date===today)&&(l.date!==today||l.section!=='今日やる'))action='Mery 配置更新';
      const pulling=['Mery 更新','Mery 配置更新','Mery 新規取込'].includes(action);
      const source=l||{id,file:files[0],kind:'TASKS',date:today,section:'今日やる',start:'',end:''};
      summary+='- '+action+': '+(pulling?r.text:l?.text||b?.local.text||id)+'\n';
      if(pulling||action==='競合')summary+='  Mery: '+JSON.stringify(l?fields(l):null)+' / Google: '+JSON.stringify(r&&!r.deleted?fields(r):null)+'\n';
      if(pulling)summary+='  反映先: '+(source.kind==='TASKS'?today+' / 今日やる':source.file)+'\n';
      if(r)summary+='  Google項目: '+JSON.stringify(fields(r))+'\n';
      if(!apply||action==='競合')continue;
      try{
        let saved=r;const file=l?.file||b?.file||files[0],d=docs.get(file);
        // Temporary recovery marker covers a crash between POST and saving the Google ID locally.
        if(action==='新規登録')saved=await api.tasksRequest('POST',route,resource(l,'Mery sync: '+id));
        if(action==='Google 更新')saved=await api.tasksRequest('PATCH',route+'/'+encodeURIComponent(r.id),resource({...l,date:l.date===b.local.date?r.date:l.date},r.notes),r.etag);
        if(action==='Google から削除')await api.tasksRequest('DELETE',route+'/'+encodeURIComponent(r.id),null,r.etag);
        if(pulling||action==='Mery から削除'){const next=updateDocument(d.text,source,pulling?r:null,today);saveDocument(file,next,d);}
        if(['同期情報整理','Google から削除','Mery から削除'].includes(action)){db.prepare('DELETE FROM state WHERE id=?').run(id);continue;}
        const current=pulling?{...source,...fields(r),...(source.kind==='TASKS'?{date:today}:{})}:l;
        const snapshot={file,local:fields(current),remote:fields({...saved,text:saved.title||saved.text,done:saved.status==='completed',date:saved.due?.slice(0,10)||''}),remoteId:saved.id};
        db.prepare('INSERT INTO state VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,JSON.stringify(snapshot));
        if(saved.notes?.split(/\r?\n/).includes('Mery sync: '+id)){
          const notes=saved.notes.split(/\r?\n/).filter(line=>line!=='Mery sync: '+id).join('\n');
          await api.tasksRequest('PATCH',route+'/'+encodeURIComponent(saved.id),{notes},saved.etag);
        }
      }catch(error){summary+='  エラー: '+error.message+'\n';process.exitCode=1;}
    }
    return summary+'\n対象: '+files.join(', ')+'\n';
  }finally{db.close();}
}
module.exports={parse,fields,equal,resource,updateDocument,run,pages,todayDate};
