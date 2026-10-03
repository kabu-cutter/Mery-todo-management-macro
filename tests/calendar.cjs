'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../calendar-sync/calendar-sync-core.cjs');
const {synchronize,decodeFile}=require('../calendar-sync/calendar-sync.cjs');
const {SyncStore}=require('../calendar-sync/calendar-store.cjs');
const {listAll}=require('../calendar-sync/calendar-google.cjs');
const id='1'.repeat(32);
const item={id,kind:'TASKS',date:'2026-10-03',section:'今日やる',text:'資料を確認',done:false,start:'',end:''};
const event=(value=item)=>({id:'a'+value.id,etag:'etag',status:'confirmed',...core.toEvent(value)});
const baseline=value=>({[value.id]:{eventId:'a'+value.id,local:core.fields(value),remote:core.fields(value)}});
const docs=value=>({TASKS:core.applyItems({TASKS:'# TASKS\n',LOG:'# LOG\n'},[value]).TASKS,LOG:'# LOG\n'});
test('parse Japanese dates, completion, times and stable IDs',()=>{
  const source='# TASKS\n\n## 2026-10-03 (土) 今日の作業\n### 今日やる\n- [x] 資料を確認 @09:30-10:30\n- [ ] \n';
  const parsed=core.parseDocument(source,'TASKS',()=>id);
  assert.equal(parsed.items.length,1);
  assert.equal(parsed.items[0].done,true);
  assert.equal(parsed.items[0].start,'09:30');
  assert.equal(core.parseDocument(parsed.text,'TASKS').items[0].id,id);
});
test('ignore fenced examples and undated text; reject malformed tracked entries',()=>{
  assert.equal(core.parseDocument('# TASKS\n- [ ] Undated\n## 2026-10-03 (土) 今日の作業\n```md\n- [ ] Example\n```\n','TASKS').items.length,0);
  assert.throws(()=>core.parseDocument('# TASKS\n- [ ] Lost date <!-- mery-calendar:'+id+' -->','TASKS'));
  assert.throws(()=>core.parseDocument('## 2026-10-03 (土) 今日の作業\n- [ ] invalid @12:00-09:00','TASKS'));
});
test('all-day and timed events round trip, including completion and UTC conversion',()=>{
  for(const value of [item,{...item,done:true,start:'09:00',end:'10:00'},{...item,kind:'LOG',section:'調査結果'}]) assert.ok(core.equal(value,core.fromEvent(event(value),'primary')));
  const timed=event({...item,start:'09:00',end:'10:00'});
  timed.start.dateTime='2026-10-03T00:00:00Z';timed.end.dateTime='2026-10-03T01:00:00Z';
  assert.equal(core.fromEvent(timed,'primary').start,'09:00');
});
test('unsupported multiday and recurring events become conflicts',()=>{
  for(const change of [{recurrence:['RRULE:FREQ=DAILY']},{end:{date:'2026-10-05'}}]) {
    const remote=core.fromEvent({...event(),...change},'primary');
    assert.ok(remote.unsupported);
    assert.equal(core.planSync([item],[remote],baseline(item))[0].action,'conflict');
  }
});
test('three-way merge handles updates, deletes, matching edits and true conflicts',()=>{
  const remote=core.fromEvent(event(),'primary');
  const changed={...item,text:'変更した資料'};
  const cases=[[[item],[remote],{},'adopt'],[[item],[],{},'createRemote'],[[],[remote],{},'pull'],[[changed],[remote],baseline(item),'push'],[[item],[{...remote,text:'変更した資料'}],baseline(item),'pull'],[[changed],[{...remote,text:'他の変更'}],baseline(item),'conflict'],[[changed],[{...remote,text:changed.text}],baseline(item),'adopt'],[[],[remote],baseline(item),'deleteRemote'],[[item],[{...remote,deleted:true}],baseline(item),'deleteLocal'],[[changed],[{...remote,deleted:true}],baseline(item),'conflict'],[[],[],baseline(item),'forget']];
  for(const [l,r,b,expected] of cases) assert.equal(core.planSync(l,r,b)[0].action,expected);
});
test('duplicate IDs fail before mutation',()=>{
  assert.throws(()=>core.parseDocument('## 2026-10-03 (土) 今日の作業\n'+core.applyItems({TASKS:'# TASKS\n',LOG:'# LOG\n'},[item]).TASKS+'\n- [ ] second <!-- mery-calendar:'+id+' -->','TASKS'));
  assert.throws(()=>core.planSync([item],[core.fromEvent(event(),'primary'),core.fromEvent(event(),'primary')]));
});
test('pull moves date and document without losing unrelated notes',()=>{
  const documents=docs(item);documents.TASKS+='\n## 未整理\nKeep this\n';documents.LOG+='\n## 2026-10-02 (金) 作業ログ\n### メモ\n- Old log\n';
  const updated={...item,kind:'LOG',date:'2026-10-04',section:'調査結果',text:'移動した項目'};
  const result=core.applyItems(documents,[updated]);
  assert.ok(result.TASKS.includes('Keep this'));
  assert.ok(!result.TASKS.includes('mery-calendar:'+id));
  assert.ok(result.LOG.includes('Old log'));
  const parsed=core.parseDocument(result.LOG,'LOG').items.find(x=>x.id===id);
  assert.ok(core.equal(parsed,updated));
});
test('existing main-calendar appointments are ignored; labelled new events import',async()=>{
  const events=[{id:'unrelated',summary:'通常の会議',start:{date:'2026-10-03'},end:{date:'2026-10-04'}},{id:'newtask',summary:'[TASKS] 電話する',start:{date:'2026-10-03'},end:{date:'2026-10-04'}}];
  const result=await synchronize({TASKS:'# TASKS\n',LOG:'# LOG\n'},{entries:{}},events,null,'primary',false);
  assert.equal(result.operations.length,1);assert.equal(result.operations[0].action,'pull');
});
test('preview sends no mutations and changes no documents',async()=>{
  const documents=docs(item);let calls=0;
  const result=await synchronize(documents,{entries:{}},[],{request:()=>{calls++;}},'primary',false);
  assert.equal(calls,0);assert.deepEqual(result.documents,documents);assert.equal(result.operations[0].action,'createRemote');
});
test('create uses stable valid event ID and retry adopts it',async()=>{
  let created;
  const api={request:async(method,url,body)=>{assert.equal(method,'POST');assert.match(body.id,/^[0-9a-v]+$/);created={...body,etag:'new'};return created;}};
  const result=await synchronize(docs(item),{entries:{}},[],api,'primary',true);
  assert.equal(result.state.entries[id].eventId,'a'+id);
  const retry=await synchronize(docs(item),{entries:{}},[created],{request:()=>{throw new Error('must not write')}},'primary',true);
  assert.equal(retry.operations[0].action,'adopt');
});
test('patch preserves unrelated Google fields and uses ETag',async()=>{
  const changed={...item,text:'変更後'};let called=false;
  const api={request:async(method,url,body,etag)=>{called=true;assert.equal(method,'PATCH');assert.equal(etag,'etag');assert.ok(!('attendees' in body)&&!('description' in body));return {...event(changed),etag:'next'};}};
  const result=await synchronize(docs(changed),{entries:baseline(item)},[event()],api,'primary',true);
  assert.ok(called);assert.equal(result.state.entries[id].local.text,'変更後');
});
test('HTTP failure preserves previous synchronization baseline',async()=>{
  const result=await synchronize(docs({...item,text:'new'}),{entries:baseline(item)},[event()],{request:async()=>{throw new Error('HTTP 412')}},'primary',true);
  assert.equal(result.errors.length,1);assert.deepEqual(result.state.entries[id],baseline(item)[id]);
});
test('remote deletion and local deletion propagate separately',async()=>{
  const deleted={id:'a'+id,status:'cancelled'};
  const pulled=await synchronize(docs(item),{entries:baseline(item)},[deleted],null,'primary',true);
  assert.ok(!pulled.documents.TASKS.includes(id));assert.ok(!pulled.state.entries[id]);
  let removed=false;
  const pushed=await synchronize({TASKS:'# TASKS\n',LOG:'# LOG\n'},{entries:baseline(item)},[event()],{request:async(method,url,body,etag)=>{assert.equal(method,'DELETE');assert.equal(etag,'etag');removed=true;}},'primary',true);
  assert.ok(removed);assert.ok(!pushed.state.entries[id]);
});
test('remote edits pull, both-side edits stay intact as conflicts',async()=>{
  const remote={...item,text:'Google側の変更'};
  const pulled=await synchronize(docs(item),{entries:baseline(item)},[event(remote)],null,'primary',true);
  assert.ok(pulled.documents.TASKS.includes(remote.text));
  const conflict=await synchronize(docs({...item,text:'Mery側の変更'}),{entries:baseline(item)},[event(remote)],{request:()=>{throw new Error('must not write')}},'primary',true);
  assert.ok(conflict.documents.TASKS.includes('Mery側の変更'));assert.equal(conflict.operations[0].action,'conflict');
});
test('calendar switch refuses existing mappings',async()=>{
  await assert.rejects(()=>synchronize(docs(item),{calendarId:'other',entries:baseline(item)},[],null,'primary',true));
});
test('pagination reads all events including deletion records',async()=>{
  let count=0;
  const events=await listAll({request:async(method,url)=>{assert.match(url,/showDeleted=true/);count++;return count===1?{items:[{id:'first'}],nextPageToken:'second'}:{items:[{id:'deleted',status:'cancelled'}]};}},'primary');
  assert.equal(count,2);assert.equal(events.length,2);
});
test('SQLite persists mappings and conflicts with atomic rollback and bound SQL values',()=>{
  const store=new SyncStore(':memory:');
  try {
    const state={calendarId:'primary',entries:baseline({...item,text:"It's safe; DROP TABLE sync_items;"})};
    const result={operations:[{id,action:'conflict',local:item,remote:{...item,text:'remote'}}],errors:[]};
    store.save(state,result);assert.equal(store.load().entries[id].local.text,state.entries[id].local.text);
    assert.equal(store.db.prepare('select count(*) as n from conflicts').get().n,1);
    const invalid={calendarId:'primary',entries:{...state.entries,['2'.repeat(32)]:state.entries[id]}};
    assert.throws(()=>store.save(invalid,result));
    assert.equal(Object.keys(store.load().entries).length,1);
    assert.equal(store.db.prepare('select count(*) as n from sync_runs').get().n,1);
  } finally {store.close();}
});
test('UTF-8 and legacy UTF-16 file decoding',()=>{
  const text='# TASKS\n日本語\n';
  const be=Buffer.from(text,'utf16le');be.swap16();
  for(const bytes of [Buffer.from(text),Buffer.from('\uFEFF'+text),Buffer.from('\uFEFF'+text,'utf16le'),Buffer.concat([Buffer.from([254,255]),be])]) assert.equal(decodeFile(bytes),text);
});
