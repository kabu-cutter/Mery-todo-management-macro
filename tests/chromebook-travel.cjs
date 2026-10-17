'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const travel = require('../calendar-sync/chromebook-travel.cjs');
const identities = require('../calendar-sync/task-identities.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(__dirname, '.tmp-chromebook-travel-'));
  const hub = path.join(root, 'hub'), drive = path.join(root, 'drive');
  fs.mkdirSync(path.join(hub, '.mery-calendar'), { recursive: true });
  fs.mkdirSync(path.join(hub, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(hub, 'img'), { recursive: true });
  fs.mkdirSync(drive, { recursive: true });
  const task = '## 2026-10-17 (土) 今日の作業\n### 今日やる\n- [ ] alpha <!-- mery-calendar:' + 'a'.repeat(32) + ' -->\n  メモ: [memo-1]\n  資料: [img-1]\n\n[memo-1]: notes/a.txt\n[img-1]: img/a.png\n';
  fs.writeFileSync(path.join(hub, 'TASKS.md'), task);
  fs.writeFileSync(path.join(hub, 'notes/a.txt'), 'memo base');
  fs.writeFileSync(path.join(hub, 'img/a.png'), 'image base');
  fs.writeFileSync(path.join(hub, 'img/unreferenced.png'), 'private unrelated file');
  for (const name of ['tasks-ids.json', 'caldav-tasks-ids.json']) identities.checkpoint(path.join(hub, '.mery-calendar', name), task, []);
  return { root, hub, drive, task };
}

test('export makes an offline working copy with stable IDs and only referenced assets', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const result = travel.exportTravel(f.hub, f.drive);
  const copy = fs.readFileSync(path.join(f.drive, 'TASKS.md'), 'utf8');
  assert.equal(result.taskCount, 1);
  assert.match(copy, /mery-calendar:a{32}/);
  assert.equal(fs.readFileSync(path.join(f.drive, 'notes/a.txt'), 'utf8'), 'memo base');
  assert.equal(fs.readFileSync(path.join(f.drive, 'img/a.png'), 'utf8'), 'image base');
  assert.equal(fs.existsSync(path.join(f.drive, 'img/unreferenced.png')), false);
});

test('return imports Chromebook edits, backs up TASKS, and updates Google and CalDAV identity snapshots', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  travel.exportTravel(f.hub, f.drive);
  const copyPath = path.join(f.drive, 'TASKS.md');
  fs.writeFileSync(copyPath, fs.readFileSync(copyPath, 'utf8').replace('alpha', 'alpha revised') + '- [ ] new task\n');
  const result = travel.importTravel(f.hub, f.drive);
  const current = fs.readFileSync(path.join(f.hub, 'TASKS.md'), 'utf8');
  assert.ok(fs.existsSync(result.backup));
  assert.match(current, /alpha revised <!-- mery-calendar:a{32} -->/);
  const google = identities.load(path.join(f.hub, '.mery-calendar/tasks-ids.json'))[0];
  const caldav = identities.load(path.join(f.hub, '.mery-calendar/caldav-tasks-ids.json'))[0];
  assert.equal(google, current);
  assert.equal(caldav, current);
  assert.match(current, /new task <!-- mery-calendar:[a-f0-9]{32} -->/);
  assert.equal(travel.exportTravel(f.hub, f.drive).taskCount, 2);
});

test('export refuses to overwrite changes that have not been returned', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  travel.exportTravel(f.hub, f.drive);
  fs.writeFileSync(path.join(f.drive, 'TASKS.md'), fs.readFileSync(path.join(f.drive, 'TASKS.md'), 'utf8').replace('alpha', 'travel edit'));
  assert.throws(() => travel.exportTravel(f.hub, f.drive), /未取り込みの変更/);
  assert.match(fs.readFileSync(path.join(f.drive, 'TASKS.md'), 'utf8'), /travel edit/);
});

test('return stops without overwriting if Windows TASKS changed while away', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  travel.exportTravel(f.hub, f.drive);
  fs.writeFileSync(path.join(f.hub, 'TASKS.md'), f.task.replace('alpha', 'Windows edit'));
  const before = fs.readFileSync(path.join(f.hub, 'TASKS.md'));
  fs.writeFileSync(path.join(f.drive, 'TASKS.md'), fs.readFileSync(path.join(f.drive, 'TASKS.md'), 'utf8').replace('alpha', 'Chromebook edit'));
  assert.throws(() => travel.importTravel(f.hub, f.drive), /Windows側のTASKS.mdも変更/);
  assert.deepEqual(fs.readFileSync(path.join(f.hub, 'TASKS.md')), before);
});

test('return refuses a memo or asset changed on both devices', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  travel.exportTravel(f.hub, f.drive);
  fs.writeFileSync(path.join(f.drive, 'notes/a.txt'), 'Chromebook memo');
  fs.writeFileSync(path.join(f.hub, 'notes/a.txt'), 'Windows memo');
  assert.throws(() => travel.importTravel(f.hub, f.drive), /両方変更/);
  assert.match(fs.readFileSync(path.join(f.hub, 'TASKS.md'), 'utf8'), /alpha/);
});

test('return imports edits to linked notes and materials, plus newly linked files', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  travel.exportTravel(f.hub, f.drive);
  fs.writeFileSync(path.join(f.drive, 'notes/a.txt'), 'edited memo from Chromebook');
  fs.writeFileSync(path.join(f.drive, 'img/a.png'), 'edited material from Chromebook');
  fs.writeFileSync(path.join(f.drive, 'notes/new.txt'), 'new note');
  const taskPath = path.join(f.drive, 'TASKS.md');
  fs.writeFileSync(taskPath, fs.readFileSync(taskPath, 'utf8').replace('[img-1]', '[img-1] and [new memo][memo-2]')
    + '\n[memo-2]: notes/new.txt\n');
  const result = travel.importTravel(f.hub, f.drive);
  assert.equal(fs.readFileSync(path.join(f.hub, 'notes/a.txt'), 'utf8'), 'edited memo from Chromebook');
  assert.equal(fs.readFileSync(path.join(f.hub, 'img/a.png'), 'utf8'), 'edited material from Chromebook');
  assert.equal(fs.readFileSync(path.join(f.hub, 'notes/new.txt'), 'utf8'), 'new note');
  assert.match(fs.readFileSync(path.join(f.hub, 'TASKS.md'), 'utf8'), /memo-2/);
  assert.equal(result.assetCount, 3);
});

test('unsafe and unrelated paths are not considered task assets', () => {
  assert.equal(travel.safeRelative('../TASKS.md'), null);
  assert.equal(travel.safeRelative('C:/secret.txt'), null);
  assert.deepEqual(travel.referencedFiles('[x]: notes/a.txt\n[y]: ../secret.txt\n[z](img/a.png)'), ['img/a.png', 'notes/a.txt']);
});
