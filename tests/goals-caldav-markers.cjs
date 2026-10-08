'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../calendar-sync/goals-caldav-core.cjs');
const sync=require('../calendar-sync/goals-caldav-sync.cjs');

const ids=[
  '0123456789abcdef0123456789abcdef',
  '11111111111111111111111111111111',
  '22222222222222222222222222222222',
  '33333333333333333333333333333333'
];
const source='## 2026年\n'+
  '- [ ] 2026年 Annual <!-- mery-goal-id:'+ids[0]+' -->\n'+
  '  - [ ] 2026-10 Month <!-- mery-goal-id:'+ids[1]+' -->\n'+
  '    - [ ] 2026-W41 Week <!-- mery-goal-id:'+ids[2]+' -->\n'+
  '      - [ ] Action <!-- mery-goal-id:'+ids[3]+' -->\n';

test('short references preserve full sync IDs for periods and action TODOs',()=>{
  const before=core.parseGoals(source,{assignIds:false});
  const compact=core.parseGoals(source,{assignIds:false,compactPeriodIds:true});
  assert.deepEqual(compact.items.map(item=>item.id),ids);
  assert.match(compact.text,/<!--g:1-->/);
  assert.match(compact.text,/<!--g:2-->/);
  assert.match(compact.text,/<!--g:3-->/);
  assert.match(compact.text,/Action <!--g:4-->/);
  assert.match(compact.text,/<!-- mery-goal-id-map\n1=0123456789abcdef0123456789abcdef/);
  assert.match(compact.text,new RegExp('4='+ids[3]));
  assert.doesNotMatch(compact.text,/<!-- mery-goal-id:/);
  const after=core.parseGoals(compact.text,{assignIds:false});
  const fields=item=>[item.id,item.type,item.title,item.period,item.parentId,item.due];
  assert.deepEqual(after.items.map(fields),before.items.map(fields));
  assert.equal(core.parseGoals(compact.text,{assignIds:false,compactPeriodIds:true}).text,compact.text);
});

test('duplicate and malformed compact markers fail before a new ID can be assigned',()=>{
  const duplicate=source.replace('<!-- mery-goal-id:'+ids[1]+' -->',core.goalIdComment(ids[0],'month'));
  assert.throws(()=>core.parseGoals(duplicate,{assignIds:true}),/重複/);
  const invalid=source.replace('<!-- mery-goal-id:'+ids[0]+' -->','<!--g:invalid-->');
  assert.throws(()=>core.parseGoals(invalid,{assignIds:true}),/対応する完全なIDがありません/);
  const compact=core.parseGoals(source,{assignIds:false,compactPeriodIds:true}).text;
  assert.throws(()=>core.parseGoals(compact.replace('1='+ids[0],''),{assignIds:true}),/対応表/);
  assert.throws(()=>core.parseGoals(compact.replace('<!--g:1-->','<!--g:9-->'),{assignIds:true}),/対応する完全なIDがありません/);
  assert.throws(()=>core.parseGoals(compact.replace('2='+ids[1],'2='+ids[0]),{assignIds:true}),/重複/);
});

test('new period IDs extend the local map without renumbering existing references',()=>{
  const compact=core.parseGoals(source,{assignIds:false,compactPeriodIds:true}).text;
  const added=compact.replace('## 2026年\n','## 2026年\n- [ ] 2026年 Another annual goal\n');
  const nextId='44444444444444444444444444444444';
  const result=core.parseGoals(added,{assignIds:true,compactPeriodIds:true,idFactory:()=>nextId});
  assert.match(result.text,/Another annual goal <!--g:5-->/);
  assert.match(result.text,/5=44444444444444444444444444444444/);
  assert.deepEqual(result.items.slice(1).map(item=>item.id),ids);
  assert.equal(core.parseGoals(result.text,{assignIds:false,compactPeriodIds:true}).text,result.text);
});

test('new action TODOs also receive short references',()=>{
  const compact=core.parseGoals(source,{assignIds:false,compactPeriodIds:true}).text;
  const added=compact.replace('      - [ ] Action <!--g:4-->','      - [ ] Action <!--g:4-->\n      - [ ] New action');
  const nextId='55555555555555555555555555555555';
  const result=core.parseGoals(added,{assignIds:true,compactPeriodIds:true,idFactory:()=>nextId});
  assert.match(result.text,/New action <!--g:5-->/);
  assert.match(result.text,/5=55555555555555555555555555555555/);
  assert.deepEqual(result.items.slice(0,4).map(item=>item.id),ids);
});

test('Thunderbird edits retain the short reference and full calendar UID',()=>{
  const compact=core.parseGoals(source,{assignIds:false,compactPeriodIds:true});
  const month=compact.items[1];
  const remote={...month,title:'Updated in Thunderbird',source:'goals'};
  const result=sync.applyRemote(compact.items,compact.text,[],'',[
    {id:month.id,action:'pull',local:month,remote}
  ]);
  assert.match(result.goals,/Updated in Thunderbird <!--g:2-->/);
  assert.equal(core.parseGoals(result.goals,{assignIds:false}).items[1].id,month.id);
  assert.equal(core.uidFor(month.id),month.id+'@local.merytodo');
});

test('Thunderbird action TODO edits keep its short reference',()=>{
  const compact=core.parseGoals(source,{assignIds:false,compactPeriodIds:true});
  const todo=compact.items[3];
  const result=sync.applyRemote(compact.items,compact.text,[],'',[
    {id:todo.id,action:'pull',local:todo,remote:{...todo,title:'Updated action',source:'goals'}}
  ]);
  assert.match(result.goals,/Updated action <!--g:4-->/);
  assert.equal(core.parseGoals(result.goals,{assignIds:false}).items[3].id,todo.id);
});

test('Japanese IME full-width checkbox space is an unfinished tracked TODO',()=>{
  const compact=core.parseGoals(source,{assignIds:false,compactPeriodIds:true}).text;
  const edited=compact.replace('      - [ ] Action <!--g:4-->','      - [　] Action <!--g:4-->');
  const parsed=core.parseGoals(edited,{assignIds:false});
  assert.equal(parsed.items.length,4);
  assert.equal(parsed.items[3].done,false);
  const updated=sync.applyRemote(parsed.items,parsed.text,[],'',[
    {id:ids[3],action:'pull',local:parsed.items[3],remote:{...parsed.items[3],done:true,title:'Changed'}}
  ]);
  assert.match(updated.goals,/\[x\] Changed <!--g:4-->/);
});

test('tracked GOALS rows with an unknown checkbox stop before deletion',()=>{
  const compact=core.parseGoals(source,{assignIds:false,compactPeriodIds:true}).text;
  assert.throws(()=>core.parseGoals(compact.replace('[ ] Action','[?] Action'),{assignIds:true}),/同期ID付きの目標行を解析できません/);
});
