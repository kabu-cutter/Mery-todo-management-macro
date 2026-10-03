'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
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
test('ambiguous duplicate deletion and mixed bulk edits stop before sync',()=>{
 const duplicate=initial.replace('beta','alpha');assert.throws(()=>identities.restore(identities.strip(duplicate).replace('- [ ] alpha\n',''),[duplicate]),/重複/);
 assert.throws(()=>identities.restore(identities.strip(initial).replace('alpha','renamed')+'- [ ] added\n',[initial]),/重なり/);
 assert.throws(()=>identities.restore(identities.strip(initial).replace('## 2026-10-03 (土) 今日の作業','## broken'),[initial]),/日付見出し/);
});
test('checkpoint preserves previous snapshot for an interrupted file rewrite',()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'mery-id-test-')),'tasks-ids.json');let snapshots=identities.checkpoint(file,initial,[]);const updated=initial.replace('alpha','renamed');snapshots=identities.checkpoint(file,updated,snapshots);
 assert.equal(identities.restore(identities.strip(initial),identities.load(file)),initial);assert.equal(items(identities.restore(identities.strip(updated),snapshots))[0].id,'a'.repeat(32));
});
