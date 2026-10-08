const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const macro='Mery_TASKSメモ欄のインデントを整える.js';
const source=fs.readFileSync(require('node:path').join(__dirname,'..',macro),'utf8').replace(/^\uFEFF/,'').replace(/^#.*$/gm,'');
const context=vm.createContext({});vm.runInContext(source.replace(/^main\(\);$/m,''),context);

const input='## 今日\r\n- [ ] A\r\n  メモ：\r\n  先頭行\r\n      深い行\r\n    \r\n   関連メモ: [📄 A][memo-1]\r\n   資料: [PDF](docs/a.pdf)\r\n- [ ] B\r\n  メモ:\r\n      既に整った本文\r\n';
const result=context.formatMemoIndent(input);
assert.equal(result.text,'## 今日\r\n- [ ] A\r\n  メモ：\r\n    先頭行\r\n        深い行\r\n\r\n   関連メモ: [📄 A][memo-1]\r\n   資料: [PDF](docs/a.pdf)\r\n- [ ] B\r\n  メモ:\r\n    既に整った本文\r\n');
assert.equal(context.formatMemoIndent(result.text).text,result.text);
assert.equal(context.formatMemoIndent('- [ ] A\n  メモ：\n    正常\n').changed,0);
assert.equal(context.formatMemoIndent('```\n- [ ] not task\n  メモ：\n  untouched\n```\n').changed,0);
assert.equal(context.formatMemoIndent('- [ ] A\n  メモ：\n  ```\n- [ ] code sample\n  ```\n  本文\n- [ ] B\n').text,'- [ ] A\n  メモ：\n  ```\n- [ ] code sample\n  ```\n    本文\n- [ ] B\n');

let backupText='',backupPath='',saved=0,alerts=[];
const doc={FullName:'C:\\Projects\\ai-work-hub\\TASKS.md',Text:input,Save(path){assert.equal(path,this.FullName);saved++;}};
const fso={FileExists(){return false;}};
function stream(){let value='';return{State:0,Charset:'',Type:0,Open(){this.State=1;},WriteText(text){value+=text;},SaveToFile(path){backupPath=path;backupText=value;},Close(){this.State=0;}};}
function ActiveXObject(name){if(name==='Scripting.FileSystemObject')return fso;if(name==='ADODB.Stream')return stream();throw Error(name);}
vm.runInNewContext(source,{editor:{ActiveDocument:doc},ActiveXObject,alert(text){alerts.push(text);}});
assert.equal(saved,1);assert.equal(doc.Text,result.text);assert.equal(backupText,input);assert.match(backupPath,/TASKS\.md\.memo_indent_backup_\d{8}_\d{6}(?:_\d+)?.md$/);assert.equal(alerts.length,1);assert.ok(alerts[0].includes('4 件'));

let eventSaved=0,eventAlert=0;
const eventDoc={FullName:doc.FullName,Text:'- [ ] A\n  メモ：\n text\n',Save(){eventSaved++;}};
vm.runInNewContext(source,{document:eventDoc,editor:{ActiveDocument:eventDoc},ActiveXObject,alert(){eventAlert++;}});
assert.equal(eventSaved,1);assert.equal(eventAlert,0);assert.equal(eventDoc.Text,'- [ ] A\n  メモ：\n    text\n');

const other={FullName:'C:\\Projects\\ai-work-hub\\LOG.md',Text:input,Save(){throw Error('should not save');}};
let skippedAlert='';vm.runInNewContext(source,{editor:{ActiveDocument:other},alert(text){skippedAlert=text;}});
assert.equal(other.Text,input);assert.equal(skippedAlert,'作業ハブの TASKS.md を開いてから実行してください。');
console.log('PASS: memo indentation formatting, metadata preservation, backups, manual and open-event behavior');
