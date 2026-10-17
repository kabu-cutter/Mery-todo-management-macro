'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('./calendar-sync-core.cjs');
const identities = require('./task-identities.cjs');

const META = '.mery-chromebook-travel.json';
const HASH = value => crypto.createHash('sha256').update(value).digest('hex');
const normalize = value => value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
function decode(bytes) {
  if (bytes[0] === 255 && bytes[1] === 254) return bytes.subarray(2).toString('utf16le');
  if (bytes[0] === 254 && bytes[1] === 255) { const copy = Buffer.from(bytes.subarray(2)); copy.swap16(); return copy.toString('utf16le'); }
  return bytes.toString('utf8').replace(/^\uFEFF/, '');
}

function safeRelative(value) {
  const decoded = decodeURIComponent(value.replace(/\\/g, '/'));
  const normalized = path.posix.normalize(decoded);
  if (normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized)) return null;
  if (!/^(?:img|notes)\/.+/i.test(normalized)) return null;
  return normalized;
}

function referencedFiles(text) {
  const result = new Set();
  const patterns = [
    /^\[[^\]]+\]:\s*<?([^\s>]+)>?/gm,
    /\[[^\]]*\]\(<?((?:img|notes)\/[^\s)]+)>?\)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const relative = safeRelative(match[1]);
      if (relative) result.add(relative);
    }
  }
  return [...result].sort();
}

function readSnapshotSet(hub) {
  const dir = path.join(hub, '.mery-calendar');
  return [
    ...identities.load(path.join(dir, 'tasks-ids.json')),
    ...identities.load(path.join(dir, 'caldav-tasks-ids.json')),
  ];
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + crypto.randomBytes(5).toString('hex') + '.tmp';
  fs.writeFileSync(temp, content);
  fs.renameSync(temp, file);
}

function markedTasks(text, snapshots) {
  const restored = identities.restore(normalize(text), snapshots);
  const parsed = core.parseDocument(restored, 'TASKS');
  return parsed.text;
}

function exportTravel(hub, travelDir) {
  hub = path.resolve(hub); travelDir = path.resolve(travelDir);
  const taskFile = path.join(hub, 'TASKS.md');
  if (!fs.existsSync(taskFile)) throw new Error('TASKS.md が見つかりません。');
  const previousMetaFile = path.join(travelDir, META), previousTaskFile = path.join(travelDir, 'TASKS.md');
  if (fs.existsSync(previousMetaFile) || fs.existsSync(previousTaskFile)) {
    if (!fs.existsSync(previousMetaFile) || !fs.existsSync(previousTaskFile)) throw new Error('選択したフォルダーには不完全なChromebook作業データがあります。上書きせず、状態を確認してください。');
    const previous = JSON.parse(fs.readFileSync(previousMetaFile, 'utf8'));
    if (previous.version !== 1 || typeof previous.baseTasks !== 'string') throw new Error('既存のChromebook管理情報が不正です。上書きしません。');
    const previousTasks = identities.strip(normalize(decode(fs.readFileSync(previousTaskFile))));
    if (previousTasks !== normalize(previous.baseTasks)) throw new Error('Chromebook側に未取り込みの変更があります。「帰宅」から先に取り込んでください。');
    for (const [relative, expected] of Object.entries(previous.assets || {})) {
      const file = path.resolve(travelDir, relative);
      if (file.startsWith(travelDir + path.sep) && fs.existsSync(file) && HASH(fs.readFileSync(file)) !== expected) throw new Error('Chromebook側で変更されたメモ・資料があります。「帰宅」から先に取り込んでください: ' + relative);
    }
  }
  const original = normalize(decode(fs.readFileSync(taskFile)));
  const marked = markedTasks(original, readSnapshotSet(hub));
  const assets = {};
  for (const relative of referencedFiles(original)) {
    const source = path.resolve(hub, relative);
    if (!source.startsWith(path.resolve(hub) + path.sep)) continue;
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    const bytes = fs.readFileSync(source);
    writeAtomic(path.join(travelDir, relative), bytes);
    assets[relative] = HASH(bytes);
  }
  writeAtomic(path.join(travelDir, 'TASKS.md'), Buffer.from(marked, 'utf8'));
  const meta = { version: 1, exportedAt: new Date().toISOString(), baseTasks: identities.strip(marked), assets };
  writeAtomic(path.join(travelDir, META), Buffer.from(JSON.stringify(meta, null, 2), 'utf8'));
  return { taskCount: core.parseDocument(marked, 'TASKS').items.length, assetCount: Object.keys(assets).length };
}

function importTravel(hub, travelDir) {
  hub = path.resolve(hub); travelDir = path.resolve(travelDir);
  if (fs.existsSync(path.join(hub, '.mery-calendar', 'sync.lock'))) throw new Error('Google同期が実行中です。完了してから帰宅取り込みを行ってください。');
  const taskFile = path.join(hub, 'TASKS.md');
  const travelFile = path.join(travelDir, 'TASKS.md');
  const metaFile = path.join(travelDir, META);
  if (![taskFile, travelFile, metaFile].every(fs.existsSync)) throw new Error('外出フォルダーに TASKS.md または管理情報がありません。先に「外出」を実行してください。');
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  if (meta.version !== 1 || typeof meta.baseTasks !== 'string' || !meta.assets || typeof meta.assets !== 'object') throw new Error('外出フォルダーの管理情報が壊れています。');

  const snapshots = readSnapshotSet(hub);
  const current = markedTasks(decode(fs.readFileSync(taskFile)), snapshots);
  if (identities.strip(current) !== normalize(meta.baseTasks)) throw new Error('外出中にWindows側のTASKS.mdも変更されています。上書きを止めました。変更を確認してから競合を整理してください。');
  const incoming = markedTasks(decode(fs.readFileSync(travelFile)), [current, ...snapshots]);

  const incomingAssets = referencedFiles(incoming);
  const assetUpdates = [];
  for (const relative of incomingAssets) {
    const travelAsset = path.resolve(travelDir, relative);
    const localAsset = path.resolve(hub, relative);
    if (!travelAsset.startsWith(travelDir + path.sep) || !localAsset.startsWith(hub + path.sep)) continue;
    if (!fs.existsSync(travelAsset) || !fs.statSync(travelAsset).isFile()) continue;
    const bytes = fs.readFileSync(travelAsset), oldHash = meta.assets[relative];
    if (oldHash && HASH(bytes) === oldHash) continue;
    if (fs.existsSync(localAsset)) {
      const localHash = HASH(fs.readFileSync(localAsset));
      if (localHash !== oldHash && localHash !== HASH(bytes)) throw new Error('Windows側とChromebook側の資料・メモが両方変更されています。上書きを止めました: ' + relative);
    }
    assetUpdates.push({ relative, bytes, localAsset });
  }

  const backup = path.join(hub, 'TASKS_before_chromebook_' + new Date().toISOString().replace(/[-:.TZ]/g, '') + '.md');
  fs.copyFileSync(taskFile, backup, fs.constants.COPYFILE_EXCL);
  const idsDir = path.join(hub, '.mery-calendar');
  const sidecarFiles = ['tasks-ids.json', 'caldav-tasks-ids.json'].map(name => path.join(idsDir, name));
  const sidecarOriginals = sidecarFiles.map(file => fs.existsSync(file) ? fs.readFileSync(file) : null);
  const taskOriginal = fs.readFileSync(taskFile), metaOriginal = fs.readFileSync(metaFile), assetOriginals = assetUpdates.map(x => fs.existsSync(x.localAsset) ? fs.readFileSync(x.localAsset) : null);
  try {
    for (let i = 0; i < assetUpdates.length; i++) {
      const update = assetUpdates[i];
      if (assetOriginals[i]) {
        const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
        fs.copyFileSync(update.localAsset, update.localAsset + '.before-chromebook-' + stamp, fs.constants.COPYFILE_EXCL);
      }
      writeAtomic(update.localAsset, update.bytes);
    }
    writeAtomic(taskFile, Buffer.from(incoming, 'utf8'));
    for (const file of sidecarFiles) identities.checkpoint(file, incoming, identities.load(file));
    const nextAssets = {};
    for (const relative of incomingAssets) {
      const travelAsset = path.resolve(travelDir, relative);
      if (travelAsset.startsWith(travelDir + path.sep) && fs.existsSync(travelAsset) && fs.statSync(travelAsset).isFile()) nextAssets[relative] = HASH(fs.readFileSync(travelAsset));
    }
    writeAtomic(metaFile, Buffer.from(JSON.stringify({ ...meta, returnedAt: new Date().toISOString(), baseTasks: identities.strip(incoming), assets: nextAssets }, null, 2), 'utf8'));
  } catch (error) {
    try {
      writeAtomic(taskFile, taskOriginal);
      for (let i = 0; i < assetUpdates.length; i++) {
        if (assetOriginals[i]) writeAtomic(assetUpdates[i].localAsset, assetOriginals[i]);
        else if (fs.existsSync(assetUpdates[i].localAsset)) fs.unlinkSync(assetUpdates[i].localAsset);
      }
      for (let i = 0; i < sidecarFiles.length; i++) {
        if (sidecarOriginals[i]) writeAtomic(sidecarFiles[i], sidecarOriginals[i]);
        else if (fs.existsSync(sidecarFiles[i])) fs.unlinkSync(sidecarFiles[i]);
      }
      writeAtomic(metaFile, metaOriginal);
    } catch (rollbackError) {
      throw new Error('取り込み中にエラーがあり、自動で元に戻す処理も失敗しました。TASKSの退避ファイルを保管してください。\n' + backup + '\n原因: ' + error.message + '\n復元エラー: ' + rollbackError.message);
    }
    throw error;
  }
  return { taskCount: core.parseDocument(incoming, 'TASKS').items.length, assetCount: assetUpdates.length, backup };
}

function cli(args = process.argv.slice(2)) {
  const option = name => { const i = args.indexOf(name); return i < 0 ? '' : args[i + 1]; };
  const hub = option('--hub'), travel = option('--travel'), mode = args.includes('--import') ? 'import' : args.includes('--export') ? 'export' : '';
  if (!hub || !travel || !mode) throw new Error('使い方: node chromebook-travel.cjs --hub <作業ハブ> --travel <Drive同期フォルダー> --export|--import');
  const result = mode === 'export' ? exportTravel(hub, travel) : importTravel(hub, travel);
  console.log(JSON.stringify(result));
  return result;
}

module.exports = { safeRelative, referencedFiles, exportTravel, importTravel, decode, cli };
if (require.main === module) {
  try { cli(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
