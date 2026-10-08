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

test('short period references preserve every full sync ID and leave TODO markers alone',()=>{
  const before=core.parseGoals(source,{assignIds:false});
  const compact=core.parseGoals(source,{assignIds:false,compactPeriodIds:true});
  assert.deepEqual(compact.items.map(item=>item.id),ids);
  assert.match(compact.text,/<!--g:1-->/);
  assert.match(compact.text,/<!--g:2-->/);
  assert.match(compact.text,/<!--g:3-->/);
  assert.match(compact.text,/<!-- mery-goal-id-map\n1=0123456789abcdef0123456789abcdef/);
  assert.match(compact.text,new RegExp('<!-- mery-goal-id:'+ids[3]+' -->'));
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
  assert.match(result.text,/Another annual goal <!--g:4-->/);
  assert.match(result.text,/4=44444444444444444444444444444444/);
  assert.deepEqual(result.items.slice(1).map(item=>item.id),ids);
  assert.equal(core.parseGoals(result.text,{assignIds:false,compactPeriodIds:true}).text,result.text);
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
