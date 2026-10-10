'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {GoalCalDavStore}=require('./goals-caldav-store.cjs');
const taskCore=require('./calendar-sync-core.cjs');
const taskIdentities=require('./task-identities.cjs');
const core=require('./goals-caldav-core.cjs');

const DEFAULT_HUB='C:\\Projects\\ai-work-hub';
function snapshot(item){return {id:item.id,type:item.type,source:item.source||'goals',section:item.section||'',category:item.category||'',date:item.date||'',title:item.title,description:item.description||'',location:item.location||'',done:!!item.done,period:item.period||'',start:item.start||'',startTime:item.startTime||'',end:item.end||'',endTime:item.endTime||'',due:item.due||'',time:item.time||'',parentId:item.parentId||''};}
function normalizedRemote(item,localOrBase){
  const result={...item};
  if(localOrBase){result.type=localOrBase.type;result.source=localOrBase.source||'goals';if(!result.section)result.section=localOrBase.section||'';result.category=localOrBase.category||'';}
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
  const items=parsed.items.map(item=>{
    const stamp=parseMeryTimestampSuffix(item.text);
    return stamp?{...item,text:stamp.title,timeSource:'mery-timestamp',recordedStart:stamp.start,recordedEnd:stamp.end||''}:{...item,timeSource:''};
  });
  const byDate=new Map();
  for(const item of items)if(item.timeSource){if(!byDate.has(item.date))byDate.set(item.date,[]);byDate.get(item.date).push(item);}
  const timeNotes=[];
  for(const [date,records] of byDate){
    for(let i=0;i<records.length;i++){
      const item=records[i];
      let end=item.recordedEnd;
      if(!end){
        const endMinutes=Number(item.recordedStart.slice(0,2))*60+Number(item.recordedStart.slice(3))+30;
        if(endMinutes>=1440)throw new Error('終了時刻のないTASKS.mdのTODOに30分枠を設定すると翌日になります。終了時刻を明記してください: '+date+' / '+item.text);
        end=String(Math.floor(endMinutes/60)).padStart(2,'0')+':'+String(endMinutes%60).padStart(2,'0');
      }
      if(item.recordedStart>=end)throw new Error('TASKS.mdの時刻付きTODOは開始・終了が同日内で、開始 < 終了である必要があります: '+date+' / '+item.text);
      item.start=item.recordedStart;item.end=end;
    }
    const intervals=records.filter(item=>item.start&&item.end).sort((a,b)=>a.start.localeCompare(b.start));
    for(let i=1;i<intervals.length;i++)if(intervals[i].start<intervals[i-1].end)throw new Error('TASKS.mdの時刻付きTODOが重なっています。時刻を確認してください: '+date+' / '+intervals[i-1].text+' / '+intervals[i].text);
  }
  let section='',category='';const categories=new Map();
  for(const [index,line] of parsed.text.split('\n').entries()){
    if(/^##\s/.test(line)){section='';category='';continue;}
    const sub=line.match(/^###\s+(.+?)\s*$/);
    if(sub){section=sub[1];category='';continue;}
    const tag=line.match(/^####(?!#)\s*(.+?)\s*$/);
    if(tag){category=tag[1].trim();continue;}
    if(/^#{1,2}\s/.test(line)){category='';continue;}
    if(section&&/^[-*]\s+\[[ xX]\]/.test(line))categories.set(index,category);
  }
  return {text:parsed.text,timeNotes,items:items.map(item=>({id:item.id,type:'todo',source:'tasks',section:item.section,category:categories.get(item.index)||'',date:item.date,title:item.text,done:item.done,period:'',start:'',end:'',due:item.date||'',time:item.start&&item.end?item.start+'-'+item.end:'',timeSource:item.timeSource||'',parentId:'',index:item.index,taskKind:'TASKS',taskStart:item.start,taskEnd:item.end}))};
}
function parseMeryTimestampSuffix(value){
  const stamp='(\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\s+\\d{1,2}:\\d{2}\\s+[AP]M)';
  const match=new RegExp('\\s+'+stamp+'(?:\\s+[-–—]\\s+'+stamp+')?\\s*$','i').exec(String(value));
  if(!match)return null;
  const parse=raw=>{
    const parts=/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+([AP]M)$/i.exec(raw);
    if(!parts)throw new Error('Meryの時刻形式を読み取れません: '+raw);
    const month=Number(parts[1]),day=Number(parts[2]),year=Number(parts[3]),hour=Number(parts[4]),minute=Number(parts[5]);
    const date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||hour<1||hour>12||minute>59)throw new Error('Meryの時刻が不正です: '+raw);
    const hour24=(hour%12)+(parts[6].toUpperCase()==='PM'?12:0);
    const rounded=Math.floor((hour24*60+minute+15)/30)*30;
    if(rounded>=1440)throw new Error('Meryの時刻を30分単位に丸めると翌日になります。日をまたぐ時刻は対応していません: '+raw);
    return String(Math.floor(rounded/60)).padStart(2,'0')+':'+String(rounded%60).padStart(2,'0');
  };
  return {raw:match[0].trim(),title:String(value).slice(0,match.index).trim(),start:parse(match[1]),end:match[2]?parse(match[2]):''};
}
function attachLinkedTaskCategories(goalItems,taskItems,links){
  const tasks=new Map(taskItems.map(item=>[item.id,item]));
  for(const link of links){const goal=goalItems.find(item=>item.id===link.goalId),task=tasks.get(link.taskId);if(goal&&task)goal.category=task.category||'';}
  return goalItems;
}
function taskCategoryAt(lines,index){
  let category='';
  for(let i=0;i<=index&&i<lines.length;i++){
    if(/^##\s/.test(lines[i])||/^###\s/.test(lines[i]))category='';
    else {const tag=lines[i].match(/^####(?!#)\s*(.*?)\s*$/);if(tag)category=tag[1].trim();}
  }
  return category;
}
function insertTaskCategoryBlock(lines,date,section,category,block){
  if(!category){
    const marker=block[0].match(taskCore.MARKER)?.[1];
    const index=lines.findIndex(line=>line.match(taskCore.MARKER)?.[1]===marker);
    if(index<0)throw new Error('移動したTASKS.md項目を確認できません。');
    lines.splice(index,0,...block);return lines;
  }
  const day=lines.findIndex(line=>new RegExp('^##\\s+'+date+'(?:\\s|$)').test(line));
  if(day<0)throw new Error('カテゴリ反映先の日付がTASKS.mdにありません: '+date);
  let dayEnd=lines.findIndex((line,index)=>index>day&&/^##\s/.test(line));if(dayEnd<0)dayEnd=lines.length;
  const sectionIndex=lines.findIndex((line,index)=>index>day&&index<dayEnd&&line.trim()==='### '+section);
  if(sectionIndex<0)throw new Error('カテゴリ反映先の欄がTASKS.mdにありません: '+section);
  let sectionEnd=lines.findIndex((line,index)=>index>sectionIndex&&index<dayEnd&&(/^###\s/.test(line)||/^---+\s*$/.test(line)));if(sectionEnd<0)sectionEnd=dayEnd;
  let categoryIndex=-1;
  for(let i=sectionIndex+1;i<sectionEnd;i++){
    const tag=lines[i].match(/^####(?!#)\s*(.*?)\s*$/);
    if(tag&&tag[1].trim()===category){categoryIndex=i;break;}
  }
  if(categoryIndex>=0){
    let end=lines.findIndex((line,index)=>index>categoryIndex&&index<sectionEnd&&(/^####(?!#)/.test(line)||/^###\s/.test(line)||/^---+\s*$/.test(line)));if(end<0)end=sectionEnd;
    while(end>categoryIndex+1&&!lines[end-1].trim())end--;
    lines.splice(end,0,...block);
  }else{
    let end=sectionEnd;while(end>sectionIndex+1&&!lines[end-1].trim())end--;
    lines.splice(end,0,'','#### '+category,...block,'');
  }
  return lines;
}
function replaceItemLine(lines,item,remote){
  const body=remote.type==='year'?remote.period+'年 '+remote.title:
    remote.type==='month'?remote.period+' '+remote.title:
    remote.type==='week'?remote.period+' '+remote.title:
    remote.title+(remote.time?' @'+remote.time:'')+(remote.due?' <!-- mery-due:'+remote.due+' -->':'');
  const extras=item.comments.filter(comment=>!/^<!--\s*(?:mery-(?:due|goal-id)|g):/i.test(comment));
  const suffix=' '+core.goalIdComment(item.id,remote.type)+(extras.length?' '+extras.join(' '):'');
  const check=remote.type==='todo'?(remote.done?'x':' '):(item.done?'x':' ');
  lines[item.index]=item.prefix.replace(/\[[ xX\u3000]\]/,'['+check+']')+body+suffix;
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
  const meryStamp=parseMeryTimestampSuffix(current.text);
  const currentCategory=taskCategoryAt(lines,current.index);
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
    if(meryStamp)moved[newIndex]=formatTaskLine(moved[newIndex],remote,meryStamp,id);
    moved.splice(newIndex+1,0,...attached);
    if(currentCategory){const block=moved.splice(newIndex,1+attached.length);insertTaskCategoryBlock(moved,date,section,currentCategory,block);}
    return moved;
  }
  lines[current.index]=formatTaskLine(lines[current.index],remote,meryStamp,id);
  return lines;
}
function formatTaskLine(original,remote,meryStamp,id){
  const prefix=original.match(/^([-*]\s+)\[[ xX]\]\s*/);
  if(!prefix)throw new Error('TASKS.mdの同期対象行を更新できません: '+id);
  const suffix=meryStamp?' '+meryStamp.raw:(remote.time?' @'+remote.time:'');
  return prefix[1]+'['+(remote.done?'x':' ')+'] '+remote.title+suffix+' <!-- mery-calendar:'+id+' -->';
}
function loadGoalTaskLinks(file){
  if(!fs.existsSync(file))return [];
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(data.version!==1||!Array.isArray(data.links))throw new Error('GOALS/TASKSの連動IDファイルが不正です。');
  const goals=new Set(),tasks=new Set();
  for(const link of data.links){
    if(!/^[a-f0-9]{32}$/.test(link.goalId||'')||!/^[a-f0-9]{32}$/.test(link.taskId||'')||goals.has(link.goalId)||tasks.has(link.taskId)||
      (link.initialSource!=='goals'&&(!link.base||typeof link.base.title!=='string'||typeof link.base.done!=='boolean')))
      throw new Error('GOALS/TASKSの連動IDが不正または重複しています。');
    goals.add(link.goalId);tasks.add(link.taskId);
  }
  return data.links;
}
function reconcileGoalTaskLinks(goalText,taskText,links,today){
  const goals=core.parseGoals(goalText,{assignIds:false}),tasks=taskCore.parseDocument(taskText,'TASKS');
  const goalLines=goals.text.split('\n');let taskLines=tasks.text.split('\n');
  const next=[],changes=[];
  for(const link of links){
    const goal=goals.items.find(x=>x.id===link.goalId),task=tasks.items.find(x=>x.id===link.taskId);
    if(!goal||goal.type!=='todo'||!task)throw new Error('連動対象のGOALS.mdまたはTASKS.mdの行が見つかりません。IDを確認してください。');
    const g={title:goal.title,done:goal.done},t={title:task.text,done:task.done};
    const gc=!link.base||JSON.stringify(g)!==JSON.stringify(link.base);
    const tc=!link.base||JSON.stringify(t)!==JSON.stringify(link.base);
    if(link.initialSource!=='goals'&&gc&&tc&&JSON.stringify(g)!==JSON.stringify(t))
      throw new Error('GOALS.mdとTASKS.mdで同じ連動ToDoを別々に変更しています: '+g.title+' / '+t.title);
    const selected=link.initialSource==='goals'||gc?g:tc?t:link.base;
    if(JSON.stringify(g)!==JSON.stringify(selected)){
      replaceItemLine(goalLines,goal,{...goal,...selected});
      changes.push('GOALS.mdへ反映: '+selected.title);
    }
    if(JSON.stringify(t)!==JSON.stringify(selected)){
      taskLines=replaceTaskFromThunderbird(taskLines,task.id,{title:selected.title,done:selected.done,due:task.date,section:task.section,time:task.start&&task.end?task.start+'-'+task.end:''},today);
      changes.push('TASKS.mdへ反映: '+selected.title);
    }
    next.push({goalId:link.goalId,taskId:link.taskId,base:selected});
  }
  return {goals:core.compactGoalIds(goalLines.join('\n')),tasks:taskLines.join('\n'),links:next,changes};
}
function saveGoalTaskLinks(file,links){
  const temp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
  fs.writeFileSync(temp,JSON.stringify({version:1,links},null,2),'utf8');
  fs.renameSync(temp,file);
}
function selectLatestTaskItems(items){
  const latest=new Map();
  for(const item of items){
    const title=item.title.replace(/\s+/g,' ').trim();
    if(!latest.has(title)||item.date>latest.get(title))latest.set(title,item.date);
  }
  return items.filter(item=>item.date===latest.get(item.title.replace(/\s+/g,' ').trim()));
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
    if(item.category){const lines=updatedTasks.split('\n'),index=lines.findIndex(line=>line.match(taskCore.MARKER)?.[1]===item.id);if(index<0)throw new Error('新しいThunderbird ToDoをTASKS.mdで確認できません: '+item.title);const block=lines.splice(index,1);insertTaskCategoryBlock(lines,date,update.section,item.category,block);updatedTasks=lines.join('\n');}
  }
  return {goals:updatedGoals,tasks:updatedTasks};
}
function reportText(operations,errors=[],applied=false,timeNotes=[]){
  const labels={push:'MeryTODOからCalDAVへ反映',pull:'CalDAVからGOALS.mdへ反映',merge:'別項目の変更をマージ',adopt:'変更なし',conflict:'競合・確認が必要',deleteRemote:'CalDAV項目を削除',deleteLocal:'GOALS.md項目を削除',forget:'同期情報を整理'};
  let text='# MeryTODO CalDAV '+(applied?'同期結果':'同期プレビュー')+'\n\n';
  for(const [action,label] of Object.entries(labels))text+='- '+label+': '+operations.filter(x=>x.action===action).length+'件\n';
  text+='\n';
  for(const op of operations.filter(x=>['conflict','pull','push','merge','deleteRemote','deleteLocal'].includes(x.action))){
    const item=op.local||op.remote||op.base?.local;
    text+='## '+labels[op.action]+'\n\n'+(item?.source==='tasks'?'TASKS.md':item?.source==='goals'?'GOALS.md':'')+' / '+(item?.type||'')+' / '+(item?.period||item?.due||'')+' / '+(item?.title||op.id)+'\n\n';
    if(op.action==='conflict'){
      text+='変更箇所: '+(op.conflictFields||[]).join('、')+'\n\n';
      for(const field of op.conflictFields||[])text+='- '+field+': MeryTODO「'+(op.local?.[field]??'')+'」 / Thunderbird「'+(op.remote?.[field]??'')+'」\n';
      text+='\n';
    }
  }
  if(timeNotes.length)text+='## 時刻記録メモ\n\n'+timeNotes.map(note=>'- '+note).join('\n')+'\n\n';
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
  let parsed=core.parseGoals(source,{assignIds:true,compactPeriodIds:true,idFactory});
  const assignedIds=parsed.assignedIds;
  const today=options.today||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const taskIdentityFile=path.join(dir,'caldav-tasks-ids.json');let taskIdentitySnapshots=taskIdentities.load(taskIdentityFile);
  let taskParsed=parseTaskDocument(taskSource,taskIdentitySnapshots,{apply:!!options.apply,file:tasksFile});
  const linksFile=path.join(dir,'goals-task-links.json'),links=loadGoalTaskLinks(linksFile);
  let linked;
  try{linked=reconcileGoalTaskLinks(parsed.text,taskParsed.text,links,today);}
  catch(error){writeAtomic(reportPath,reportText([],[error.message],false));return {operations:[],errors:[error.message],reportPath,goalFile,assignedIds,applied:false};}
  parsed=core.parseGoals(linked.goals,{assignIds:false});
  taskParsed=parseTaskDocument(linked.tasks,[],{apply:!!options.apply,file:tasksFile});
  attachLinkedTaskCategories(parsed.items,taskParsed.items,links);
  const linkedTaskIds=new Set(links.map(link=>link.taskId));
  const store=new GoalCalDavStore(path.join(dir,'goals-caldav.sqlite'));
  try{
    const entries=store.state(),resources=store.resources(),remote=[];
    const taskItems=selectLatestTaskItems(taskParsed.items).filter(item=>!linkedTaskIds.has(item.id)&&(item.date>=today||entries[item.id]?.local.source==='tasks'));
    const local=[...parsed.items.map(snapshot),...taskItems.map(snapshot)];
    if(new Set(local.map(x=>x.id)).size!==local.length)throw new Error('GOALS.md と TASKS.md で同期IDが重複しています。ID情報を確認してください.');
    for(const resource of resources){
      const item=core.parseIcs(resource.ical)[0];
      if(!item)continue;
      // Standalone events are managed directly in the CalDAV calendar, not in GOALS.md/TASKS.md.
      // Keep them stored and visible to Thunderbird while excluding them from Markdown reconciliation.
      if(item.source==='standalone'&&item.type==='event')continue;
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
    const timestampTaskIds=new Set(taskParsed.items.filter(item=>item.timeSource==='mery-timestamp').map(item=>item.id));
    for(const op of operations){
      if(timestampTaskIds.has(op.id)&&op.remote&&op.base&&op.remote.time!==op.base.remote.time){
        op.action='conflict';op.conflictFields=['time'];
        errors.push('Meryの時刻記録から作った時間がThunderbird側で変更されています。TASKS.mdの時刻を編集して再同期してください: '+(op.local?.title||op.remote.title));
      }
    }
    for(const op of operations){
      if(linkedTaskIds.has(op.id)){
        if(op.remote&&(!op.base||!core.equal(op.remote,op.base.remote))){op.action='conflict';op.conflictFields=['linkedTask'];errors.push('連動前のTASKS.md側ToDoがThunderbirdで変更されています。統合を保留します: '+op.remote.title);}
        else op.action=op.remote?'deleteRemote':'forget';
        continue;
      }
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
    if(options.apply&&operations.some(op=>linkedTaskIds.has(op.id)&&op.action==='conflict')){
      writeAtomic(reportPath,reportText(operations,errors,false));
      return {operations,errors,reportPath,goalFile,assignedIds,applied:false};
    }
    let finalText=parsed.text,finalTasks=taskParsed.text,linkChanges=[...linked.changes];
    if(options.apply){
      const actionable=operations.filter(x=>x.action!=='conflict');
      const applied=applyRemote(parsed.items,parsed.text,taskItems,taskParsed.text,actionable,today);
      const relinked=reconcileGoalTaskLinks(applied.goals,applied.tasks,links,today);
      finalText=relinked.goals;finalTasks=relinked.tasks;linkChanges.push(...relinked.changes);
      if(finalText!==source)backupAndWrite(goalFile,original,finalText);
      taskIdentitySnapshots=taskIdentities.checkpoint(taskIdentityFile,finalTasks,taskIdentitySnapshots);
      const visibleTasks=taskIdentities.strip(finalTasks);
      if(visibleTasks!==taskSource)backupAndWrite(tasksFile,taskOriginal,visibleTasks);
      const refreshedTasks=parseTaskDocument(finalTasks,[],{apply:true,file:tasksFile});
      const refreshed=core.parseGoals(finalText,{assignIds:true});
      attachLinkedTaskCategories(refreshed.items,refreshedTasks.items,links);
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
      if(links.length)saveGoalTaskLinks(linksFile,relinked.links);
    }
    let report=reportText(operations,errors,!!options.apply);
    if(linkChanges.length)report+='## GOALS.md / TASKS.md の連動\n\n'+[...new Set(linkChanges)].map(x=>'- '+x).join('\n')+'\n';
    writeAtomic(reportPath,report);
    return {operations,errors,reportPath,goalFile,assignedIds,applied:!!options.apply};
  }finally{store.close();}
}

if(require.main===module){
  const args=process.argv.slice(2),hubIndex=args.indexOf('--hub');
  try{
    const result=run({hub:hubIndex>=0?args[hubIndex+1]:DEFAULT_HUB,apply:args.includes('--apply')});
    console.log(JSON.stringify({applied:result.applied,operations:result.operations.reduce((out,x)=>(out[x.action]=(out[x.action]||0)+1,out),{}),errors:result.errors.length,report:result.reportPath}));
    if(result.errors.length||result.operations.some(x=>x.action==='conflict'))process.exitCode=2;
  }catch(error){
    console.error(error.stack||error.message);
    try{
      const hub=path.resolve(hubIndex>=0?args[hubIndex+1]:DEFAULT_HUB);
      writeAtomic(path.join(hub,'MERYTODO_CALDAV_REPORT.md'),'# MeryTODO CalDAV 同期エラー\n\n'+error.message+'\n');
    }catch(reportError){console.error('同期エラーをレポートに記録できませんでした: '+reportError.message);}
    process.exitCode=1;
  }
}
module.exports={snapshot,normalizedRemote,parseTaskDocument,parseMeryTimestampSuffix,replaceTaskFromThunderbird,replaceItemLine,insertItem,reconcileGoalTaskLinks,selectLatestTaskItems,applyRemote,reportText,run};
