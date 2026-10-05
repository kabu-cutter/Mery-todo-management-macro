const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),p=require('path').win32;
const read=n=>fs.readFileSync(require('node:path').join(__dirname,'..',n),'utf8').replace(/^\uFEFF/,'').replace(/^#.*$/gm,'');
const src=read('Mery_資料を追加.js').replace(/assetMain\("add"\);\s*$/,'');
const key=x=>p.resolve(x).toLowerCase();
function fixture({failSave=false}={}){
 const contents=new Map([[key('C:\\input\\ラフ図.pdf'),Buffer.from([0,255,10,20])]]),alerts=[],opened=[],folders=new Set([key('C:\\Projects\\ai-work-hub')]);
 const doc={FullName:'C:\\Projects\\ai-work-hub\\TASKS.md',Text:'- [ ] 曲\r\n  メモ：\r\n    本文\r\n- [ ] 次\r\n',selection:{Count:0,Mode:0,Text:'',GetTopPointY:()=>1,GetBottomPointY:()=>1,GetBottomPointX:()=>1},Save(){if(failSave)throw Error('save failed');contents.set(key(this.FullName),this.Text);}};
 const fso={GetParentFolderName:p.dirname,GetAbsolutePathName:p.resolve,BuildPath:p.join,GetExtensionName:x=>p.extname(x).slice(1),GetBaseName:x=>p.basename(x,p.extname(x)),GetFileName:p.basename,FileExists:x=>contents.has(key(x)),FolderExists:x=>folders.has(key(x)),CreateFolder:x=>folders.add(key(x)),CopyFile(a,b,overwrite){assert.equal(overwrite,false);assert.ok(!contents.has(key(b)));contents.set(key(b),Buffer.from(contents.get(key(a))));}};
 const c=vm.createContext({editor:{ActiveDocument:doc},ActiveXObject:function(n){if(n==='Scripting.FileSystemObject')return fso;if(n==='Shell.Application')return{ShellExecute:x=>opened.push(x)};throw Error(n)},mePosLogical:0,meModeStream:0,alert:x=>alerts.push(x),prompt:()=> 'ノート',CreatePopupMenu:()=>({Add(){},Track:()=>1})});
 vm.runInContext(src,c);c.assetPick=()=> 'C:\\input\\ラフ図.pdf';c.memoWriteNew=(x,t)=>{assert.ok(!contents.has(key(x)));contents.set(key(x),t)};
 return{c,doc,contents,alerts,opened,fso};
}
const t=fixture();t.c.assetMain('add');assert.equal(t.alerts.length,0);assert.ok(t.doc.Text.includes('資料: [PDF: ノート][img-1]'));assert.ok(t.doc.Text.indexOf('資料:')<t.doc.Text.indexOf('- [ ] 次'));assert.ok(t.doc.Text.includes('    本文'));assert.ok(!t.doc.Text.includes('📑'));const link=t.c.assetLinks(t.c.memoContext(t.doc.Text,0,0))[0];const dest=t.c.assetResolve(t.doc.FullName,link.target,t.fso);assert.deepEqual(t.contents.get(key(dest)),Buffer.from([0,255,10,20]));t.c.assetMain('open');assert.deepEqual(t.opened,[dest]);
const old=t.doc.Text;t.c.assetPick=()=>dest;t.c.assetMain('add');assert.equal(t.doc.Text,old);assert.ok(t.alerts.pop().includes('すでに'));
assert.throws(()=>t.c.assetResolve(t.doc.FullName,'img/../../evil.pdf',t.fso),/img/);assert.throws(()=>t.c.assetResolve(t.doc.FullName,'img/evil.exe',t.fso),/画像/);assert.throws(()=>t.c.assetResolve(t.doc.FullName,'https://example.com/a.pdf',t.fso));
t.doc.Text='- [ ] 曲\n  資料: [画像: 図][img-1]\n\n[img-1]: img/手書き%20図.png\n';assert.equal(t.c.assetLinks(t.c.memoContext(t.doc.Text,0,0))[0].target,'img/手書き%20図.png');assert.ok(t.c.assetInsert(t.c.memoContext(t.doc.Text,0,0),'img/new.pdf','PDF: 新').includes('[img-2]: img/new.pdf'));
const failed=fixture({failSave:true});const before=failed.doc.Text;failed.c.assetMain('add');assert.equal(failed.doc.Text,before);assert.ok(failed.alerts[0].includes('コピー済み'));
const canceled=fixture();canceled.c.assetPick=()=>'';canceled.c.assetMain('add');assert.equal(canceled.contents.size,1);
for(const [id,name] of [[19,'Mery_資料を追加.js'],[20,'Mery_資料を開く.js']]){let executed;vm.runInNewContext(read('Mery_作業メニュー.js'),{CreatePopupMenu:()=>({Add(){},Track:()=>id}),meMenuSeparator:0,editor:{ExecuteMacro:n=>executed=n},alert:x=>{throw Error(x)}});assert.equal(executed,name)}
console.log('PASS: binary PDF copy, short reference, memo preservation, hand references, ID collision, duplicate guard, safe paths, rollback, cancellation, menu dispatch');
