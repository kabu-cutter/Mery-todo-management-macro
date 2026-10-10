'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const sync=require('../calendar-sync/goals-caldav-sync.cjs');
const core=require('../calendar-sync/goals-caldav-core.cjs');
const identities=require('../calendar-sync/task-identities.cjs');
const {GoalCalDavStore}=require('../calendar-sync/goals-caldav-store.cjs');

const heading='## 2026-10-10 (土) 今日の作業\n### 今日やる\n';

test('Mery timestamps round to half-hour slots and use the TASKS heading date',()=>{
  const parsed=sync.parseTaskDocument(heading+
    '- [ ] 資料整理 10/09/2026 3:07 PM\n'+
    '- [ ] コード修正 10/09/2026 3:42 PM\n'+
    '- [ ] 次の作業 10/09/2026 4:12 PM');
  assert.deepEqual(parsed.items.map(item=>[item.title,item.due,item.time]),[
    ['資料整理','2026-10-10','15:00-15:30'],
    ['コード修正','2026-10-10','15:30-16:00'],
    ['次の作業','2026-10-10','16:00-16:30'],
  ]);
  assert.equal(parsed.timeNotes.length,0);
  assert.match(parsed.text,/資料整理 10\/09\/2026 3:07 PM/,'raw Mery timestamps remain in TASKS.md');
});

test('an explicit end timestamp is used and a missing end always gets a 30-minute slot',()=>{
  const parsed=sync.parseTaskDocument(heading+
    '- [ ] 資料整理 10/10/2026 3:07 PM - 10/10/2026 4:12 PM\n'+
    '- [ ] コード修正 10/10/2026 4:12 PM\n'+
    '- [ ] 別作業 10/10/2026 6:12 PM');
  assert.deepEqual(parsed.items.map(item=>item.time),['15:00-16:00','16:00-16:30','18:00-18:30']);
  const [todo]=core.parseIcs(core.toIcs(parsed.items[0]));
  assert.equal(todo.time,'15:00-16:00');
  assert.equal(todo.due,'2026-10-10');
});

test('adding or adjusting a Mery timestamp preserves the TASKS sync ID',()=>{
  const id='b123456789abcdef0123456789abcdef';
  const before=heading+'- [ ] 資料整理 <!-- mery-calendar:'+id+' -->';
  const after=heading+'- [ ] 資料整理 10/10/2026 3:07 PM - 10/10/2026 3:42 PM';
  const changed=heading+'- [ ] 資料整理 10/10/2026 3:12 PM - 10/10/2026 3:47 PM';
  for(const text of [after,changed]){
    const restored=identities.restore(text,[before],()=> 'c123456789abcdef0123456789abcdef');
    assert.match(restored,new RegExp('<!-- mery-calendar:'+id+' -->'));
  }
});

test('invalid and overlapping rounded intervals fail safely',()=>{
  assert.throws(()=>sync.parseTaskDocument(heading+
    '- [ ] 同じ枠 10/10/2026 3:02 PM\n'+
    '- [ ] 同じ枠2 10/10/2026 3:12 PM'),/重なっています/);
  assert.throws(()=>sync.parseTaskDocument(heading+
    '- [ ] 重なる予定 10/10/2026 3:00 PM - 10/10/2026 4:00 PM\n'+
    '- [ ] 次の予定 10/10/2026 3:30 PM\n'+
    '- [ ] その次 10/10/2026 4:30 PM'),/重なっています/);
  assert.throws(()=>sync.parseTaskDocument(heading+
    '- [ ] 夜遅く 10/10/2026 11:50 PM'),/翌日になります/);
});

test('Thunderbird title or date edits preserve the original Mery time stamps',()=>{
  const id='a123456789abcdef0123456789abcdef';
  const source=heading+'- [ ] 資料整理 10/10/2026 3:07 PM - 10/10/2026 3:42 PM <!-- mery-calendar:'+id+' -->';
  const updated=sync.replaceTaskFromThunderbird(source.split('\n'),id,{title:'資料を確認',done:true,due:'2026-10-11',section:'今日やる',time:'15:00-15:30'},'2026-10-10').join('\n');
  assert.match(updated,/\[x\] 資料を確認 10\/10\/2026 3:07 PM - 10\/10\/2026 3:42 PM <!-- mery-calendar:/);
  assert.match(updated,/## 2026-10-11/);
});

test('CalDAV sync sends clean TODO titles with fixed timed VTODO boundaries',()=>{
  const hub=fs.mkdtempSync(path.join(os.tmpdir(),'mery-caldav-time-'));
  const dir=path.join(hub,'.mery-calendar');fs.mkdirSync(dir);
  fs.writeFileSync(path.join(hub,'GOALS.md'),'## 2026年\n');
  fs.writeFileSync(path.join(hub,'TASKS.md'),heading+
    '- [ ] 資料整理 10/10/2026 3:07 PM\n'+
    '- [ ] コード修正 10/10/2026 3:42 PM\n'+
    '- [ ] 作業終了 10/10/2026 4:12 PM\n');
  try{
    const applied=sync.run({hub,today:'2026-10-10',apply:true});
    assert.deepEqual(applied.errors,[]);
    const store=new GoalCalDavStore(path.join(dir,'goals-caldav.sqlite'));
    try{
      const tasks=store.resources().map(resource=>core.parseIcs(resource.ical)[0]).filter(item=>item?.source==='tasks');
      const sorted=items=>items.sort((a,b)=>a[0].localeCompare(b[0]));
      assert.deepEqual(sorted(tasks.map(item=>[item.title,item.due,item.time])),sorted([
        ['コード修正','2026-10-10','15:30-16:00'],
        ['資料整理','2026-10-10','15:00-15:30'],
        ['作業終了','2026-10-10','16:00-16:30'],
      ]));
      assert.ok(!tasks.some(item=>item.title.includes('10/10/2026')));
    }finally{store.close();}
  }finally{
    if(path.dirname(hub)===os.tmpdir()&&path.basename(hub).startsWith('mery-caldav-time-'))fs.rmSync(hub,{recursive:true,force:true});
  }
});
