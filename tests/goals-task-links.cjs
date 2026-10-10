'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../calendar-sync/goals-caldav-core.cjs');
const taskCore=require('../calendar-sync/calendar-sync-core.cjs');
const sync=require('../calendar-sync/goals-caldav-sync.cjs');
const {GoalCalDavStore}=require('../calendar-sync/goals-caldav-store.cjs');

const goalId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',taskId='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const goals='## 2026年\n- [ ] 2026年 Annual <!--g:1-->\n  - [ ] 2026-10 Month <!--g:2-->\n    - [ ] 2026-W41 Week <!--g:3-->\n      - [x] Updated action <!--g:4-->\n\n<!-- mery-goal-id-map\n1=11111111111111111111111111111111\n2=22222222222222222222222222222222\n3=33333333333333333333333333333333\n4='+goalId+'\n-->\n';
const tasks='# TASKS\n## 2026-10-08 (木) 今日の作業\n### 置く\n- [ ] Old action <!-- mery-calendar:'+taskId+' -->\n';
const linked=[{goalId,taskId,initialSource:'goals'}];

test('explicit first link copies GOALS title and completion to TASKS without changing either ID',()=>{
  const result=sync.reconcileGoalTaskLinks(goals,tasks,linked,'2026-10-08');
  assert.match(result.tasks,/- \[x\] Updated action <!-- mery-calendar:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb -->/);
  assert.equal(core.parseGoals(result.goals,{assignIds:false}).items.at(-1).id,goalId);
  assert.equal(taskCore.parseDocument(result.tasks,'TASKS').items[0].id,taskId);
  assert.deepEqual(result.links[0].base,{title:'Updated action',done:true});
});

test('later TASKS edits propagate back to GOALS, and simultaneous divergent edits stop',()=>{
  const first=sync.reconcileGoalTaskLinks(goals,tasks,linked,'2026-10-08');
  const edited=first.tasks.replace('Updated action','Edited in TASKS').replace('- [x]','- [ ]');
  const second=sync.reconcileGoalTaskLinks(first.goals,edited,first.links,'2026-10-08');
  assert.match(second.goals,/\[ \] Edited in TASKS <!--g:4-->/);
  assert.throws(()=>sync.reconcileGoalTaskLinks(first.goals.replace('Updated action','Edited in GOALS'),edited,first.links,'2026-10-08'),/別々に変更/);
});

test('linked TASKS item retires its separate CalDAV ToDo while keeping both local lines',()=>{
  const hub=fs.mkdtempSync(path.join(__dirname,'.goal-link-test-'));
  try{
    const dir=path.join(hub,'.mery-calendar');fs.mkdirSync(dir);
    fs.writeFileSync(path.join(hub,'GOALS.md'),goals);
    fs.writeFileSync(path.join(hub,'TASKS.md'),tasks);
    fs.writeFileSync(path.join(dir,'goals-task-links.json'),JSON.stringify({version:1,links:linked}));
    const store=new GoalCalDavStore(path.join(dir,'goals-caldav.sqlite'));
    const old={id:taskId,type:'todo',source:'tasks',section:'置く',date:'2026-10-08',title:'Old action',done:false,due:'2026-10-08',parentId:''};
    const href='/calendars/default/MeryTODO/'+encodeURIComponent(core.uidFor(taskId))+'.ics';
    store.put(href,old,core.toIcs(old));
    store.saveState({[taskId]:{local:sync.snapshot(old),remote:sync.snapshot(old),href}});
    store.close();
    const result=sync.run({hub,apply:true,today:'2026-10-08'});
    assert.equal(result.errors.length,0);
    assert.ok(result.operations.some(op=>op.id===taskId&&op.action==='deleteRemote'));
    assert.match(fs.readFileSync(path.join(hub,'TASKS.md'),'utf8'),/- \[x\] Updated action/);
    assert.equal(core.parseGoals(fs.readFileSync(path.join(hub,'GOALS.md'),'utf8'),{assignIds:false}).items.at(-1).id,goalId);
    const check=new GoalCalDavStore(path.join(dir,'goals-caldav.sqlite'));
    assert.equal(check.byUid(core.uidFor(taskId)),null);
    assert.ok(check.byUid(core.uidFor(goalId)));
    check.close();
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'goals-task-links.json'),'utf8')).links[0].base,{title:'Updated action',done:true});
  }finally{
    if(path.dirname(hub)===__dirname&&path.basename(hub).startsWith('.goal-link-test-'))fs.rmSync(hub,{recursive:true,force:true});
  }
});

test('only the latest dated copy of a TASKS ToDo remains in CalDAV',()=>{
  const hub=fs.mkdtempSync(path.join(__dirname,'.goal-link-test-'));
  const oldId='c'.repeat(32),newId='d'.repeat(32);
  try{
    const dir=path.join(hub,'.mery-calendar');fs.mkdirSync(dir);
    fs.writeFileSync(path.join(hub,'GOALS.md'),goals);
    fs.writeFileSync(path.join(hub,'TASKS.md'),'# TASKS\n## 2026-10-10 (土) 今日の作業\n### 今日やる\n- [ ] Same task <!-- mery-calendar:'+newId+' -->\n## 2026-10-08 (木) 今日の作業\n### 今日やる\n- [ ] Same task <!-- mery-calendar:'+oldId+' -->\n');
    const store=new GoalCalDavStore(path.join(dir,'goals-caldav.sqlite'));
    const old={id:oldId,type:'todo',source:'tasks',section:'今日やる',date:'2026-10-08',title:'Same task',done:false,due:'2026-10-08',parentId:''};
    const href='/calendars/default/MeryTODO/'+encodeURIComponent(core.uidFor(oldId))+'.ics';
    store.put(href,old,core.toIcs(old));
    store.saveState({[oldId]:{local:sync.snapshot(old),remote:sync.snapshot(old),href}});
    store.close();
    const result=sync.run({hub,apply:true,today:'2026-10-10'});
    assert.equal(result.errors.length,0);
    assert.ok(result.operations.some(op=>op.id===oldId&&op.action==='deleteRemote'));
    assert.ok(result.operations.some(op=>op.id===newId&&op.action==='push'));
    assert.equal((fs.readFileSync(path.join(hub,'TASKS.md'),'utf8').match(/Same task/g)||[]).length,2);
    const check=new GoalCalDavStore(path.join(dir,'goals-caldav.sqlite'));
    assert.equal(check.byUid(core.uidFor(oldId)),null);
    assert.ok(check.byUid(core.uidFor(newId)));
    check.close();
  }finally{
    if(path.dirname(hub)===__dirname&&path.basename(hub).startsWith('.goal-link-test-'))fs.rmSync(hub,{recursive:true,force:true});
  }
});
