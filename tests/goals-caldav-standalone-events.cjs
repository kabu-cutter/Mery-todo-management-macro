'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const core=require('../calendar-sync/goals-caldav-core.cjs');
const sync=require('../calendar-sync/goals-caldav-sync.cjs');
const {GoalCalDavStore}=require('../calendar-sync/goals-caldav-store.cjs');

const id='a123456789abcdef0123456789abcdef';
const event={id,uid:core.uidFor(id),type:'event',source:'standalone',title:'手動時刻のメモ',description:'内容を\n確認する',location:'自宅',start:'2026-10-11',startTime:'14:30',end:'2026-10-11',endTime:'15:15',done:false};

test('standalone timed VEVENT keeps Tokyo time, description and location through canonical ICS',()=>{
  const ical=core.toIcs(event),[parsed]=core.parseIcs(ical);
  assert.match(ical,/DTSTART;TZID=Asia\/Tokyo:20261011T143000/);
  assert.deepEqual({...parsed},{...event,category:'',section:'',parentId:'',due:'',time:''});
  const [roundTrip]=core.parseIcs(core.toIcs(parsed));
  assert.equal(roundTrip.startTime,'14:30');
  assert.equal(roundTrip.endTime,'15:15');
  assert.equal(roundTrip.description,event.description);
  assert.equal(roundTrip.location,event.location);
  assert.throws(()=>core.parseIcs(core.toIcs({...event,endTime:'14:00'})),/期間が不正/);
});

test('CalDAV Markdown sync leaves standalone events in the calendar and out of Markdown operations',()=>{
  const hub=fs.mkdtempSync(path.join(os.tmpdir(),'mery-caldav-standalone-'));
  const dir=path.join(hub,'.mery-calendar');fs.mkdirSync(dir);
  const store=new GoalCalDavStore(path.join(dir,'goals-caldav.sqlite'));
  try{
    fs.writeFileSync(path.join(hub,'GOALS.md'),'## 2026年\n');
    fs.writeFileSync(path.join(hub,'TASKS.md'),'## 2026-10-10 (土) 今日の作業\n');
    fs.writeFileSync(path.join(dir,'caldav-tasks-ids.json'),JSON.stringify({version:1,snapshots:[]}));
    const href='/calendars/default/MeryTODO/'+encodeURIComponent(event.uid)+'.ics';
    store.put(href,event,core.toIcs(event)+'\r\n');
    store.close();
    const preview=sync.run({hub,today:'2026-10-10'});
    assert.equal(preview.operations.length,0);
    assert.deepEqual(preview.errors,[]);
    const applied=sync.run({hub,today:'2026-10-10',apply:true});
    assert.equal(applied.operations.length,0);
    const check=new GoalCalDavStore(path.join(dir,'goals-caldav.sqlite'));
    try{
      const retained=check.get(href);
      assert.ok(retained,'sync must not delete the standalone CalDAV event');
      assert.equal(core.parseIcs(retained.ical)[0].title,event.title);
    }finally{check.close();}
  }finally{
    try{store.close();}catch{}
    if(path.dirname(hub)===os.tmpdir()&&path.basename(hub).startsWith('mery-caldav-standalone-'))fs.rmSync(hub,{recursive:true,force:true});
  }
});
