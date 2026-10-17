'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const core = require('./calendar-sync-core.cjs');
const identities = require('./task-identities.cjs');
const google = require('./calendar-google.cjs');
const { readConfiguration } = require('./calendar-sync.cjs');

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
  // Keep sync IDs in local snapshots; the Chromebook copy stays readable and marker-free.
  const travelTasks = identities.strip(marked);
  writeAtomic(path.join(travelDir, 'TASKS.md'), Buffer.from(travelTasks, 'utf8'));
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

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
function driveConfigFile(hub) { return path.join(hub, '.mery-calendar', 'config.json'); }
function readTravelFolderId(hub) {
  const file = driveConfigFile(hub);
  if (!fs.existsSync(file)) return '';
  const data = JSON.parse(decode(fs.readFileSync(file)));
  return typeof data.travelFolderId === 'string' ? data.travelFolderId : '';
}
function saveTravelFolderId(hub, id) {
  const file = driveConfigFile(hub), data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) : {};
  data.travelFolderId = id;
  const temp = file + '.' + crypto.randomBytes(5).toString('hex') + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, file);
}
async function connectDrive(config) {
  let api;
  try { api = await google.connect(config, false); }
  catch (error) {
    if (!/Google に未接続です/.test(error.message)) throw error;
    api = await google.connect(config, true, [DRIVE_FILE_SCOPE]);
  }
  if (!api.hasScope(DRIVE_FILE_SCOPE)) api = await google.connect(config, true, [DRIVE_FILE_SCOPE]);
  if (!api.hasScope(DRIVE_FILE_SCOPE)) throw new Error('Google Driveへのアクセスが許可されませんでした。接続設定をやり直してください。');
  return api;
}
function escapeDriveQuery(value) { return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
async function listDriveChildren(api, parentId) {
  const result = []; let pageToken = '';
  do {
    const query = new URLSearchParams({ q: "'" + escapeDriveQuery(parentId) + "' in parents and trashed = false", pageSize: '1000', fields: 'nextPageToken,files(id,name,mimeType)', ...(pageToken ? { pageToken } : {}) });
    const page = await api.driveRequest('GET', 'files?' + query);
    result.push(...(page.files || [])); pageToken = page.nextPageToken || '';
  } while (pageToken);
  return result;
}
async function ensureDriveFolder(api, parentId, name) {
  const matches = (await listDriveChildren(api, parentId)).filter(x => x.name === name && x.mimeType === DRIVE_FOLDER_MIME);
  if (matches.length > 1) throw new Error('Google Driveに同じ名前の作業フォルダーが複数あります。');
  if (matches.length === 1) return matches[0].id;
  const folder = await api.driveRequest('POST', 'files', { name, mimeType: DRIVE_FOLDER_MIME, parents: [parentId] });
  if (!folder?.id) throw new Error('Google Driveに作業フォルダーを作成できませんでした。');
  return folder.id;
}
async function ensureTravelFolder(api, hub) {
  let id = readTravelFolderId(hub);
  if (id) {
    const folder = await api.driveRequest('GET', 'files/' + encodeURIComponent(id) + '?fields=id,name,mimeType,trashed');
    if (!folder || folder.trashed || folder.mimeType !== DRIVE_FOLDER_MIME) throw new Error('設定済みのGoogle Drive作業フォルダーが見つからないか、フォルダーではありません。config.json の travelFolderId を確認してください。');
    return id;
  }
  id = await ensureDriveFolder(api, 'root', 'Mery Chromebook');
  saveTravelFolderId(hub, id);
  return id;
}
function validDriveLocalPath(relative) {
  const normalized = path.posix.normalize(relative.replace(/\\/g, '/'));
  if (normalized === 'TASKS.md' || normalized === META) return normalized;
  if (normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized) || !/^(?:img|notes)\/.+/i.test(normalized)) return null;
  return normalized;
}
function mimeTypeFor(file) {
  return ({ '.md': 'text/markdown', '.json': 'application/json', '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}
async function uploadDriveTree(api, driveRootId, localRoot) {
  const folderCache = new Map([['', driveRootId]]), childCache = new Map(); let count = 0;
  async function children(id) { if (!childCache.has(id)) childCache.set(id, await listDriveChildren(api, id)); return childCache.get(id); }
  async function ensurePath(parts) {
    let parent = driveRootId, prefix = '';
    for (const name of parts) {
      prefix = prefix ? prefix + '/' + name : name;
      if (folderCache.has(prefix)) { parent = folderCache.get(prefix); continue; }
      parent = await ensureDriveFolder(api, parent, name); folderCache.set(prefix, parent);
    }
    return parent;
  }
  async function walk(dir, relativeDir = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const relative = relativeDir ? relativeDir + '/' + entry.name : entry.name;
      const local = path.join(dir, entry.name);
      if (entry.isDirectory()) { await ensurePath(relative.split('/')); await walk(local, relative); continue; }
      if (!entry.isFile() || !validDriveLocalPath(relative)) continue;
      const parts = relative.split('/'), name = parts.pop(), parent = await ensurePath(parts), existing = (await children(parent)).filter(x => x.name === name && x.mimeType !== DRIVE_FOLDER_MIME);
      if (existing.length > 1) throw new Error('Google Driveに同名ファイルが複数あります: ' + relative);
      const metadata = { name, mimeType: mimeTypeFor(name), ...(!existing.length ? { parents: [parent] } : {}) };
      const saved = await api.driveUpload(existing[0]?.id || '', metadata, fs.readFileSync(local), metadata.mimeType);
      if (!saved?.id) throw new Error('Google Driveへの保存結果を確認できませんでした: ' + relative);
      if (!existing.length) (await children(parent)).push({ id: saved.id, name, mimeType: metadata.mimeType });
      count++;
    }
  }
  await walk(localRoot);
  return count;
}
async function downloadDriveTree(api, driveRootId, localRoot) {
  let count = 0;
  async function walk(parentId, relativeDir = '') {
    for (const item of await listDriveChildren(api, parentId)) {
      const relative = relativeDir ? relativeDir + '/' + item.name : item.name;
      if (!item.name || item.name === '.' || item.name === '..' || /[\\/]/.test(item.name)) throw new Error('Google Drive内のファイル名を安全に扱えません: ' + item.name);
      if (item.mimeType === DRIVE_FOLDER_MIME) {
        if (relativeDir || ['img', 'notes'].includes(item.name)) await walk(item.id, relative);
        continue;
      }
      const safe = validDriveLocalPath(relative);
      if (!safe) continue;
      const destination = path.resolve(localRoot, ...safe.split('/'));
      if (!destination.startsWith(path.resolve(localRoot) + path.sep)) throw new Error('Google Driveのファイルパスが不正です。');
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, await api.driveDownload(item.id)); count++;
    }
  }
  await walk(driveRootId);
  return count;
}
async function directDriveTravel(hub, mode) {
  hub = path.resolve(hub);
  const config = readConfiguration(hub), api = await connectDrive(config), folderId = await ensureTravelFolder(api, hub);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mery-chromebook-drive-'));
  try {
    const downloaded = await downloadDriveTree(api, folderId, temp);
    if (mode === 'export') {
      const result = exportTravel(hub, temp);
      const uploaded = await uploadDriveTree(api, folderId, temp);
      return { ...result, uploaded, folderId };
    }
    const result = importTravel(hub, temp);
    const metadata = path.join(temp, META);
    if (fs.existsSync(metadata)) {
      const saved = (await listDriveChildren(api, folderId)).filter(x => x.name === META && x.mimeType !== DRIVE_FOLDER_MIME);
      if (saved.length !== 1) throw new Error('外出管理情報のDrive上のファイルを一意に特定できません。');
      await api.driveUpload(saved[0].id, { name: META, mimeType: 'application/json' }, fs.readFileSync(metadata), 'application/json');
    }
    return { ...result, downloaded, folderId };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

function writeTravelStatus(hub, message) {
  const file = path.join(path.resolve(hub), '.mery-calendar', 'chromebook-travel-status.txt');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + crypto.randomBytes(5).toString('hex') + '.tmp';
  fs.writeFileSync(temp, message, 'utf8'); fs.renameSync(temp, file);
}
async function cli(args = process.argv.slice(2)) {
  const option = name => { const i = args.indexOf(name); return i < 0 ? '' : args[i + 1]; };
  const hub = option('--hub'), travel = option('--travel'), directMode = args.includes('--drive-import') ? 'import' : args.includes('--drive-export') ? 'export' : '';
  const mode = directMode || (args.includes('--import') ? 'import' : args.includes('--export') ? 'export' : '');
  if (!hub || !mode || (!directMode && !travel)) throw new Error('使い方: node chromebook-travel.cjs --hub <作業ハブ> --travel <フォルダー> --export|--import または --hub <作業ハブ> --drive-export|--drive-import');
  try {
    const result = directMode ? await directDriveTravel(hub, mode) : mode === 'export' ? exportTravel(hub, travel) : importTravel(hub, travel);
    const summary = directMode
      ? (mode === 'export' ? 'Google Driveへ外出用データを直接アップロードしました。' : 'Google Driveから外出データを取り込みました。') + '\nTASKS: ' + result.taskCount + '件 / 資料: ' + result.assetCount + '件 / ファイル: ' + (result.uploaded ?? result.downloaded) + '件\nDriveフォルダーID: ' + result.folderId
      : (mode === 'export' ? '外出用データを書き出しました。' : '外出データを取り込みました。') + '\nTASKS: ' + result.taskCount + '件 / 資料: ' + result.assetCount + '件';
    writeTravelStatus(hub, summary); console.log(summary); return result;
  } catch (error) { writeTravelStatus(hub, 'エラー: ' + error.message); throw error; }
}

module.exports = { safeRelative, referencedFiles, exportTravel, importTravel, directDriveTravel, uploadDriveTree, downloadDriveTree, decode, cli };
if (require.main === module) {
  cli().catch(error => { console.error(error.message); process.exitCode = 1; });
}
