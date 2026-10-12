'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const identities=require('../calendar-sync/task-identities.cjs'),core=require('../calendar-sync/calendar-sync-core.cjs');
const initial='## 2026-10-03 (土) 今日の作業\n### 今日やる\n- [ ] alpha <!-- mery-calendar:'+ 'a'.repeat(32)+' -->\n- [ ] beta <!-- mery-calendar:'+'b'.repeat(32)+' -->\n';
const items=text=>core.parseDocument(text,'TASKS').items;
test('sidecar restores IDs after title/completion edits and reordering',()=>{
 const clean=identities.strip(initial);assert.doesNotMatch(clean,/mery-calendar/);
 const edited=identities.restore(clean.replace('- [ ] alpha','- [x] renamed'),[initial]);assert.equal(items(edited)[0].id,'a'.repeat(32));assert.equal(items(edited)[1].id,'b'.repeat(32));
 const reordered=clean.replace('- [ ] alpha\n- [ ] beta','- [ ] beta\n- [ ] alpha');assert.equal(items(identities.restore(reordered,[initial]))[0].id,'b'.repeat(32));
});
test('sidecar handles additions, deletions and subsection moves',()=>{
 assert.equal(items(identities.restore(identities.strip(initial).replace('- [ ] alpha\n',''),[initial]))[0].id,'b'.repeat(32));
 const added=items(identities.restore(identities.strip(initial)+'- [ ] new\n',[initial]));assert.equal(added.length,3);assert.equal(added[0].id,'a'.repeat(32));assert.notEqual(added[2].id,added[0].id);
 const moved=identities.strip(initial).replace('- [ ] alpha\n','')+'### 後で\n- [ ] alpha\n';assert.equal(items(identities.restore(moved,[initial])).find(x=>x.text==='alpha').id,'a'.repeat(32));
});
test('mixed edit, addition and deletion in one subsection preserve the edited task ID',()=>{
 const edited=identities.strip(initial).replace('- [ ] alpha','- [ ] alpha revised').replace('- [ ] beta\n','')+'- [ ] newly added\n';
 const parsed=items(identities.restore(edited,[initial]));
 assert.equal(parsed.find(x=>x.text==='alpha revised').id,'a'.repeat(32));
 assert.notEqual(parsed.find(x=>x.text==='newly added').id,'a'.repeat(32));
 assert.notEqual(parsed.find(x=>x.text==='newly added').id,'b'.repeat(32));
 assert.equal(parsed.some(x=>x.id==='b'.repeat(32)),false);
});
test('duplicate deletion and ambiguous bulk changes stop before sync',()=>{
 const duplicate=initial.replace('beta','alpha');assert.throws(()=>identities.restore(identities.strip(duplicate).replace('- [ ] alpha\n',''),[duplicate]),/重複/);
 const unrelated=initial.replace('alpha','north').replace('beta','south');assert.throws(()=>identities.restore(identities.strip(unrelated),[initial]),/曖昧/);
 assert.throws(()=>identities.restore(identities.strip(initial).replace('## 2026-10-03 (土) 今日の作業','## broken'),[initial]),/日付見出し/);
});
test('checkpoint preserves previous snapshot for an interrupted file rewrite',()=>{
 const dir=fs.mkdtempSync(path.join(__dirname,'.tmp-id-test-')),file=path.join(dir,'tasks-ids.json');
 try{let snapshots=identities.checkpoint(file,initial,[]);const updated=initial.replace('alpha','renamed');snapshots=identities.checkpoint(file,updated,snapshots);
  assert.equal(identities.restore(identities.strip(initial),identities.load(file)),initial);assert.equal(items(identities.restore(identities.strip(updated),snapshots))[0].id,'a'.repeat(32));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
