'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function embeddedRuntime() {
  const source=fs.readFileSync(path.join(root,'Mery_Googleカレンダーと同期.js'),'utf8').replace(/^\uFEFF/,'').replace(/^#.*$/gm,'').replace(/^main\s*\(\s*\)\s*;\s*$/m,'');
  const macro=vm.createContext({});vm.runInContext(source,macro);
  const embedded=vm.createContext({require,module:{exports:{}},__dirname:path.join(root,'calendar-sync'),Buffer,process,console,setTimeout,clearTimeout,fetch,URL,URLSearchParams,AbortSignal});
  vm.runInContext(macro.EMBEDDED_CALENDAR_RUNTIME,embedded);
  return embedded.module.exports;
}
test('standalone macro loads embedded SQLite, OAuth and synchronization modules',()=>{
  const runtime=embeddedRuntime();
  assert.equal(typeof runtime.cli,'function');assert.equal(typeof runtime.synchronize,'function');
  assert.equal(runtime.decodeFile(Buffer.from('\uFEFF日本語')),'日本語');
});
test('standalone runtime previews TASKS and LOG without external helper files',async()=>{
  const runtime=embeddedRuntime();
  const documents={TASKS:'# TASKS\n## 2026-10-03 (土) 今日の作業\n### 今日やる\n- [ ] 資料を確認\n',LOG:'# LOG\n## 2026-10-03 (土) 作業ログ\n### やったこと\n- 打ち合わせ\n'};
  const result=await runtime.synchronize(documents,{entries:{}},[],null,'primary',false);
  assert.equal(result.operations.length,2);
  assert.ok(result.operations.every(item=>item.action==='createRemote'));
  assert.equal(result.documents.TASKS,documents.TASKS);assert.equal(result.documents.LOG,documents.LOG);
});
