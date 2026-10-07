'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=path.resolve(__dirname,'../Mery_目標管理.js');
const source=fs.readFileSync(file,'utf8').replace(/^#.*$/gm,'').replace(/^main\s*\(\s*\)\s*;\s*$/m,'');
const context=vm.createContext({});
vm.runInContext(source,context,{filename:file});

test('annual goals append under the matching year and preserve other years',()=>{
 const input='# Goals\n\n## 2026年\n- [ ] Annual A\n  - [ ] 2026-10 月目標: Monthly A\n\n## 2027年\n- [ ] Annual B\n';
 const output=context.goalInsertAnnualGoal(input,'2026','Annual C');
 assert.match(output,/Annual A[\s\S]*Monthly A[\s\S]*Annual C[\s\S]*## 2027年/);
});

test('new goal file explains direct editing and shows non-task hierarchy examples',()=>{
 const output=context.goalInitialText();
 assert.match(output,/通常のMarkdownとして直接編集できます/);
 assert.match(output,/>\s+- \[ \] 2026-11 月目標B/);
 assert.match(output,/>\s+- \[ \] 年目標B/);
 assert.match(output,/## \d{4}年/);
 assert.doesNotMatch(output,/^- \[ \]/m);
});

test('child goals follow year-month-week-task indentation',()=>{
 assert.equal(context.goalBuildChildLine('- [ ] Annual','Monthly','2026-10','',''),'  - [ ] 2026-10 月目標: Monthly');
 assert.equal(context.goalBuildChildLine('  - [ ] 2026-10 月目標: Monthly','Weekly','2026-W41','',''),'    - [ ] 2026-W41 週目標: Weekly');
 assert.equal(context.goalBuildChildLine('    - [ ] 2026-W41 週目標: Weekly','Do work','', '2026-10-08',''),'      - [ ] Do work <!-- mery-due:2026-10-08 -->');
});

test('guided wizard builds a complete year-month-week-task chain with optional schedule',()=>{
 const input='# Goals\n\n## 2026年\n';
 const groups=[{title:'Annual',months:[{period:'2026-10',title:'Monthly',weeks:[{period:'2026-W41',title:'Weekly',tasks:[{title:'Do work',due:'2026-10-08',time:''}]}]}]}];
 const output=context.goalBuildWizardText(input,'2026',groups);
 assert.match(output,/- \[ \] Annual\n  - \[ \] 2026-10 月目標: Monthly\n    - \[ \] 2026-W41 週目標: Weekly\n      - \[ \] Do work <!-- mery-due:2026-10-08 -->/);
});

test('guided wizard preserves multiple siblings at every hierarchy level',()=>{
 const input='# Goals\n\n## 2026年\n- [ ] Existing annual\n\n## 2027年\n';
 const groups=[
  {title:'Annual A',months:[
   {period:'2026-10',title:'Month A',weeks:[
    {period:'2026-W41',title:'Week A',tasks:[{title:'Task A',due:'',time:''},{title:'Task B',due:'2026-10-08',time:''}]},
    {period:'2026-W42',title:'Week B',tasks:[{title:'Task C',due:'',time:''}]}
   ]},
   {period:'2026-11',title:'Month B',weeks:[{period:'2026-W44',title:'Week C',tasks:[{title:'Task D',due:'',time:''}]}]}
  ]},
  {title:'Annual B',months:[{period:'2026-12',title:'Month C',weeks:[{period:'2026-W49',title:'Week D',tasks:[{title:'Task E',due:'',time:''}]}]}]}
 ];
 const output=context.goalBuildWizardText(input,'2026',groups);
 assert.match(output,/Annual A\n  - \[ \] 2026-10 月目標: Month A\n    - \[ \] 2026-W41 週目標: Week A\n      - \[ \] Task A\n      - \[ \] Task B <!-- mery-due:2026-10-08 -->\n    - \[ \] 2026-W42 週目標: Week B\n      - \[ \] Task C\n  - \[ \] 2026-11 月目標: Month B/);
 assert.match(output,/Annual B\n  - \[ \] 2026-12 月目標: Month C/);
 assert.match(output,/## 2027年/);
});

test('wizard input validation retries the same field until valid or cancelled',()=>{
 const inputs=['2026-02-30','2026-10-09'];
 const errors=[];
 context.prompt=()=>inputs.shift();
 context.alert=message=>errors.push(message);
 const output=context.goalPromptUntilValid('期限日','',value=>context.goalValidateDate(value));
 assert.equal(output,'2026-10-09');
 assert.equal(inputs.length,0);
 assert.deepEqual(errors,['実在する日付を入力してください。']);
});

test('time is optional and metadata survives schedule changes',()=>{
 const marker='<!-- mery-calendar:0123456789abcdef0123456789abcdef -->';
 const input='- [ ] task @09:00-10:00 <!-- mery-due:2026-10-08 --> '+marker;
 const output=context.goalSetTaskSchedule(input,'2026-10-09','');
 assert.equal(output,'- [ ] task <!-- mery-due:2026-10-09 --> '+marker);
 assert.deepEqual(JSON.parse(JSON.stringify(context.goalReadSchedule(output))),{date:'2026-10-09',time:''});
});

test('schedule validation rejects impossible dates, invalid times, and time without date',()=>{
 assert.throws(()=>context.goalSetTaskSchedule('- [ ] task','2026-02-30',''));
 assert.throws(()=>context.goalSetTaskSchedule('- [ ] task','2026-10-08','09:30-09:00'));
 assert.throws(()=>context.goalSetTaskSchedule('- [ ] task','','09:30-10:00'));
});

test('child insertion only changes the selected parent relationship',()=>{
 const input='# Goals\n\n## 2026年\n- [ ] Annual\n\n## 2027年\n- [ ] Next\n';
 const output=context.goalInsertChildAfter(input,'- [ ] Annual','  - [ ] 2026-10 月目標: Monthly');
 assert.match(output,/- \[ \] Annual\n  - \[ \] 2026-10 月目標: Monthly\n\n## 2027年/);
 assert.throws(()=>context.goalInsertChildAfter(input+'- [ ] Annual\n','- [ ] Annual','  - [ ] Duplicate parent'));
});
