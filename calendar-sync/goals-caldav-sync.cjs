'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {GoalCalDavStore}=require('./goals-caldav-store.cjs');
const taskCore=require('./calendar-sync-core.cjs');
const taskIdentities=require('./task-identities.cjs');
const core=require('./goals-caldav-core.cjs');

const DEFAULT_HUB='C:\\Projects\\ai-work-hub';
function snapshot(item){return {id:item.id,type:item.type,source:item.source||'goals',section:item.section||'',date:item.date||'',title:item.title,done:!!item.done,period:item.period||'',start:item.start||'',end:item.end||'',due:item.due||'',time:item.time||'',parentId:item.parentId||''};}
function normalizedRemote(item,localOrBase){
  const result={...item};
  if(localOrBase){result.type=localOrBase.type;result.source=localOrBase.source||'goals';if(!result.section)result.section=localOrBase.section||'';}
  if(result.type==='year'){
    const match=/^(\d{4})-01-01$/.exec(result.start||'');
    if(!match||result.end!==(Number(match[1])+1)+'-01-01')throw new Error('年間目標の期間は1月1日から翌年1月1日までにしてください。');
    result.period=match[1];
  }else if(result.type==='month'){
    const match=/^(\d{4})-(0[1-9]|1[0-2])-01$/.exec(result.start||'');
    if(!match||result.end!==core.dateRange('month',match[1]+'-'+match[2]).end)throw new Error('月目標の期間は月初から翌月初までにしてください。');
    result.period=match[1]+'-'+match[2];
  }else if(result.type==='week'){
    if(!result.start||!result.end||result.end!==core.nextDate(result.start,7)||core.isoWeek(result.start)===null)throw new Error('週目標の期間は月曜から7日間にしてください。');
    const period=core.isoWeek(result.start);
    if(core.dateRange('week',period).end!==result.end)throw new Error('週目標の期間が一致しません。');
    result.period=period;
  }else if(result.type==='todo'){
    if(result.due&&!core.validDate(result.due))throw new Error('TODOの期限日が不正です。');
    if(result.time&&!/^(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d$/.test(result.time))throw new Error('TODOの時刻形式が不正です。');
    if(result.source==='tasks')result.date=result.due||result.date||'';
  }else if(result.type==='task'){
    if(result.due&&!core.validDate(result.due))throw new Error('TASKS.mdの期限日が不正です。');
    if(result.time&&!/^(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d$/.test(result.time))throw new Error('TASKS.mdの時刻形式が不正です。');
    result.source='tasks';result.date=result.due||result.date||'';
  }else throw new Error('未対応のCalDAV項目種別です: '+result.type);
  if(!result.title||/[\r\n]/.test(result.title))throw new Error('件名が空か複数行です。');
  return snapshot(result);
}
function parseTaskDocument(input,snapshots=[],options={}){
  let counter=0;
  const makeId=options.apply?taskCore.uuid:()=>crypto.createHash('sha256').update(options.file+'\0'+input+'\0'+(++counter)).digest('hex').slice(0,32);
  const marked=taskIdentities.restore(input,snapshots,makeId),parsed=taskCore.parseDocument(marked,'TASKS',makeId);
  return {text:parsed.text,items:parsed.items.map(item=>({id:item.id,type:'todo',source:'tasks',section:item.section,date:item.date,title:item.text,done:item.done,period:'',start:'',end:'',due:item.date||'',time:item.start&&item.end?item.start+'-'+item.end:'',parentId:'',index:item.index,taskKind:'TASKS',taskStart:item.start,taskEnd:item.end}))};
}
function replaceItemLine(lines,item,remote){
  const body=remote.type==='year'?remote.period+'年 '+remote.title:
    remote.type==='month'?remote.period+' '+remote.title:
    remote.type==='week'?remote.period+' '+remote.title:
    remote.title+(remote.time?' @'+remote.time:'')+(remote.due?' <!-- mery-due:'+remote.due+' -->':'');
  const extras=item.comments.filter(comment=>!/^<!--\s*(?:mery-(?:due|goal-id)|g):/i.test(comment));
  const suffix=' '+core.goalIdComment(item.id,remote.type)+(extras.length?' '+extras.join(' '):'');
  const check=remote.type==='todo'?(remote.done?'x':' '):(item.done?'x':' ');
  lines[item.index]=item.prefix.replace(/\[[ xX]\]/,'['+check+']')+body+suffix;
}
function insertItem(lines,remote,localItems,today=new Date().toISOString().slice(0,10)){
  let parentId=remote.parentId;
  if(remote.type==='todo'&&!parentId){
    const currentWeek=core.isoWeek(today);
    parentId=localItems.find(x=>x.type==='week'&&x.period===currentWeek)?.id||'';
    if(!parentId)throw new Error('新しいThunderbird ToDoの親となる今週の目標がありません。GOALS.mdに今週の目標を作ってください。');
  }
  const parent=localItems.find(x=>x.id===parentId);
  if(remote.type!=='year'&&!parent)throw new Error('新しい目標の親がGOALS.mdにありません: '+(parentId||'(未設定)'));
  const idComment=' '+core.goalIdComment(remote.id,remote.type);
  const bullet=remote.type==='year'?'- ['+(remote.done?'x':' ')+'] '+remote.period+'年 '+remote.title+idComment:
    remote.type==='month'?'  - ['+(remote.done?'x':' ')+'] '+remote.period+' '+remote.title+idComment:
    remote.type==='week'?'    - ['+(remote.done?'x':' ')+'] '+remote.period+' '+remote.title+idComment:
    (remote.type==='todo'?'- ['+(remote.done?'x':' ')+'] '+remote.title+(remote.time?' @'+remote.time:'')+(remote.due?' <!-- mery-due:'+remote.due+' -->':'')+idComment:'');
  if(remote.type==='year'){
    const heading='## '+remote.period+'年';let section=lines.indexOf(heading);
    if(section<0){if(lines.length&&lines[lines.length-1]!=='')lines.push('');lines.push(heading);section=lines.length-1;}
    lines.splice(section+1,0,bullet);return;
  }
  const parentLine=lines[parent.index];
  if(!parentLine)throw new Error('親目標の行をGOALS.mdで確認できません: '+parent.title);
  let indent=(parentLine.match(/^[ \t\u3000]*/)||[''])[0].replace(/\t/g,'    ').replace(/\u3000/g,'  ').length;
  const childIndent=indent+2;
  const childLine=' '.repeat(childIndent)+bullet.replace(/^[ \t\u3000]*/,'');
  let end=parent.index+1;
  while(end<lines.length){
    if(/^##\s/.test(lines[end]))break;
    const candidate=lines[end].match(/^([ \t\u3000]*)(?:[-*]\s*\[|\s*$)/);
    if(candidate&&candidate[1]){
      const currentIndent=candidate[1].replace(/\t/g,'    ').replace(/\u3000/g,'  ').length;
      if(currentIndent<=indent)break;
    }
    end++;
  }
  lines.splice(end,0,childLine);
}
function hasTaskDetails(lines,index){
  for(let i=index+1;i<lines.length;i++){
    const line=lines[i];
    if(/^##\s|^###\s|^---+$/.test(line)||/^[-*]\s+\[[ xX]\]/.test(line))return false;
    if(!line.trim())continue;
    return /^[ \t\u3000]/.test(line)||/^\s*(?:メモ|関連メモ|資料)[:：]/.test(line);
  }
  return false;
}
function replaceTaskFromThunderbird(lines,id,remote,today){
  const current=taskCore.parseDocument(lines.join('\n'),'TASKS').items.find(x=>x.id===id);
  if(!current)throw new Error('TASKS.mdの同期対象行を特定できません: '+id);
  const date=remote.due||today,section=remote.section||current.section;
  if(date!==current.date||section!==current.section){
    let end=current.index+1;
    while(end<lines.length&&!/^##\s|^###\s|^---+$/.test(lines[end])&&!/^\s*[-*]\s+\[[ xX]\]/.test(lines[end]))end++;
    const attached=lines.slice(current.index+1,end);
    lines.splice(current.index,end-current.index);
    const update={id,kind:'TASKS',date,section,text:remote.title,done:!!remote.done,start:remote.time?.split('-')[0]||'',end:remote.time?.split('-')[1]||''};
    const moved=taskCore.applyItems({TASKS:lines.join('\n'),LOG:''},[update],[]).TASKS.split('\n');
    const newIndex=moved.findIndex(line=>line.match(taskCore.MARKER)?.[1]===id);
    if(newIndex<0)throw new Error('移動後のTASKS.md行を確認できません: '+id);
    moved.splice(newIndex+1,0,...attached);
    return moved;
  }
  const prefix=lines[current.index].match(/^([-*]\s+)\[[ xX]\]\s*/);
  if(!prefix)throw new Error('TASKS.mdの同期対象行を特定できません: '+id);
  lines[current.index]=prefix[1]+'['+(remote.done?'x':' ')+'] '+remote.title+(remote.time?' @'+remote.time:'')+' <!-- mery-calendar:'+id+' -->';
  return lines;
}
function applyRemote(goalItems,goalText,taskItems,taskText,operations,today=new Date().toISOString().slice(0,10)){
  const goalOperations=operations.filter(op=>(op.local?.source||op.base?.local.source||op.remote?.source||'goals')!=='tasks');
  const taskOperations=operations.filter(op=>(op.local?.source||op.base?.local.source||op.remote?.source||'goals')==='tasks');
  const lines=goalText.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  const localMap=new Map(goalItems.map(x=>[x.id,x]));
  const replacements=goalOperations.filter(x=>(x.action==='pull'||x.action==='merge')&&x.local).map(x=>({item:localMap.get(x.id),remote:x.merged||x.remote}));
  for(const change of replacements){
    if(!change.item)continue;
    if(change.item.type!==change.remote.type)throw new Error('予定とToDoの種別が変更されています: '+change.id);
    if((change.remote.parentId||'')!==(change.item.parentId||''))throw new Error('上位目標がThunderbird側で変更されています。階層の移動はGOALS.md側で行ってから同期してください: '+change.id);
    replaceItemLine(lines,change.item,change.remote);
  }
  const removes=goalOperations.filter(x=>x.action==='deleteLocal').map(x=>localMap.get(x.id)).filter(Boolean);
  const removeIds=new Set(removes.map(x=>x.id));
  for(const item of removes)if(goalItems.some(child=>child.parentId===item.id&&!removeIds.has(child.id)))throw new Error('子目標が残る項目はThunderbirdからの削除を自動適用しません: '+item.title);
  const removedIndexes=new Set(removes.map(x=>x.index));
  for(const index of [...removedIndexes].sort((a,b)=>b-a))lines.splice(index,1);
  const adds=goalOperations.filter(x=>(x.action==='pull'||x.action==='merge')&&!x.local).sort((a,b)=>({year:0,month:1,week:2,todo:3}[a.remote.type]??4)-({year:0,month:1,week:2,todo:3}[b.remote.type]??4));
  for(const operation of adds){
    const normalized=operation.remote;
    const current=core.parseGoals(lines.join('\n'),{assignIds:false});
    insertItem(lines,normalized,current.items);
  }
  let updatedGoals=core.compactGoalIds(lines.join('\n'));
  let taskLines=taskText.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  const taskMap=new Map(taskItems.map(x=>[x.id,x]));
  for(const op of taskOperations.filter(x=>(x.action==='pull'||x.action==='merge')&&x.local)){
    if(!taskMap.has(op.id))continue;
    taskLines=replaceTaskFromThunderbird(taskLines,op.id,op.merged||op.remote,today);
  }
  const taskRemoves=taskOperations.filter(x=>x.action==='deleteLocal').map(x=>taskMap.get(x.id)).filter(Boolean);
  for(const item of taskRemoves){
    const index=taskLines.findIndex(line=>line.match(taskCore.MARKER)?.[1]===item.id);
    if(index<0)continue;
    if(hasTaskDetails(taskLines,index))throw new Error('メモや資料が続くTASKS.md項目は、Thunderbird側からの削除を自動適用しません: '+item.title);
    taskLines.splice(index,1);
  }
  let updatedTasks=taskLines.join('\n');
  const taskAdds=taskOperations.filter(x=>(x.action==='pull'||x.action==='merge')&&!x.local);
  for(const op of taskAdds){
    const item=op.merged||op.remote;
    const date=item.due||today;
    const update={id:item.id,kind:'TASKS',date,section:item.section||'今日やる',text:item.title,done:!!item.done,start:item.time?.split('-')[0]||'',end:item.time?.split('-')[1]||''};
    updatedTasks=taskCore.applyItems({TASKS:updatedTasks,LOG:''},[update],[]).TASKS;
  }
  return {goals:updatedGoals,tasks:updatedTasks};
}
function reportText(operations,errors=[],applied=false){
  const labels={push:'MeryTODOからCalDAVへ反映',pull:'CalDAVからGOALS.mdへ反映',merge:'別項目の変更をマージ',adopt:'変更なし',conflict:'競合・確認が必要',deleteRemote:'CalDAV項目を削除',deleteLocal:'GOALS.md項目を削除',forget:'同期情報を整理'};
  let text='# MeryTODO CalDAV '+(applied?'同期結果':'同期プレビュー')+'\n\n';
  for(const [action,label] of Object.entries(labels))text+='- '+label+': '+operations.filter(x=>x.action===action).length+'件\n';
  text+='\n';
  for(const op of operations.filter(x=>x.action==='conflict'||x.action==='pull'||x.action==='push'||x.action==='merge')){
    const item=op.local||op.remote||op.base?.local;
    text+='## '+labels[op.action]+'\n\n'+(item?.source==='tasks'?'TASKS.md':item?.source==='goals'?'GOALS.md':'')+' / '+(item?.type||'')+' / '+(item?.period||item?.due||'')+' / '+(item?.title||op.id)+'\n\n';
    if(op.action==='conflict'){
      text+='変更箇所: '+(op.conflictFields||[]).join('、')+'\n\n';
      for(const field of op.conflictFields||[])text+='- '+field+': MeryTODO「'+(op.local?.[field]??'')+'」 / Thunderbird「'+(op.remote?.[field]??'')+'」\n';
      text+='\n';
    }
  }
  for(const error of errors)text+='## 要確認\n\n'+error+'\n\n';
  return text;
}
function writeAtomic(file,text){
  const temp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
  fs.writeFileSync(temp,'\uFEFF'+text,'utf8');fs.renameSync(temp,file);
}
function backupAndWrite(file,original,text){
  if(fs.existsSync(file)&&!fs.readFileSync(file).equals(original))throw new Error('同期中にファイルが変更されました: '+file+'。もう一度プレビューしてください。');
  const stamp=new Date().toISOString().replace(/[-:.TZ]/g,'')+'_'+crypto.randomBytes(3).toString('hex');
  fs.writeFileSync(file.replace(/\.md$/i,'_backup_'+stamp+'.md'),original,{flag:'wx'});
  writeAtomic(file,text);
}
function run(options={}){
  const hub=path.resolve(options.hub||DEFAULT_HUB),goalFile=path.join(hub,'GOALS.md'),tasksFile=path.join(hub,'TASKS.md'),dir=path.join(hub,'.mery-calendar');
  const reportPath=path.join(hub,'MERYTODO_CALDAV_REPORT.md');
  fs.mkdirSync(dir,{recursive:true});
  const original=fs.readFileSync(goalFile),source=original.toString('utf8').replace(/^\uFEFF/,''),taskOriginal=fs.readFileSync(tasksFile),taskSource=taskOriginal.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  let previewIdCounter=0;
  const idFactory=options.apply?core.uuid:()=>crypto.createHash('sha256').update(goalFile+'\0'+source+'\0'+(++previewIdCounter)).digest('hex').slice(0,32);
  const parsed=core.parseGoals(source,{assignIds:true,compactPeriodIds:true,idFactory});
  const today=options.today||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const taskIdentityFile=path.join(dir,'caldav-tasks-ids.json');let taskIdentitySnapshots=taskIdentities.load(taskIdentityFile);
  const taskParsed=parseTaskDocument(taskSource,taskIdentitySnapshots,{apply:!!options.apply,file:tasksFile});
  const store=new GoalCalDavStore(path.join(dir,'goals-caldav.sqlite'));
  try{
    const entries=store.state(),resources=store.resources(),remote=[];
    const taskItems=taskParsed.items.filter(item=>item.date>=today||entries[item.id]?.local.source==='tasks');
    const local=[...parsed.items.map(snapshot),...taskItems.map(snapshot)];
    if(new Set(local.map(x=>x.id)).size!==local.length)throw new Error('GOALS.md と TASKS.md で同期IDが重複しています。ID情報を確認してください.');
    for(const resource of resources){
      const item=core.parseIcs(resource.ical)[0];
      if(!item)continue;
      item.href=resource.href;item.etag=resource.etag;
      const localMatch=local.find(x=>x.id===item.id),base=entries[item.id];
      if(localMatch)item.type=localMatch.type;
      else if(base)item.type=base.local.type;
      const normalized=normalizedRemote(item,localMatch||base?.local);
      if(!normalized.parentId&&base)normalized.parentId=base.remote.parentId||base.local.parentId||'';
      normalized.href=resource.href;normalized.uid=item.uid;normalized.etag=resource.etag;
      remote.push(normalized);
    }
    const operations=core.planSync(local,remote,entries),errors=[];
    for(const op of operations){
      if(!op.local&&op.remote&&op.remote.type!=='todo'&&op.action==='pull'){
        op.action='conflict';op.conflictFields=['parentId'];
        errors.push('Thunderbirdで新しく作成された期間目標は、GOALS.mdの階層に親を設定できません: '+op.remote.title);
      }
      if(op.local&&op.remote&&op.local.parentId!==op.remote.parentId&&op.action!=='conflict'){
        op.action='conflict';op.conflictFields=['parentId'];
      }
      if(op.action==='deleteLocal'&&op.local?.source==='tasks'){
        const item=taskParsed.items.find(x=>x.id===op.id),lines=taskParsed.text.split('\n');
        if(item&&hasTaskDetails(lines,item.index)){op.action='conflict';op.conflictFields=['delete'];errors.push('メモや資料が続くTASKS.md項目は、Thunderbird側からの削除を自動適用しません: '+item.title);}
      }
    }
    for(const op of operations.filter(x=>x.action==='conflict')){
      if(op.remote&&!op.local&&op.remote.type!=='todo')errors.push('Thunderbirdから新しく追加された'+op.remote.type+'項目は、Meryの階層に親を設定できません: '+op.remote.title);
      if(op.remote?.parentId&&op.local&&op.remote.parentId!==op.local.parentId)errors.push('上位目標の変更を自動適用できません: '+op.local.title);
    }
    let finalText=parsed.text,finalTasks=taskParsed.text;
    if(options.apply){
      const actionable=operations.filter(x=>x.action!=='conflict');
      const applied=applyRemote(parsed.items,parsed.text,taskItems,taskParsed.text,actionable,today);
      finalText=applied.goals;finalTasks=applied.tasks;
      if(finalText!==source)backupAndWrite(goalFile,original,finalText);
      taskIdentitySnapshots=taskIdentities.checkpoint(taskIdentityFile,finalTasks,taskIdentitySnapshots);
      const visibleTasks=taskIdentities.strip(finalTasks);
      if(visibleTasks!==taskSource)backupAndWrite(tasksFile,taskOriginal,visibleTasks);
      const refreshed=core.parseGoals(finalText,{assignIds:true});
      const refreshedTasks=parseTaskDocument(finalTasks,[],{apply:true,file:tasksFile});
      const current=new Map([...refreshed.items.map(item=>[item.id,snapshot(item)]),...refreshedTasks.items.map(item=>[item.id,snapshot(item)])]);
      const nextState=Object.create(null);
      for(const op of operations){
        if(op.action==='conflict'){if(op.base)nextState[op.id]=op.base;continue;}
        if(op.action==='forget'||op.action==='deleteLocal'||op.action==='deleteRemote'){
          if(op.action==='deleteRemote'&&op.remote?.href)store.delete(op.remote.href);
          continue;
        }
        let localItem=current.get(op.id)||op.local,remoteItem=op.merged||op.remote,href=remoteItem?.href||'';
        if(op.action==='merge'&&op.merged)localItem=op.merged;
        if(op.action==='push'||op.action==='pull'||op.action==='merge'||op.action==='adopt'){
          if(localItem){
            const resourcePath=href||('/calendars/default/MeryTODO/'+encodeURIComponent(core.uidFor(op.id))+'.ics');
            const uid=remoteItem?.uid||core.uidFor(op.id);
            const ical=core.toIcs({...localItem,uid});
            const saved=store.put(resourcePath,{...localItem,uid},ical);
            href=saved.href;
            const stored=store.get(href);remoteItem=core.parseIcs(stored.ical)[0];
          }
        }
        if(localItem&&remoteItem)nextState[op.id]={local:snapshot(localItem),remote:snapshot(normalizedRemote(remoteItem,localItem)),href};
      }
      store.saveState(nextState);
    }
    const report=reportText(operations,errors,!!options.apply);
    writeAtomic(reportPath,report);
    return {operations,errors,reportPath,goalFile,assignedIds:parsed.assignedIds,applied:!!options.apply};
  }finally{store.close();}
}

if(require.main===module){
  const args=process.argv.slice(2),hubIndex=args.indexOf('--hub');
  try{
    const result=run({hub:hubIndex>=0?args[hubIndex+1]:DEFAULT_HUB,apply:args.includes('--apply')});
    console.log(JSON.stringify({applied:result.applied,operations:result.operations.reduce((out,x)=>(out[x.action]=(out[x.action]||0)+1,out),{}),errors:result.errors.length,report:result.reportPath}));
    if(result.errors.length||result.operations.some(x=>x.action==='conflict'))process.exitCode=2;
  }catch(error){console.error(error.stack||error.message);process.exitCode=1;}
}
module.exports={snapshot,normalizedRemote,parseTaskDocument,replaceItemLine,insertItem,applyRemote,reportText,run};
