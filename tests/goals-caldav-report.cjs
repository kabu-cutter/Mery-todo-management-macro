'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const sync=require('../calendar-sync/goals-caldav-sync.cjs');

test('sync preview names CalDAV items scheduled for deletion',()=>{
  const report=sync.reportText([{action:'deleteRemote',id:'a'.repeat(32),remote:{source:'tasks',type:'todo',due:'2026-10-08',title:'Removed task'}}]);
  assert.match(report,/CalDAV項目を削除: 1件/);
  assert.match(report,/## CalDAV項目を削除\n\nTASKS\.md \/ todo \/ 2026-10-08 \/ Removed task/);
});

test('preview failure records the actual error in the report',()=>{
  const hub=fs.mkdtempSync(path.join(os.tmpdir(),'mery-caldav-error-'));
  try{
    fs.mkdirSync(path.join(hub,'.mery-calendar'));
    fs.writeFileSync(path.join(hub,'GOALS.md'),'## 2026年\n');
    fs.writeFileSync(path.join(hub,'TASKS.md'),'## 2026-10-10 (土) 今日の作業\n');
    fs.writeFileSync(path.join(hub,'.mery-calendar','caldav-tasks-ids.json'),'{}');
    const result=spawnSync(process.execPath,[path.join(__dirname,'..','calendar-sync','goals-caldav-sync.cjs'),'--hub',hub],{encoding:'utf8'});
    assert.equal(result.status,1);
    assert.match(fs.readFileSync(path.join(hub,'MERYTODO_CALDAV_REPORT.md'),'utf8'),/TASKS のIDファイルが不正/);
  }finally{
    if(path.dirname(hub)===os.tmpdir()&&path.basename(hub).startsWith('mery-caldav-error-'))fs.rmSync(hub,{recursive:true,force:true});
  }
});
