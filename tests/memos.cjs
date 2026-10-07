const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path').win32;
const files=['Mery_このTODOにメモを作る.js','Mery_関連メモを開く.js'];
const source=name=>fs.readFileSync(require('node:path').join(__dirname,'..',name),'utf8').replace(/^\uFEFF/,'').replace(/^#.*$/gm,'');
const c=vm.createContext({});vm.runInContext(source(files[0]).replace(/^main\(\);$/m,''),c);
const text='## 今日\r\n- [ ] 考える\r\n  メモ：\r\n    アイデアA\r\n    アイデアB\r\n  関連メモ: [既存](notes/old.txt)\r\n\r\n- [ ] 次\r\n';
const ctx=c.memoContext(text,3,4);assert.equal(ctx.task,1);assert.equal(ctx.end,7);assert.equal(c.memoSelectedBody(ctx,'    アイデアA\r\n    アイデアB',3,4),'アイデアA\r\nアイデアB');
const linked=c.memoInsertLink(text,ctx,'notes/new.txt','考える');assert.ok(linked.includes('    アイデアA\r\n    アイデアB'));assert.ok(linked.indexOf('notes/new.txt')<linked.indexOf('- [ ] 次'));assert.equal(c.memoLinks(c.memoContext(linked,3,3)).length,2);
assert.throws(()=>c.memoContext(text,3,8),/1つ/);assert.throws(()=>c.memoContext(text,0,0),/TODO/);assert.throws(()=>c.memoSelectedBody(ctx,'メモ：',2,2),/本文/);assert.throws(()=>c.memoSelectedBody(ctx,'関連メモ',5,5),/本文/);
const hand=c.memoContext(text.replace('メモ：','メモ:'),3,3);assert.equal(hand.label,2);assert.equal(c.memoInsertLabel(hand).text,text.replace('メモ：','メモ:'));
const added=c.memoInsertLabel(c.memoContext('- [ ] テスト\n- [ ] 次\n',0,0));assert.equal(added.text,'- [ ] テスト\n  メモ：\n    \n- [ ] 次\n');
assert.ok(c.memoInsertLabel(c.memoContext('- [ ] テスト\n  メモ：\n  関連メモ: [x](notes/x.txt)\n',0,0)).text.includes('メモ：\n    \n  関連メモ'));
assert.throws(()=>c.memoContext('```\n- [ ] 偽のタスク\n```\n',1,1),/コード/);
assert.equal(c.memoFileName('危険/名:*?', '20261005',1),'20261005_001.txt');
assert.equal(c.memoWholeBody(ctx),'アイデアA\r\nアイデアB');assert.throws(()=>c.memoWholeBody(c.memoContext('- [ ] A\n  メモ：\n    \n',0,0)),/本文/);
const compact=c.memoCompactLinks(linked,c.memoContext(linked,3,3));assert.ok(compact.includes('関連メモ: [メモ1][memo-1]'));assert.ok(compact.includes('[memo-1]: notes/new.txt'));assert.equal(c.memoCompactLinks(compact,c.memoContext(compact,3,3)),compact);assert.equal(c.memoLinks(c.memoContext(compact,3,3))[1].target,'notes/old.txt');
const collision=linked+'\r\n[memo-1]: notes/another.txt\r\n';const compactCollision=c.memoCompactLinks(collision,c.memoContext(collision,3,3));assert.ok(compactCollision.includes('[memo-2]: notes/new.txt'));assert.ok(compactCollision.includes('[memo-1]: notes/another.txt'));
const fakeFso={GetParentFolderName:path.dirname,GetAbsolutePathName:path.resolve,BuildPath:path.join};
const target=c.memoLinkTarget('C:\\Projects\\ai-work-hub\\TASKS.md','日本語 (a).txt',fakeFso);assert.equal(c.memoResolveTarget('C:\\Projects\\ai-work-hub\\TASKS.md',target,fakeFso),'C:\\Projects\\ai-work-hub\\notes\\日本語 (a).txt');
for(const filename of ['C:\\notes\\日本語 (a)#?.txt','C:\\notes\\20261005_001.txt','\\\\server\\share\\a.txt']){assert.equal(c.memoResolveTarget('C:\\TASKS.md',c.memoFileUri(filename),fakeFso),filename);}
const clickable=c.memoClickableLinks(compact,c.memoContext(compact,3,3),'C:\\Projects\\ai-work-hub\\TASKS.md',fakeFso);assert.ok(clickable.includes('[メモ1](file:///C:/Projects/ai-work-hub/notes/new.txt)'));assert.equal(c.memoClickableLinks(clickable,c.memoContext(clickable,3,3),'C:\\Projects\\ai-work-hub\\TASKS.md',fakeFso),clickable);
assert.throws(()=>c.memoResolveTarget('C:\\a.md','https://example.com/x.txt',fakeFso),/ローカル/);

function integration(entry,{input=text,top=3,bottom=4,selected='    アイデアA\r\n    アイデアB',choice=2,failSave=false,initialFiles={}}={}){
  const store=new Map(),dirs=new Set(['C:\\Projects\\ai-work-hub']),alerts=[],saved=[],docs=[],cursor=[];
  const key=p=>path.resolve(p).toLowerCase();
  for(const [p,t] of Object.entries(initialFiles))store.set(key(p),t);
  function doc(p,t){return {FullName:p,Text:t,selection:{Count:0,Mode:0,Text:'',GetTopPointY:()=>top+1,GetBottomPointY:()=>bottom+1,GetBottomPointX:()=>2,SetActivePoint:(...a)=>cursor.push(a),StartOfDocument(){}},Activate(){editor.ActiveDocument=this;},Save(p){if(failSave&&p.endsWith('TASKS.md'))throw Error('save failed');this.FullName=p;store.set(key(p),this.Text);saved.push(p);}};}
  const active=doc('C:\\Projects\\ai-work-hub\\TASKS.md',input);active.selection.Text=selected;docs.push(active);
  const editor={ActiveDocument:active,QueryStatusByID:id=>{assert.equal(id,2238);return editor.ActiveDocument.vertical?3:1;},ExecuteCommandByID:id=>{assert.equal(id,2238);editor.ActiveDocument.vertical=!editor.ActiveDocument.vertical;},Documents:{get Count(){return docs.length;},Item:i=>docs[i]},NewFile(){const d=doc('', '');docs.push(d);this.ActiveDocument=d;}};
  const fso={...fakeFso,FileExists:p=>store.has(key(p)),FolderExists:p=>dirs.has(p),CreateFolder:p=>dirs.add(p)};
  function stream(){let text='';return {State:0,Charset:'',Position:0,Open(){this.State=1;},Close(){this.State=0;},WriteText:t=>{text+=t;},SaveToFile(p,mode){if(mode===1&&store.has(key(p)))throw Error('exists');store.set(key(p),text);},LoadFromFile:p=>{text=store.get(key(p));},ReadText:n=>n?text.slice(0,n):text};}
  const sandbox={editor,ActiveXObject:function(n){if(n==='Scripting.FileSystemObject')return fso;if(n==='ADODB.Stream')return stream();throw Error(n);},CreatePopupMenu:()=>({Add(){},Track:()=>choice}),alert:s=>alerts.push(s),mePosLogical:0,meModeStream:0};
  vm.runInNewContext(source(entry),sandbox);
  return {store,alerts,saved,active,editor,cursor};
}
const created=integration(files[0]);assert.equal(created.alerts.length,0);assert.ok(created.active.Text.includes('関連メモ: [📄 メモ1][memo-1]'));assert.ok(created.editor.ActiveDocument.FullName.endsWith('.txt'));assert.ok(created.editor.ActiveDocument.Text.includes('アイデアA\r\nアイデアB'));assert.ok([...created.store.keys()].some(p=>p.includes('memo_backup')));
assert.equal(created.editor.ActiveDocument.vertical,true);assert.equal(created.active.vertical,undefined);
const tag=integration(files[0],{input:'- [ ] タスク\n',top:0,bottom:0,selected:'',choice:1});assert.equal(tag.alerts.length,0);assert.ok(tag.active.Text.includes('  メモ：\n    '));assert.equal(tag.editor.ActiveDocument,tag.active);assert.ok(![...tag.store.keys()].some(p=>p.endsWith('.txt')));assert.deepEqual(tag.cursor[0],[0,5,3]);
const blank=integration(files[0],{input:'- [ ] タスク\n',top:0,bottom:0,selected:''});assert.equal(blank.alerts.length,0);assert.ok(blank.active.Text.includes('関連メモ'));assert.ok(blank.editor.ActiveDocument.Text.includes('タイトル: タスク'));
assert.ok(!blank.active.Text.includes('📄'));
const emptyHeader='タイトル: タスク\r\n作成日時: 20261005\r\n元の文書: C:\\TASKS.md\r\n\r\n';assert.equal(c.memoHasSavedBody(emptyHeader),false);assert.equal(c.memoHasSavedBody(emptyHeader+'本文'),true);assert.equal(c.memoHasSavedBody(' \r\n '),false);
const whole=integration(files[0],{selected:'',top:1,bottom:1,choice:3});assert.equal(whole.alerts.length,0);assert.ok(whole.editor.ActiveDocument.Text.includes('アイデアA\r\nアイデアB'));assert.ok(whole.active.Text.includes('    アイデアA\r\n    アイデアB'));assert.ok(/\\\d{8}_001\.txt$/.test(whole.editor.ActiveDocument.FullName));
const empty=integration(files[0],{input:'- [ ] A\n  メモ：\n    \n',selected:'',top:0,bottom:0,choice:3});assert.ok(empty.alerts[0].includes('本文'));assert.equal(empty.store.size,0);
const openedOld=integration(files[1],{selected:'',top:1,bottom:1,initialFiles:{'C:\\Projects\\ai-work-hub\\notes\\old.txt':'既存の本文'}});assert.equal(openedOld.alerts.length,0);assert.ok(openedOld.active.Text.includes('[📄 メモ1][memo-1]'));assert.ok(openedOld.active.Text.includes('[memo-1]: notes/old.txt'));assert.equal(openedOld.editor.ActiveDocument.Text,'既存の本文');assert.equal(openedOld.editor.ActiveDocument.vertical,true);
const removedIcon=integration(files[1],{input:openedOld.active.Text,selected:'',top:1,bottom:1,initialFiles:{'C:\\Projects\\ai-work-hub\\notes\\old.txt':emptyHeader}});assert.equal(removedIcon.alerts.length,0);assert.ok(!removedIcon.active.Text.includes('📄'));assert.ok(removedIcon.active.Text.includes('[メモ1][memo-1]'));
const failed=integration(files[0],{failSave:true});assert.ok(failed.alerts[0].includes('save failed'));assert.equal(failed.active.Text,text);
const canceled=integration(files[0],{selected:'',choice:0});assert.equal(canceled.store.size,0);assert.equal(canceled.active.Text,text);
const missing=integration(files[1],{selected:'',top:1,bottom:1});assert.ok(missing.alerts[0].includes('見つかりません'));assert.equal(missing.saved.length,0);
const openSource=source(files[1]);let opened;
const linksContext={FullName:'C:\\Projects\\ai-work-hub\\TASKS.md',Text:linked,selection:{Count:0,Mode:0,Text:'',GetTopPointY:()=>2,GetBottomPointY:()=>2,GetBottomPointX:()=>1}};
const openVm=vm.createContext({editor:{ActiveDocument:linksContext},mePosLogical:0,meModeStream:0});vm.runInContext(openSource.replace(/^main\(\);$/m,''),openVm);openVm.ActiveXObject=function(){return {...fakeFso,FileExists:()=>true};};openVm.CreatePopupMenu=()=>({Add(){},Track:()=>2});openVm.memoOpen=p=>{opened=p;};openVm.memoSaveTodo=()=>{};openVm.alert=s=>{throw Error(s);};openVm.main();assert.ok(opened.endsWith('old.txt'));
for(const id of [16,17]){let executed;vm.runInNewContext(source('Mery_作業メニュー.js'),{ScriptFullName:'C:\\Mery\\Macros\\Mery_作業メニュー.js',ActiveXObject:function(){return{GetParentFolderName:p=>p.substring(0,p.lastIndexOf('\\')),BuildPath:(d,f)=>d+'\\'+f,FileExists:()=>true}},CreatePopupMenu:()=>({Add(){},Track:()=>id}),meMenuSeparator:0,editor:{ExecuteMacro:n=>{executed=n;}},alert:s=>{throw Error(s);}});assert.equal(executed,files[id-16]);}
console.log('PASS: handwritten tags, insertion, selected text, links, TXT creation/opening, backups, save failure, cancellation, menu dispatch');
let vertical=false,toggles=0;const view=vm.createContext({editor:{QueryStatusByID:()=>vertical?3:1,ExecuteCommandByID:()=>{vertical=!vertical;toggles++;}}});vm.runInContext(source(files[1]).replace(/^main\(\);$/m,''),view);view.memoVertical();view.memoVertical();assert.equal(vertical,true);assert.equal(toggles,1);vertical=false;view.memoVertical();assert.equal(vertical,true);assert.equal(toggles,2);console.log('PASS: vertical view is enabled once and restored after a manual change');
