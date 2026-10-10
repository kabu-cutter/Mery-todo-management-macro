const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.MERY_TEST_ROOT || path.resolve(__dirname, '..');
let passed = 0;
function source(name) {
  return fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, '').replace(/^#.*$/gm, '').replace(/^main\s*\(\s*\)\s*;\s*$/m, '');
}
function load(name, extra = {}) {
  const ctx = vm.createContext({TextDecoder, AbortController, setTimeout, document:{selection:{}, Tag:{exists:()=>false}}, outputBar:{Write(){}, Writeln(){}}, ...extra});
  vm.runInContext(source(name), ctx, {filename:name});
  return ctx;
}
async function test(label, run) { await run(); passed++; console.log('PASS ' + label); }
const today = '2026-10-03 (土)';
const heading = '## ' + today + ' 今日の作業';
const dayBlock = (h, item) => h + '\n\n### 今日やる\n- [ ] ' + item + '\n\n---\n\n';
async function main() {
  await test('all macro bodies parse after removing Mery metadata', () => {
    for (const name of fs.readdirSync(root).filter(n=>n.endsWith('.js'))) new vm.Script(source(name), {filename:name});
  });
  await test('today template carries forward open tasks without old times or sync IDs, retaining due dates and assets', () => {
    const c = load('Mery_今日の開始テンプレートを挿入.js');
    const prior = '# TASKS\n\n## 2026-10-08 (木) 今日の作業\n'
      + '### 今日やる\n#### 資料\n'
      + '- [ ] 資料整理 10/08/2026 3:07 PM - 10/08/2026 4:12 PM <!-- mery-calendar:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --> <!-- mery-due:2026-10-08 -->\n'
      + '  - メモと [資料](docs/guide.md)\n'
      + '  資料: [PDF: ノート][img-2]\n'
      + '- [x] 完了済み\n'
      + '### 次にやる\n- [ ] 次の作業 @15:00-15:30\n\n---\n';
    const copied = c.copyPreviousDayTasks(prior, '2026-10-10 (土)');
    const template = c.buildStartTemplate('2026-10-10 (土)', copied);
    assert.equal(copied.count, 2);
    assert.ok(template.includes('#### 資料\n- [ ] 資料整理 <!-- mery-due:2026-10-08 -->\n  - メモと [資料](docs/guide.md)\n  資料: [PDF: ノート][img-2]'));
    assert.ok(template.includes('- [ ] 次の作業'));
    assert.ok(!template.includes('完了済み'));
    assert.ok(!template.includes('10/08/2026') && !template.includes('@15:00-15:30'));
    assert.ok(!template.includes('mery-calendar:') && template.includes('mery-due:2026-10-08'));
    assert.ok(prior.includes('10/08/2026 3:07 PM') && prior.includes('mery-calendar:aaaaaaaa'));
    const full = c.insertTemplate(prior + '\n[img-2]: img/note.pdf\n', template);
    assert.ok(full.includes('[PDF: ノート][img-2]') && full.includes('[img-2]: img/note.pdf'));
  });
  for (const [name, fn] of [['Mery_TASKS今日分の重複項目を整理.js','normalizeTodayTasks'], ['Mery_選択範囲を今日のTASKS欄へ追加.js','normalizeTodayTasksText']]) {
    await test(name + ': preserve other dates between duplicates', () => {
      const c = load(name);
      const yesterday = dayBlock('## 2026-10-02 (金) 今日の作業', 'YESTERDAY');
      const last = dayBlock('## 2026-10-01 (木) 今日の作業', 'LAST-DAY');
      const input = '# TASKS\n\n' + dayBlock(heading,'TODAY-A') + yesterday + dayBlock(heading,'TODAY-B') + last;
      const result = c[fn](input, heading).changedText;
      assert.ok(result.includes(yesterday));
      assert.ok(result.endsWith(last));
      assert.ok(result.includes('TODAY-A') && result.includes('TODAY-B'));
      assert.equal(result.split(heading).length - 1, 1);
    });
    await test(name + ': preserve earlier/later dates and completion when deduplicating', () => {
      const c = load(name);
      const earlier = '# TASKS\n\n' + dayBlock('## 2026-10-02 (金) 今日の作業','EARLIER');
      const later = '\n' + dayBlock('## 2026-10-01 (木) 今日の作業','LATER');
      const result = c[fn](earlier + heading + '\n### 今日やる\n- [ ] same\n- [x] same\n' + later, heading).changedText;
      assert.ok(result.startsWith(earlier));
      assert.ok(result.endsWith(later));
      assert.ok(result.includes('- [x] same'));
      assert.equal(result.split('same').length - 1, 1);
    });
  }
  await test('log merge preserves custom subsections and unrelated blocks', () => {
    const c = load('Mery_LOG同日日付を統合.js');
    const h = '## ' + today + ' 作業ログ';
    const input = '# LOG\n\n' + h + '\n### やったこと\n- first\n### 調査結果\n- custom-one\n' + h + '\n### やったこと\n- second\n### 調査結果\n- custom-two\n## Other\n- unrelated\n';
    const result = c.mergeDuplicateLogDates(input);
    assert.equal(result.changedCount, 1);
    for (const text of ['### 調査結果','- custom-one','- custom-two','- first','- second','- unrelated']) assert.ok(result.text.includes(text));
    assert.equal(result.text.split('### 調査結果').length - 1, 1);
  });
  await test('completion inserts into today even when earlier date appears first', () => {
    const c = load('Mery_TASKS選択項目をLOGへ記録.js');
    const earlier = '# LOG\n\n## 2026-10-02 (金) 作業ログ\n### やったこと\n- old\n\n';
    const h = '## ' + today + ' 作業ログ';
    for (const todayBody of ['\n### やったこと\n- current\n\n### メモ\n- memo\n', '\n### メモ\n- memo\n']) {
      const result = c.insertIntoTodayLogSection(earlier + h + todayBody, today, 'やったこと', '- NEW');
      assert.ok(result.startsWith(earlier));
      assert.ok(result.indexOf('- NEW') > result.indexOf(h));
      assert.equal(result.split('- NEW').length - 1, 1);
    }
    const created = c.insertIntoTodayLogSection(earlier, today, 'やったこと', '- NEW');
    assert.ok(created.indexOf('- NEW') > created.indexOf(h));
    assert.ok(created.includes('- old'));
  });
  await test('all file readers accept UTF-8 and legacy UTF-16 BOMs, and close streams', () => {
    const text = '# LOG\n日本語のメモ\n';
    const be = Buffer.from(text, 'utf16le'); be.swap16();
    const fixtures = [Buffer.from(text), Buffer.from('\uFEFF'+text), Buffer.from('\uFEFF'+text,'utf16le'), Buffer.concat([Buffer.from([254,255]),be]), Buffer.alloc(0)];
    for (const name of fs.readdirSync(root).filter(n=>n.endsWith('.js'))) {
      const reader = source(name).match(/^function (readTextFile|readUtf8Text)\s*\(/m);
      if (!reader) continue;
      for (const bytes of fixtures) {
        let closed = false;
        function ActiveXObject(kind) {
          if (kind === 'Scripting.FileSystemObject') return {FileExists:()=>true};
          assert.equal(kind,'ADODB.Stream');
          return {State:0, Position:0, Open(){this.State=1}, LoadFromFile(){}, Close(){closed=true;this.State=0}, ReadText(count){
            let decoded;
            if(this.Charset==='iso-8859-1') decoded=bytes.toString('latin1');
            else if(this.Charset==='unicode') decoded=bytes.toString('utf16le');
            else if(this.Charset==='unicodeFFFE') {const copy=Buffer.from(bytes);copy.swap16();decoded=copy.toString('utf16le');}
            else decoded=bytes.toString('utf8');
            return count===undefined ? decoded : decoded.slice(0,count);
          }};
        }
        const c = load(name,{ActiveXObject});
        assert.equal(c[reader[1]]('fixture.md'), bytes.length ? text : '');
        assert.ok(closed);
      }
    }
  });
  await test('streamed Japanese survives every byte boundary and final unterminated event', async () => {
    for (const suffix of ['\n\n', '']) {
      const bytes = Buffer.from('data: ' + JSON.stringify({candidates:[{content:{parts:[{text:'日本語🙂'}]},finishReason:'STOP'}]}) + suffix);
      let i=0;
      const c = load('call_gemini_api.js',{fetch:async()=>({ok:true,body:{getReader:()=>({read:async()=> i<bytes.length ? {done:false,value:bytes.subarray(i,++i)} : {done:true}})}})});
      const result=await c.callGeminiAPI('fake-key','test',true);
      assert.equal(result.responseAll,'日本語🙂');
      assert.equal(result.aborted,false);
    }
  });
  await test('cancelled partial responses never replace output; completed responses do', async () => {
    for(const cancelled of [true,false]) {
      const c=load('call_gemini_api.js',{shell:{getEnv:()=> 'fake-key'},document:{selection:{Text:'test'},Tag:{exists:n=>n==='gemini-output-path','gemini-output-path':'fake.md'}}});
      c.cancelled=cancelled;
      vm.runInContext('callGeminiAPI = async () => ({responseAll:"RESPONSE",usageText:"",aborted:cancelled}); abortRequest = async () => {}; showTextInSingleTab = (p,t) => {globalThis.saved=t};',c);
      await c.main();
      assert.equal(!!c.saved,!cancelled);
      assert.equal(c.shell.KeepRunning,false);
    }
  });
  await test('Shift cancellation aborts a stalled request promptly', async () => {
    let signalled=false;
    const c=load('call_gemini_api.js',{
      setTimeout:fn=>setTimeout(fn,0), shell:{GetKeyState:()=> -1},
      fetch:async(url,options)=> new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{signalled=true;reject(new Error('aborted'))})),
    });
    const [result]=await Promise.all([c.callGeminiAPI('fake-key','test',true),c.abortRequest()]);
    assert.ok(signalled);
    assert.equal(result.aborted,true);
  });
  console.log(passed + ' regression checks passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
