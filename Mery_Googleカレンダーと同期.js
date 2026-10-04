#title = "My Tasks / LOG と双方向同期"

// このファイルだけを Mery に登録して実行できます。Node.js 24 以上が必要です。
// SQLite・Google 認証・同期処理は下部に埋め込まれています。
// 初回のみ HUB_DIR + "\\.mery-calendar\\oauth-client.json" に Google の認証 JSON を置いてください。
var HUB_DIR = "C:\\Projects\\ai-work-hub";
var NODE_EXE = "node";

// 埋め込まれた処理を準備してから、ファイル末尾で実行します。

function main() {
    try {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        ensureRuntimeFolder(HUB_DIR, fso);
        var runtimeDir = fso.BuildPath(HUB_DIR, ".mery-calendar");
        ensureRuntimeFolder(runtimeDir, fso);
        var helper = fso.BuildPath(runtimeDir, "calendar-runtime.cjs");
        writeRuntime(helper, EMBEDDED_CALENDAR_RUNTIME);
        var menu = CreatePopupMenu();
        menu.Add("Google カレンダー / Tasks の接続設定", 1);
        menu.Add("同期内容をプレビュー（予定・TASKS・LOGは変更しない）", 2);
        menu.Add("TODO → My Tasks / LOG → カレンダーを双方向同期", 3);
        menu.Add("処理状況・結果を確認", 4);
        var selected = menu.Track(0);
        if (selected === 0) return;
        var statusPath = HUB_DIR + "\\.mery-calendar\\run-status.json";
        if (selected === 4) {
            if (!fso.FileExists(statusPath)) { alert("まだ処理状況がありません。接続設定またはプレビューを実行してください。"); return; }
            var current = JSON.parse(readUtf8Text(statusPath));
            if (current.phase === "running" || current.phase === "queued") {
                showStatusMessage("処理中です。少し待ってから、もう一度結果を確認してください。\n開始: " + current.startedAt); return;
            }
            if (current.mode === "--sync") reloadOpenHubDocuments();
            var finishedReport = HUB_DIR + "\\CALENDAR_SYNC_REPORT.md";
            if (fso.FileExists(finishedReport)) showReport(finishedReport);
            if (!fso.FileExists(finishedReport)) showStatusMessage("処理は終了しましたが、レポートがありません。接続設定と Node.js を確認してください。");
            return;
        }
        if (fso.FileExists(HUB_DIR + "\\.mery-calendar\\sync.lock")) throw new Error("別の同期処理が実行中です。処理状況を確認してください。");
        if (fso.FileExists(statusPath)) {
            var pending = JSON.parse(readUtf8Text(statusPath));
            if (pending.phase === "queued" && new Date().getTime() - pending.startedMs < 60000) throw new Error("処理を起動しています。少し待ってから状況を確認してください。");
        }

        if (selected !== 1) {
            if (!Confirm("開いている TASKS.md / LOG.md / TODO.md の編集を保存して処理します。\n"
                + (selected === 3 ? "追加・変更・削除を双方向に反映します。競合は保留し、ローカル変更前にバックアップを作成します。\n初回はプレビューで対象を確認してください。\n" : "カレンダーの読み取りと同期内容の確認を行います。\n")
                + "続行しますか？")) return;
            saveOpenHubDocuments();
        }

        var mode = selected === 1 ? "--auth" : selected === 2 ? "--preview" : "--sync";
        var runner = new ActiveXObject("WScript.Shell");
        writeRunStatus(statusPath, JSON.stringify({phase:"queued",mode:mode,startedAt:new Date().toLocaleString(),startedMs:new Date().getTime()}));
        var progressPath = HUB_DIR + "\\.mery-calendar\\progress.html";
        writeRunStatus(progressPath, "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"1\"><title>Mery 同期</title><p>同期処理を起動しています…</p>");
        runner.Run(quoteArg(NODE_EXE) + " " + quoteArg(helper) + " --hub " + quoteArg(HUB_DIR) + " " + mode + " --tasks", 0, false);
        runner.Run(quoteArg(progressPath), 1, false);
        showStatusMessage("進捗画面を開きました。\n完了後、このマクロの「処理状況・結果を確認」を選んでください。\n同期中の TASKS.md / LOG.md / TODO.md の編集は、完了後に行ってください。");
    } catch (e) {
        alert("Google カレンダー同期エラー: " + e.message);
    }
}

function writeRunStatus(path, text) {
    var stream = new ActiveXObject("ADODB.Stream");
    try { stream.Type=2; stream.Charset="utf-8"; stream.Open(); stream.WriteText(text); stream.SaveToFile(path,2); }
    finally { if (stream.State !== 0) stream.Close(); }
}

function quoteArg(value) {
    if (/["\r\n%]/.test(value)) throw new Error("実行パスに対応していない文字があります。");
    return '"' + value + '"';
}

function findDocument(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var target = fso.GetAbsolutePathName(path).toLowerCase();
    for (var i = 0; i < editor.Documents.Count; i++) {
        var d = editor.Documents.Item(i);
        if (d.FullName && fso.GetAbsolutePathName(d.FullName).toLowerCase() === target) return d;
    }
    return null;
}

function saveOpenHubDocuments() {
    saveOpenTodoDocuments();
    var names = ["TASKS.md", "LOG.md"];
    for (var i = 0; i < names.length; i++) {
        var d = findDocument(HUB_DIR + "\\" + names[i]);
        if (d) d.Save(d.FullName);
    }
}

function saveOpenTodoDocuments() {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    for (var i=0;i<editor.Documents.Count;i++) {
        var d=editor.Documents.Item(i);
        if(d.FullName && fso.GetFileName(d.FullName).toLowerCase()==="todo.md" && !d.Saved) d.Save(d.FullName);
    }
}

function reloadOpenHubDocuments() {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    for (var j=0;j<editor.Documents.Count;j++) {
        var todo=editor.Documents.Item(j);
        if(todo.FullName && fso.GetFileName(todo.FullName).toLowerCase()==="todo.md") {
            if(!todo.Saved) throw new Error("TODO.md に未保存の変更があります。開き直して確認してください。");
            todo.Text=readUtf8Text(todo.FullName);todo.Saved=true;
        }
    }
    var names = ["TASKS.md", "LOG.md"];
    for (var i = 0; i < names.length; i++) {
        var path = HUB_DIR + "\\" + names[i];
        var d = findDocument(path);
        if (d) {
            if (!d.Saved) throw new Error(names[i] + " に未保存の変更があります。同期済みファイルを確認してから開き直してください。");
            d.Text = readUtf8Text(path);
            d.Saved = true;
        }
    }
}

function showReport(path) {
    var d = findDocument(path);
    if (!d) {
        editor.NewFile();
        d = editor.ActiveDocument;
    }
    d.Text = readUtf8Text(path);
    d.Save(path);
    d.Activate();
    d.selection.StartOfDocument(false);
}

function readUtf8Text(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(path)) {
        return "";
    }

    // BOM を調べ、既存の UTF-16 ファイルも正しく読む。新規保存は UTF-8。
    var stream = new ActiveXObject("ADODB.Stream");
    try {
        stream.Type = 2;
        stream.Charset = "iso-8859-1";
        stream.Open();
        stream.LoadFromFile(path);
        var prefix = stream.ReadText(3);
        stream.Position = 0;
        if (prefix.charCodeAt(0) === 255 && prefix.charCodeAt(1) === 254) {
            stream.Charset = "unicode";
        } else if (prefix.charCodeAt(0) === 254 && prefix.charCodeAt(1) === 255) {
            stream.Charset = "unicodeFFFE";
        } else {
            stream.Charset = "utf-8";
        }
        return stream.ReadText().replace(/^\uFEFF/, "");
    } finally {
        if (stream.State !== 0) stream.Close();
    }
}


function showStatusMessage(text) {
    var path = HUB_DIR + "\\SYNC_STATUS.md";
    writeRunStatus(path, "# Google 同期の処理状況\n\n" + text + "\n" );
    showReport(path);
}

function ensureRuntimeFolder(path, fso) {
    if (fso.FolderExists(path)) return;
    var parent = fso.GetParentFolderName(path);
    if (parent && !fso.FolderExists(parent)) ensureRuntimeFolder(parent, fso);
    fso.CreateFolder(path);
}

function writeRuntime(path, text) {
    var stream = new ActiveXObject("ADODB.Stream");
    try {
        stream.Type = 2;
        stream.Charset = "utf-8";
        stream.Open();
        stream.WriteText(text);
        stream.SaveToFile(path, 2);
    } finally {
        if (stream.State !== 0) stream.Close();
    }
}

// 以下は自動生成部分です。変更後は calendar-sync/build-single-file.cjs で再生成します。
var EMBEDDED_CALENDAR_RUNTIME = [
    "'use strict';\nconst __path = require('node:path');\nconst __definitions = {\"progress.cjs\": function(require, module, exports, __filename, __dirname) {\nconst esca",
    "pe=value=>String(value??'').replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[ch]));\nfunction render(state){const active=stat",
    "e.phase==='running'||state.phase==='queued';const title=active?'同期処理中':state.ok?'処理が完了しました':'処理にエラーがあります';const count=Number.isInteger(state.total)?'<p class=\"c",
    "ount\">'+escape(state.done||0)+' / '+escape(state.total)+' 件</p><progress max=\"'+Math.max(1,state.total)+'\" value=\"'+(state.done||0)+'\"></progress>':'';return '<",
    "!doctype html><html lang=\"ja\"><meta charset=\"utf-8\">'+(active?'<meta http-equiv=\"refresh\" content=\"1\">':'')+'<title>Mery 同期の進捗</title><style>body{font:18px syst",
    "em-ui;background:#f4f6fa;color:#243247;margin:8vh auto;max-width:680px;padding:24px}main{background:white;padding:36px;border-radius:18px;box-shadow:0 8px 32px ",
    "#24324712}h1{font-size:26px}progress{width:100%;height:18px;accent-color:#287c70}.count{font-size:28px}small{color:#64748b}</style><main><h1>'+title+'</h1><p>'+",
    "escape(state.stage||'処理を起動しています')+'</p>'+count+'<p>'+escape(state.item||'')+'</p><p>'+escape(state.error||'')+'</p><small>'+(active?'1秒ごとに自動更新します。通信待ちの間は件数が変わらな",
    "いことがあります。':'Meryの同期マクロから「処理状況・結果を確認」を選んでください。')+'</small></main></html>';}\nmodule.exports={render};\n\n},\n\"task-identities.cjs\": function(require, module, exports",
    ", __filename, __dirname) {\n'use strict';\nconst fs=require('node:fs'),crypto=require('node:crypto');\nconst core=require('./calendar-sync-core.cjs');\nconst strip=",
    "text=>text.replace(/\\s*<!-- mery-calendar:[a-f0-9]{32} -->/g,'').replace(/\\r\\n?/g,'\\n');\nfunction load(file){if(!fs.existsSync(file))return [];const data=JSON.p",
    "arse(fs.readFileSync(file,'utf8'));if(data.version!==1||!Array.isArray(data.snapshots)||data.snapshots.some(x=>typeof x!=='string'))throw Error('TASKS のIDファイルが不",
    "正です。バックアップから復元してください。');return data.snapshots;}\nfunction restore(text,snapshots){\n  const parsed=core.parseDocument(text,'TASKS');if(!snapshots.length)return pa",
    "rsed.text;\n  const explicit=new Set(text.match(/<!-- mery-calendar:([a-f0-9]{32}) -->/g)?.map(x=>x.match(/[a-f0-9]{32}/)[0])||[]);\n  const context=x=>x.date+'\\0",
    "'+x.section,key=x=>context(x)+'\\0'+x.text;\n  const newKeys=new Set(parsed.items.map(key));\n  const candidates=snapshots.map(s=>({text:s,items:core.parseDocument",
    "(s,'TASKS').items}));\n  const chosen=candidates.find(x=>strip(x.text)===strip(text))||candidates.sort((a,b)=>b.items.filter(x=>newKeys.has(key(x))).length-a.ite",
    "ms.filter(x=>newKeys.has(key(x))).length)[0];\n  let old=chosen.items.filter(x=>!explicit.has(x.id)),fresh=parsed.items.filter(x=>!explicit.has(x.id));const ids=",
    "new Map();\n  function match(group,duplicates){\n    for(const k of new Set(fresh.map(group))){const a=old.filter(x=>group(x)===k),b=fresh.filter(x=>group(x)===k)",
    ";if(!a.length)continue;if(a.length===1&&b.length===1||duplicates&&a.length===b.length){for(let i=0;i<a.length;i++)ids.set(b[i].index,a[i].id);old=old.filter(x=>",
    "!a.includes(x));fresh=fresh.filter(x=>!b.includes(x));}else if(duplicates)throw Error('同名の重複項目のIDを特定できません。削除前の状態に戻して項目名を区別してから同期してください。');}\n  }\n  match(key,true",
    ");match(x=>x.text,false);\n  // Remaining edits can be paired within a date/subsection only when their count agrees.\n  for(const k of new Set(fresh.map(context))",
    "){const a=old.filter(x=>context(x)===k),b=fresh.filter(x=>context(x)===k);if(!a.length)continue;if(a.length!==b.length)throw Error('TASKS の編集・追加・削除が同じ欄で重なり、IDを特",
    "定できません。編集を分けて同期してください。');for(let i=0;i<a.length;i++)ids.set(b[i].index,a[i].id);old=old.filter(x=>!a.includes(x));fresh=fresh.filter(x=>!b.includes(x));}\n  if(o",
    "ld.length&&fresh.length){if(old.length===1&&fresh.length===1)ids.set(fresh[0].index,old[0].id);else throw Error('TASKS の移動と編集が重なり、IDを特定できません。移動と編集を分けて同期してください。'",
    ");}\n  const parsedLines=new Set(parsed.items.map(x=>x.index));\n  const loose=text.replace(/\\r\\n?/g,'\\n').split('\\n').filter((line,index)=>!parsedLines.has(index",
    ")).map(line=>line.match(/^[-*]\\s+\\[[ xX]\\]\\s*(.*)$/)?.[1]?.replace(/\\s*<!-- mery-calendar:[a-f0-9]{32} -->/g,'').trim()).filter(Boolean);\n  if(old.some(x=>loose",
    ".includes(x.text)))throw Error('同期済み項目が日付見出しの外にあります。日付見出しを確認してください。');\n  const lines=parsed.text.split('\\n');for(const item of parsed.items)if(ids.has(item.inde",
    "x))lines[item.index]=lines[item.index].replace(item.id,ids.get(item.index));\n  const result=lines.join('\\n');core.parseDocument(result,'TASKS');return result;\n}",
    "\nfunction checkpoint(file,marked,snapshots){\n  const next=[marked,...snapshots.filter(x=>x!==marked)].slice(0,3),tmp=file+'.'+crypto.randomBytes(6).toString('he",
    "x')+'.tmp';\n  fs.writeFileSync(tmp,JSON.stringify({version:1,snapshots:next},null,2),'utf8');fs.renameSync(tmp,file);return next;\n}\nmodule.exports={strip,load,r",
    "estore,checkpoint};\n\n},\n\"tasks-sync.cjs\": function(require, module, exports, __filename, __dirname) {\n'use strict';\nconst fs=require('node:fs'),path=require('no",
    "de:path'),crypto=require('node:crypto');\nconst {DatabaseSync}=require('node:sqlite');\nconst core=require('./calendar-sync-core.cjs');\nconst identities=require('",
    "./task-identities.cjs');\nconst marker=/\\s*<!-- mery-calendar:([a-f0-9]{32}) -->/;\nconst dueMarker=/\\s*<!-- mery-due:(\\d{4}-\\d{2}-\\d{2}) -->/;\nfunction decode(b)",
    "{if(b[0]===255&&b[1]===254)return b.subarray(2).toString('utf16le');if(b[0]===254&&b[1]===255){const c=Buffer.from(b.subarray(2));c.swap16();return c.toString('",
    "utf16le');}return b.toString('utf8').replace(/^\\uFEFF/,'');}\nfunction parse(text,file,isTasks){\n  if(isTasks){const p=core.parseDocument(text,'TASKS');return {.",
    "..p,items:p.items.map(x=>({...x,file}))};}\n  const lines=text.replace(/\\r\\n?/g,'\\n').split('\\n'),items=[];let fence='';\n  for(let index=0;index<lines.length;ind",
    "ex++){\n    const line=lines[index],f=line.match(/^\\s*(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1][0];else if(fence===f[1][0])fence='';continue;}if(fence)continue;",
    "\n    const m=line.match(/^\\s*[-*]\\s+\\[([ xX])\\]\\s*(.+)$/);if(!m)continue;\n    const id=m[2].match(marker)?.[1]||crypto.randomBytes(16).toString('hex'),date=m[2]",
    ".match(dueMarker)?.[1]||'';\n    if(date&&!(/^\\d{4}-\\d{2}-\\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOSt",
    "ring().slice(0,10)===date))throw Error('TODO の日付が不正です: '+file);\n    const body=m[2].replace(marker,'').replace(dueMarker,'').trim();if(!body)continue;\n    if(!m",
    "[2].match(marker))lines[index]=line+' <!-- mery-calendar:'+id+' -->';\n    items.push({id,file,index,kind:'TODO',text:body,done:m[1].toLowerCase()==='x',date});\n",
    "  }\n  for(const line of lines){const id=line.match(marker)?.[1];if(id&&!items.some(x=>x.id===id))throw Error('同期済み TODO を解析できません: '+file);}\n  return {text:lines",
    ".join('\\n'),items};\n}\nconst fields=x=>({text:x.text,done:!!x.done,date:x.date||''});\nconst equal=(a,b)=>JSON.stringify(fields(a))===JSON.stringify(fields(b));\nf",
    "unction resource(x,notes=''){return {title:x.text,status:x.done?'completed':'needsAction',due:x.date?x.date+'T00:00:00.000Z':null,notes};}\nasync function pages(",
    "api,route,params={}){const items=[];let page='';do{const r=await api.tasksRequest('GET',route+'?'+new URLSearchParams({...params,...(page?{pageToken:page}:{})})",
    ");items.push(...(r.items||[]));page=r.nextPageToken||'';}while(page);return items;}\nfunction save(file,text,original){if(!fs.readFileSync(file).equals(original)",
    ")throw Error('同期中に変更されました: '+file);fs.writeFileSync(file+'.backup_'+Date.now()+'_'+crypto.randomBytes(3).toString('hex')+'.md',original,{flag:'wx'});const temp=",
    "file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';fs.writeFileSync(temp,'\\uFEFF'+text);fs.renameSync(temp,file);}\nfunction todayDate(){return new Intl.DateT",
    "imeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}\nfunction updateDocument(doc,item,remote,today=today",
    "Date()){\n  if(item.kind==='TASKS'&&remote&&item.date===today&&item.section==='今日やる'){\n    const lines=doc.split('\\n'),index=lines.findIndex(line=>line.match(mar",
    "ker)?.[1]===item.id);\n    if(index>=0){lines[index]='- ['+(remote.done?'x':' ')+'] '+remote.text+(item.start?' @'+item.start+'-'+item.end:'')+' <!-- mery-calend",
    "ar:'+item.id+' -->';return lines.join('\\n');}\n  }\n  if(item.kind==='TASKS')return core.applyItems({TASKS:doc,LOG:''},remote?[{...item,...fields(remote),date:tod",
    "ay,section:'今日やる'}]:[],remote?[]:[item.id]).TASKS;\n  const lines=doc.split('\\n'),index=lines.findIndex(x=>x.match(marker)?.[1]===item.id);if(index<0)throw Error",
    "('TODO 項目が見つかりません。');\n  if(!remote)lines.splice(index,1);else{const prefix=lines[index].match(/^(\\s*[-*]\\s+)\\[[ xX]\\]\\s*/)[1];lines[index]=prefix+'['+(remote.do",
    "ne?'x':' ')+'] '+remote.text+(remote.date?' <!-- mery-due:'+remote.date+' -->':'')+' <!-- mery-calendar:'+item.id+' -->';}return lines.join('\\n');\n}\nasync funct",
    "ion run(config,api,apply,onProgress=()=>{}){\n  onProgress({stage:\"My Tasks のリストを確認しています\",done:null,total:null,item:\"\"});\n  const lists=await pages(api,'users/@m",
    "e/lists',{maxResults:'100'});\n  const list=config.taskListId?lists.find(x=>x.id===config.taskListId):lists.find(x=>x.title==='My Tasks');\n  if(!list)throw Error",
    "('My Tasks が見つかりません。.mery-calendar/config.json の taskListId に対象リストIDを指定してください。利用可能: '+lists.map(x=>x.title+' / '+x.id).join(', '));\n  let paths=config.todoPaths",
    ";\n  if(paths===undefined){const view=path.join(config.hub,'PROJECT_TODO.md');const source=fs.existsSync(view)?decode(fs.readFileSync(view)).match(/^Source:\\s*`(",
    "[^`]+)`/m)?.[1]:null;paths=source?[source]:[];}\n  if(!Array.isArray(paths)||paths.some(x=>typeof x!=='string'||!x))throw Error('todoPaths は TODO.md のフルパスの配列にしてく",
    "ださい。');\n  const files=[path.join(config.hub,'TASKS.md'),...paths.map(x=>path.resolve(config.hub,x))];\n  if(new Set(files.map(x=>x.toLowerCase())).size!==files.l",
    "ength)throw Error('同期対象ファイルが重複しています。');\n  const docs=new Map(),local=new Map();\n  const identityFile=path.join(config.dir,'tasks-ids.json');let snapshots=identi",
    "ties.load(identityFile);\n  for(const file of files){const original=fs.readFileSync(file),text=decode(original),parsed=parse(file===files[0]?identities.restore(t",
    "ext,snapshots):text,file,file===files[0]);docs.set(file,{original,...parsed});for(const x of parsed.items){if(local.has(x.id))throw Error('同期IDがファイル間で重複しています。コピ",
    "ー先の同期マーカーを削除してください。');local.set(x.id,x);}}\n  function saveDocument(file,text,d){\n    let visible=text;if(file===files[0]){snapshots=identities.checkpoint(identi",
    "tyFile,text,snapshots);visible=identities.strip(text);}\n    if(visible!==decode(d.original)){save(file,visible,d.original);d.original=fs.readFileSync(file);}d.t",
    "ext=text;\n  }\n  const db=new DatabaseSync(path.join(config.dir,'tasks.sqlite'));let summary='\\n## My Tasks\\n\\n';\n  try{\n    db.exec('CREATE TABLE IF NOT EXISTS ",
    "state (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS binding (id INTEGER PRIMARY KEY CHECK(id=1), account TEXT NOT NULL, list TEXT NOT N",
    "ULL)');\n    const binding=db.prepare('SELECT * FROM binding').get();if(binding&&(binding.account!==config.calendarId||binding.list!==list.id))throw Error('My Ta",
    "sks の同期アカウントまたはリストが変更されています。');\n    const state=new Map(db.prepare('SELECT * FROM state').all().map(x=>[x.id,JSON.parse(x.value)]));\n    if(!snapshots.length&&s",
    "tate.size&&![...local.keys()].some(id=>state.has(id))&&[...state.values()].some(b=>b.file===files[0]))throw Error('TASKS のIDファイルがありません。IDを削除する前の TASKS.md または ta",
    "sks-ids.json を復元してください。');\n    for(const b of state.values())if(!docs.has(b.file))throw Error('同期済み TODO が対象から外れています。todoPaths に戻してください: '+b.file);\n    const ro",
    "ute='lists/'+encodeURIComponent(list.id)+'/tasks';\n    onProgress({stage:\"My Tasks の項目を読み込んでいます\"});\n    const remoteList=await pages(api,route,{maxResults:'100'",
    ",showCompleted:'true',showDeleted:'true',showHidden:'true'}),remote=new Map();\n    for(const r of remoteList){let id=[...state].find(([,b])=>b.remoteId===r.id)?",
    ".[0]||r.notes?.match(/^Mery sync: ([a-f0-9]{32})$/m)?.[1];if(!id){if(r.deleted||r.hidden)continue;id=crypto.createHash('sha256').update(list.id+'\\0'+r.id).diges",
    "t('hex').slice(0,32);}if(remote.has(id))throw Error('My Tasks の同期IDが重複しています。');remote.set(id,{...r,text:r.title||'',done:r.status==='completed',date:r.due?.slic",
    "e(0,10)||''});}\n    const today=config.today||todayDate();\n    summary+='リスト: '+list.title+' / Google取得: '+remoteList.length+'件 / 同期対象: '+local.size+'件 / 照合済み: ",
    "'+remote.size+'件\\n\\n';\n    if(apply){db.prepare('INSERT OR IGNORE INTO binding VALUES(1,?,?)').run(config.calendarId,list.id);for(const [file,d] of docs)if(file",
    "===files[0]||d.text!==decode(d.original))saveDocument(file,d.text,d);}\n    const allIds=[...new Set([...local.keys(),...state.keys(),...remote.keys()])];let pro",
    "cessed=0;\n    for(const id of allIds){\n      onProgress({stage:apply?\"My Tasks を同期しています\":\"My Tasks の変更を確認しています\",done:processed++,total:allIds.length,item:local.",
    "get(id)?.text||remote.get(id)?.text||state.get(id)?.local.text||\"\"});\n      const l=local.get(id),r=remote.get(id),b=state.get(id);let action;\n      if(apply&&r",
    "&&b?.remoteId===r.id&&r.notes?.split(/\\r?\\n/).includes('Mery sync: '+id)){\n        try{const notes=r.notes.split(/\\r?\\n/).filter(line=>line!=='Mery sync: '+id).",
    "join('\\n');const updated=await api.tasksRequest('PATCH',route+'/'+encodeURIComponent(r.id),{notes},r.etag);r.notes=notes;r.etag=updated?.etag||r.etag;}\n        ",
    "catch(error){summary+='- IDメモの整理を保留: '+(r.text||id)+' / '+error.message+'\\n';process.exitCode=1;}\n      }\n      if(!b)action=!l?(r&&!r.deleted?'Mery 新規取込':'同期情報",
    "整理'):l&&r&&!r.deleted?(equal(l,r)?'変更なし':'競合'):l&&r?.deleted?'競合':'新規登録';\n      else if(!l&&(!r||r.deleted))action='同期情報整理';\n      else if(!l)action=equal(r,b.r",
    "emote)?'Google から削除':'競合';\n      else if(!r||r.deleted)action=equal(l,b.local)?'Mery から削除':'競合';\n      else{const lc=!equal(l,b.local),rc=!equal(r,b.remote);act",
    "ion=lc&&rc?(equal(l,r)?'変更なし':'競合'):lc?'Google 更新':rc?'Mery 更新':'変更なし';}\n      if(r&&!r.deleted&&(!r.text.trim()||/[\\r\\n]/.test(r.text)))action='競合';\n      if(a",
    "ction==='変更なし'&&l?.kind==='TASKS'&&(!l.done||l.date===today)&&(l.date!==today||l.section!=='今日やる'))action='Mery 配置更新';\n      const pulling=['Mery 更新','Mery 配置更新",
    "','Mery 新規取込'].includes(action);\n      const source=l||{id,file:files[0],kind:'TASKS',date:today,section:'今日やる',start:'',end:''};\n      summary+='- '+action+': ",
    "'+(pulling?r.text:l?.text||b?.local.text||id)+'\\n';\n      if(pulling||action==='競合')summary+='  Mery: '+JSON.stringify(l?fields(l):null)+' / Google: '+JSON.stri",
    "ngify(r&&!r.deleted?fields(r):null)+'\\n';\n      if(pulling)summary+='  反映先: '+(source.kind==='TASKS'?today+' / 今日やる':source.file)+'\\n';\n      if(r)summary+='  G",
    "oogle項目: '+JSON.stringify(fields(r))+'\\n';\n      if(!apply||action==='競合')continue;\n      try{\n        let saved=r;const file=l?.file||b?.file||files[0],d=docs.",
    "get(file);\n        // Temporary recovery marker covers a crash between POST and saving the Google ID locally.\n        if(action==='新規登録')saved=await api.tasksRe",
    "quest('POST',route,resource(l,'Mery sync: '+id));\n        if(action==='Google 更新')saved=await api.tasksRequest('PATCH',route+'/'+encodeURIComponent(r.id),resour",
    "ce({...l,date:l.date===b.local.date?r.date:l.date},r.notes),r.etag);\n        if(action==='Google から削除')await api.tasksRequest('DELETE',route+'/'+encodeURICompon",
    "ent(r.id),null,r.etag);\n        if(pulling||action==='Mery から削除'){const next=updateDocument(d.text,source,pulling?r:null,today);saveDocument(file,next,d);}\n    ",
    "    if(['同期情報整理','Google から削除','Mery から削除'].includes(action)){db.prepare('DELETE FROM state WHERE id=?').run(id);continue;}\n        const current=pulling?{...so",
    "urce,...fields(r),...(source.kind==='TASKS'?{date:today}:{})}:l;\n        const snapshot={file,local:fields(current),remote:fields({...saved,text:saved.title||sa",
    "ved.text,done:saved.status==='completed',date:saved.due?.slice(0,10)||''}),remoteId:saved.id};\n        db.prepare('INSERT INTO state VALUES(?,?) ON CONFLICT(id)",
    " DO UPDATE SET value=excluded.value').run(id,JSON.stringify(snapshot));\n        if(saved.notes?.split(/\\r?\\n/).includes('Mery sync: '+id)){\n          const note",
    "s=saved.notes.split(/\\r?\\n/).filter(line=>line!=='Mery sync: '+id).join('\\n');\n          await api.tasksRequest('PATCH',route+'/'+encodeURIComponent(saved.id),{",
    "notes},saved.etag);\n        }\n      }catch(error){summary+='  エラー: '+error.message+'\\n';process.exitCode=1;}\n    }\n    onProgress({stage:'My Tasks の処理完了',done:a",
    "llIds.length,total:allIds.length,item:''});\n    return summary+'\\n対象: '+files.join(', ')+'\\n';\n  }finally{db.close();}\n}\nmodule.exports={parse,fields,equal,reso",
    "urce,updateDocument,run,pages,todayDate};\n\n},\n\"calendar-sync-core.cjs\": function(require, module, exports, __filename, __dirname) {\n'use strict';\nconst crypto =",
    " require('node:crypto');\nconst MARKER = /\\s*<!-- mery-calendar:([a-f0-9]{32}) -->/;\nconst STANDARD = {TASKS:['今日やる','次にやる','後で','置く','確認が必要','メモ'],LOG:['やったこと',",
    "'試したこと','うまくいったこと','詰まったこと','次回メモ','メモ']};\nconst uuid = () => crypto.randomBytes(16).toString('hex');\nfunction validDate(date) { const timestamp=Date.parse(date",
    "+'T00:00:00Z'); return /^\\d{4}-\\d{2}-\\d{2}$/.test(date) && Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10)===date; }\nfunction nextDa",
    "te(date) { return new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10); }\nfunction fields(item) { const {kind,date,section,text,done,start",
    ",end} = item; return {kind,date,section,text,done:!!done,start:start||'',end:end||''}; }\nfunction equal(a,b) { return JSON.stringify(fields(a)) === JSON.stringi",
    "fy(fields(b)); }\nfunction parseDocument(input, kind, makeId = uuid) {\n  const lines = input.replace(/\\r\\n?/g,'\\n').split('\\n');\n  const items=[]; const seen=new",
    " Set(); let date='',section='メモ',fence='';\n  for(let index=0;index<lines.length;index++) {\n    const line=lines[index];\n    const f=line.match(/^\\s*(`{3,}|~{3,}",
    ")/);\n    if(f) { if(!fence) fence=f[1][0]; else if(fence===f[1][0]) fence=''; continue; }\n    if(fence) continue;\n    const day=line.match(/^##\\s+(\\d{4}-\\d{2}-\\",
    "d{2})(?:\\s+\\([^)]*\\))?(?:\\s+(今日の作業|作業ログ))?\\s*$/);\n    if(day) { date=validDate(day[1]) ? day[1] : ''; section='メモ'; continue; }\n    const sub=line.match(/^###\\s",
    "+(.+?)\\s*$/);\n    if(sub) {section=sub[1];continue;}\n    if(/^##\\s/.test(line)) {date='';continue;}\n    if(!date) continue;\n    const match=kind==='TASKS' ? lin",
    "e.match(/^[-*]\\s+\\[([ xX])\\]\\s*(.*)$/) : line.match(/^[-*]\\s+(.*)$/);\n    if(!match) continue;\n    let body=kind==='TASKS' ? match[2] : match[1];\n    const mark",
    "er=body.match(MARKER);\n    body=body.replace(MARKER,'').trim();\n    const time=body.match(/\\s+@(\\d{2}:\\d{2})-(\\d{2}:\\d{2})$/);\n    let start='',end='';\n    if(t",
    "ime) {\n      [start,end]=[time[1],time[2]];\n      if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(start)||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(end)||start>=end) throw new Err",
    "or(kind+' の時刻が不正です（同日内の開始 < 終了）: '+(index+1)+'行目');\n      body=body.slice(0,time.index).trim();\n    }\n    if(!body) continue;\n    const id=marker ? marker[1] : ",
    "makeId();\n    if(seen.has(id)) throw new Error(kind+' に同じ同期IDが複数あります: '+id);\n    seen.add(id);\n    if(!marker) lines[index]=line.replace(/\\s+$/,'')+' <!-- mery-",
    "calendar:'+id+' -->';\n    items.push({id,kind,date,section,text:body,done:kind==='TASKS' && match[1].toLowerCase()==='x',start,end,index});\n  }\n  for(const line",
    " of lines) {const id=line.match(MARKER)?.[1];if(id&&!seen.has(id)) throw new Error(kind+' の同期済み項目を解析できません。日付・チェックボックス・時刻を確認してください。');}\n  return {items,text:line",
    "s.join('\\n')};\n}\nfunction toEvent(item) {\n  const prefix=item.kind==='LOG' ? '[LOG] ' : item.done ? '[TASKS ✓] ' : '[TASKS] ';\n  return {\n    summary:prefix+ite",
    "m.text,\n    start:item.start ? {dateTime:item.date+'T'+item.start+':00+09:00',timeZone:'Asia/Tokyo'} : {date:item.date},\n    end:item.end ? {dateTime:item.date+",
    "'T'+item.end+':00+09:00',timeZone:'Asia/Tokyo'} : {date:nextDate(item.date)},\n    extendedProperties:{private:{meryId:item.id,meryKind:item.kind,merySection:ite",
    "m.section}},\n  };\n}\nfunction localTime(value) {\n  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit",
    "',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));\n  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));\n  return {date",
    ":p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute};\n}\nfunction fromEvent(event, calendarId, base) {\n  const meta=event.extendedProperties?.private||{};\n  c",
    "onst id=meta.meryId || base?.id || crypto.createHash('sha256').update(calendarId+'\\n'+event.id).digest('hex').slice(0,32);\n  if(!/^[a-f0-9]{32}$/.test(id)) thro",
    "w new Error('不正な同期ID: '+event.id);\n  const result={id,eventId:event.id,etag:event.etag,deleted:event.status==='cancelled'};\n  if(result.deleted) return result;\n",
    "  try {\n    if(event.recurrence || event.recurringEventId) throw new Error('繰り返し予定は同期対象外です');\n    let date,start='',end='';\n    if(event.start?.date) {\n      da",
    "te=event.start.date;\n      if(!validDate(date)||event.end?.date!==nextDate(date)) throw new Error('複数日の終日予定は同期対象外です');\n    } else {\n      const s=localTime(even",
    "t.start?.dateTime),e=localTime(event.end?.dateTime);\n      if(s.date!==e.date || s.time>=e.time) throw new Error('日をまたぐ予定は同期対象外です');\n      date=s.date;start=s.t",
    "ime;end=e.time;\n    }\n    const summary=event.summary||'';\n    const kind=summary.startsWith('[LOG]') ? 'LOG' : summary.startsWith('[TASKS') ? 'TASKS' : meta.me",
    "ryKind||base?.kind||'TASKS';\n    const done=kind==='TASKS' && summary.startsWith('[TASKS ✓]');\n    const text=summary.replace(/^\\[(?:LOG|TASKS(?: ✓)?)\\]\\s*/,'')",
    ".trim();\n    if(!text||/[\\r\\n]/.test(text)) throw new Error('空または複数行の件名は同期対象外です');\n    const section=meta.merySection||base?.section||(kind==='LOG'?'やったこと':'今日や",
    "る');\n    return {...result,kind,date,start,end,done,text,section};\n  } catch(error) {return {...result,unsupported:error.message};}\n}\nfunction planSync(localIte",
    "ms,remoteItems,entries={}) {\n  const local=new Map(localItems.map(x=>[x.id,x]));\n  const remote=new Map();\n  for(const r of remoteItems) {if(remote.has(r.id)) t",
    "hrow new Error('カレンダーに同じ同期IDが複数あります: '+r.id);remote.set(r.id,r);}\n  const ids=new Set([...local.keys(),...remote.keys(),...Object.keys(entries)]);\n  const opera",
    "tions=[];\n  for(const id of ids) {\n    const l=local.get(id),r=remote.get(id),base=entries[id];\n    let action;\n    if(r?.unsupported) action='conflict';\n    el",
    "se if(!base) {\n      if(l && r && !r.deleted) action=equal(l,r)?'adopt':'conflict';\n      else if(l && r?.deleted) action='conflict';\n      else if(l) action='c",
    "reateRemote';\n      else if(r && !r.deleted) action='pull';\n      else action='forget';\n    } else if(!l && (!r||r.deleted)) action='forget';\n    else if(!l) ac",
    "tion=equal(r,base.remote)?'deleteRemote':'conflict';\n    else if(!r||r.deleted) action=equal(l,base.local)?'deleteLocal':'conflict';\n    else {\n      const lc=!",
    "equal(l,base.local),rc=!equal(r,base.remote);\n      action=lc && rc ? (equal(l,r)?'adopt':'conflict') : lc?'push':rc?'pull':'adopt';\n    }\n    operations.push({",
    "id,action,local:l,remote:r,base});\n  }\n  return operations;\n}\nfunction lineFor(item) {return (item.kind==='TASKS' ? '- ['+(item.done?'x':' ')+'] ' : '- ')+item.",
    "text+(item.start?' @'+item.start+'-'+item.end:'')+' <!-- mery-calendar:'+item.id+' -->';}\nfunction dayHeading(item) {\n  const day=['日','月','火','水','木','金','土'][",
    "new Date(item.date+'T00:00:00Z').getUTCDay()];\n  return '## '+item.date+' ('+day+') '+(item.kind==='TASKS'?'今日の作業':'作業ログ');\n}\nfunction applyItems(documents, upd",
    "ates, removals=[]) {\n  const docs={...documents};\n  for(const id of new Set([...removals,...updates.map(x=>x.id)])) {\n    for(const kind of ['TASKS','LOG']) {\n ",
    "     docs[kind]=docs[kind].split('\\n').filter(line=>line.match(MARKER)?.[1]!==id).join('\\n');\n    }\n  }\n  for(const item of updates) {\n    const lines=docs[item",
    ".kind].split('\\n');\n    // IDs are removed above; locate the destination by date, without rebuilding unrelated content.\n    let day=lines.findIndex(line=>new Re",
    "gExp('^##\\\\s+'+item.date+'(?:\\\\s|$)').test(line));\n    if(day<0) {\n      if(!lines[0]?.startsWith('# '+item.kind)) lines.unshift('# '+item.kind,'');\n      lines",
    ".splice(1,0,'',dayHeading(item),'','### '+item.section,lineFor(item),'','---','');\n    } else {\n      let dayEnd=lines.findIndex((line,i)=>i>day && /^##\\s/.test",
    "(line));\n      if(dayEnd<0) dayEnd=lines.length;\n      let section=lines.findIndex((line,i)=>i>day && i<dayEnd && line.trim()==='### '+item.section);\n      if(s",
    "ection<0) {\n        let end=dayEnd;while(end>day+1 && (!lines[end-1].trim()||/^---+$/.test(lines[end-1].trim()))) end--;\n        lines.splice(end,0,'','### '+it",
    "em.section,lineFor(item),'');\n      } else {\n        let end=section+1;while(end<dayEnd && !/^###\\s/.test(lines[end])&&!/^---+$/.test(lines[end].trim())) end++;",
    "\n        while(end>section+1 && !lines[end-1].trim()) end--;\n        lines.splice(end,0,lineFor(item));\n      }\n    }\n    docs[item.kind]=lines.join('\\n');\n  }\n",
    "  return docs;\n}\nmodule.exports={MARKER,STANDARD,uuid,fields,equal,parseDocument,toEvent,fromEvent,planSync,applyItems};\n\n},\n\"calendar-google.cjs\": function(req",
    "uire, module, exports, __filename, __dirname) {\n'use strict';\nconst fs=require('node:fs');\nconst path=require('node:path');\nconst crypto=require('node:crypto');",
    "\nconst http=require('node:http');\nconst {execFileSync,spawn}=require('node:child_process');\nconst SCOPES=['https://www.googleapis.com/auth/tasks','https://www.g",
    "oogleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.calendarlist.readonly'];\nfunction protect(text, decrypt=false) {\n  if(process.plat",
    "form!=='win32') throw new Error('認証情報の保存は Windows の暗号化機能を使用します。');\n  const method=decrypt?'Unprotect':'Protect';\n  const script='Add-Type -AssemblyName System.S",
    "ecurity; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::'+method+'($b,$null,[Security.Cryptography.DataPro",
    "tectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))';\n  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive',",
    "'-Command',script],{input:Buffer.from(text).toString('base64'),encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});\n  return Buffer.from(output.trim(),'base6",
    "4');\n}\nfunction loadToken(file) { return fs.existsSync(file) ? JSON.parse(protect(fs.readFileSync(file),true).toString('utf8')) : null; }\nfunction saveToken(fil",
    "e,token) {\n  fs.mkdirSync(path.dirname(file),{recursive:true});\n  const tmp=file+'.tmp';\n  fs.writeFileSync(tmp,protect(JSON.stringify(token)));\n  fs.renameSync",
    "(tmp,file);\n}\nasync function tokenRequest(parameters) {\n  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchPara",
    "ms(parameters),signal:AbortSignal.timeout(30000)});\n  if(!response.ok) throw new Error('Google 認証に失敗しました（HTTP '+response.status+'）。「Google カレンダーの接続設定」で再接続してください",
    "。');\n  return response.json();\n}\nasync function authorize(client, tokenFile) {\n  const state=crypto.randomBytes(24).toString('hex');\n  const verifier=crypto.ran",
    "domBytes(48).toString('base64url');\n  const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');\n  const server=http.createServer();\n  aw",
    "ait new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});\n  const redirect='http://127.0.0.1:'+server.address().por",
    "t+'/oauth2callback';\n  const authorization=new URL('https://accounts.google.com/o/oauth2/v2/auth');\n  for(const [k,v] of Object.entries({client_id:client.client",
    "_id,redirect_uri:redirect,response_type:'code',scope:SCOPES.join(' '),state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'",
    "consent'})) authorization.searchParams.set(k,v);\n  let timer;\n  try {\n    const code=await new Promise((resolve,reject)=>{\n      timer=setTimeout(()=>reject(new",
    " Error('Google ログインが5分以内に完了しませんでした。')),300000);\n      server.on('request',(req,res)=>{\n        const url=new URL(req.url,redirect);\n        if(url.pathname!=='/",
    "oauth2callback') {res.writeHead(404);res.end();return;}\n        if(url.searchParams.get('state')!==state) {res.writeHead(400);res.end('Invalid request');return;",
    "}\n        if(url.searchParams.has('error')||!url.searchParams.get('code')) {res.end('Authorization was cancelled.');reject(new Error('Google 接続がキャンセルされました。'));r",
    "eturn;}\n        res.setHeader('Content-Type','text/html; charset=utf-8');\n        res.end('<p>Google カレンダーに接続しました。この画面を閉じて Mery に戻ってください。</p>');\n        resolve",
    "(url.searchParams.get('code'));\n      });\n      const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',authorization.toString()],{windowsHide:true,st",
    "dio:'ignore'});\n      browser.once('error',reject);\n    });\n    const result=await tokenRequest({client_id:client.client_id,client_secret:client.client_secret||",
    "'',code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'});\n    if(!result.refresh_token) throw new Error('継続接続用の認証情報を取得できませんでした。再接続",
    "してください。');\n    const token={...result,clientId:client.client_id,expiresAt:Date.now()+result.expires_in*1000};\n    saveToken(tokenFile,token);\n    return token;\n",
    "  } finally {clearTimeout(timer);server.close();}\n}\nasync function connect(config, auth=false) {\n  if(!fs.existsSync(config.credentialsPath)) throw new Error('G",
    "oogle の OAuth 設定ファイルがありません。README_Google_Calendar.md の初期設定を行ってください: '+config.credentialsPath);\n  const data=JSON.parse(fs.readFileSync(config.credentialsPath,'u",
    "tf8').replace(/^\\uFEFF/,''));\n  const client=data.installed;\n  if(!client?.client_id) throw new Error('「デスクトップアプリ」用の OAuth 認証 JSON を指定してください。');\n  let token=aut",
    "h?await authorize(client,config.tokenPath):loadToken(config.tokenPath);\n  if(!token||token.clientId!==client.client_id) throw new Error('Google に未接続です。作業メニューの「G",
    "oogle カレンダーの接続設定」を実行してください。');\n  if(token.expiresAt<Date.now()+60000) {\n    const refreshed=await tokenRequest({client_id:client.client_id,client_secret:client.",
    "client_secret||'',refresh_token:token.refresh_token,grant_type:'refresh_token'});\n    token={...token,...refreshed,expiresAt:Date.now()+refreshed.expires_in*100",
    "0};\n    saveToken(config.tokenPath,token);\n  }\n  const tasksRequest=async(method,resource,body,etag)=>{\n    if(!token.scope?.split(' ').includes('https://www.go",
    "ogleapis.com/auth/tasks'))throw new Error('Google Tasks の権限がありません。接続設定を再実行してください。');\n    const response=await fetch('https://tasks.googleapis.com/tasks/v1/'+res",
    "ource,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringif",
    "y(body)}:{}),signal:AbortSignal.timeout(30000)});\n    if(!response.ok)throw new Error('Google Tasks 通信エラー（HTTP '+response.status+'）。Google Tasks API の有効化と再接続を確認",
    "してください。');\n    return response.status===204?null:response.json();\n  };\n  return {tasksRequest,request:async(method,resource,body,etag)=>{\n    const response=awa",
    "it fetch('https://www.googleapis.com/calendar/v3/'+resource,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json',...(et",
    "ag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});\n    if(!response.ok) {const error=new Error(response.sta",
    "tus===412?'カレンダーが同期中に変更されました。再度プレビューしてください。':'Google カレンダー通信エラー（HTTP '+response.status+'）');error.status=response.status;throw error;}\n    return response.statu",
    "s===204 ? null : response.json();\n  }};\n}\nasync function listAll(api,calendarId) {\n  const result=[];let page='';\n  do {\n    const query=new URLSearchParams({ma",
    "xResults:'2500',showDeleted:'true',singleEvents:'false',...(page?{pageToken:page}:{})});\n    const response=await api.request('GET','calendars/'+encodeURICompon",
    "ent(calendarId)+'/events?'+query);\n    result.push(...(response.items||[]));page=response.nextPageToken||'';\n  } while(page);\n  return result;\n}\nasync function ",
    "listCalendars(api) {\n  const result=[];let page='';\n  do {\n    const response=await api.request('GET','users/me/calendarList?'+new URLSearchParams({maxResults:'",
    "250',...(page?{pageToken:page}:{})}));\n    result.push(...(response.items||[]));page=response.nextPageToken||'';\n  } while(page);\n  return result;\n}\nmodule.expo",
    "rts={connect,listAll,listCalendars};\n\n},\n\"calendar-store.cjs\": function(require, module, exports, __filename, __dirname) {\n'use strict';\nconst {DatabaseSync}=re",
    "quire('node:sqlite');\nclass SyncStore {\n  constructor(file) {\n    this.db=new DatabaseSync(file);\n    const version=this.db.prepare('PRAGMA user_version').get()",
    ".user_version;\n    if(version>1) {this.db.close();throw new Error('未対応の同期データベースです。');}\n    this.db.exec(`\n      PRAGMA foreign_keys=ON;\n      PRAGMA busy_timeou",
    "t=5000;\n      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;\n      CREATE TABLE IF NOT EXISTS sync_items (\n        item",
    "_id TEXT PRIMARY KEY,\n        event_id TEXT NOT NULL UNIQUE,\n        kind TEXT NOT NULL CHECK(kind IN ('TASKS','LOG')),\n        local_snapshot TEXT NOT NULL,\n  ",
    "      remote_snapshot TEXT NOT NULL,\n        updated_at TEXT NOT NULL\n      ) STRICT;\n      CREATE TABLE IF NOT EXISTS conflicts (\n        item_id TEXT PRIMARY ",
    "KEY,\n        local_snapshot TEXT,\n        remote_snapshot TEXT,\n        reason TEXT NOT NULL,\n        detected_at TEXT NOT NULL\n      ) STRICT;\n      CREATE TAB",
    "LE IF NOT EXISTS sync_runs (\n        run_id INTEGER PRIMARY KEY,\n        finished_at TEXT NOT NULL,\n        operation_counts TEXT NOT NULL,\n        error_count ",
    "INTEGER NOT NULL\n      ) STRICT;\n      PRAGMA user_version=1;\n    `);\n  }\n  load() {\n    const calendar=this.db.prepare(\"SELECT value FROM metadata WHERE key='c",
    "alendar_id'\").get();\n    const entries=Object.create(null);\n    for(const row of this.db.prepare('SELECT * FROM sync_items').all()) entries[row.item_id]={eventI",
    "d:row.event_id,local:JSON.parse(row.local_snapshot),remote:JSON.parse(row.remote_snapshot)};\n    return {version:1,calendarId:calendar?.value,entries};\n  }\n  sa",
    "ve(state,result) {\n    const now=new Date().toISOString();\n    this.db.exec('BEGIN IMMEDIATE');\n    try {\n      this.db.prepare(\"INSERT INTO metadata(key,value)",
    " VALUES('calendar_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value\").run(state.calendarId);\n      this.db.exec('DELETE FROM sync_items; DELETE FROM co",
    "nflicts;');\n      const insert=this.db.prepare('INSERT INTO sync_items VALUES(?,?,?,?,?,?)');\n      for(const [id,entry] of Object.entries(state.entries)) inser",
    "t.run(id,entry.eventId,entry.local.kind,JSON.stringify(entry.local),JSON.stringify(entry.remote),now);\n      const conflict=this.db.prepare('INSERT INTO conflic",
    "ts VALUES(?,?,?,?,?)');\n      for(const item of result.operations.filter(x=>x.action==='conflict')) conflict.run(item.id,JSON.stringify(item.local||null),JSON.s",
    "tringify(item.remote||null),item.remote?.unsupported||'both_sides_changed',now);\n      const counts={};for(const item of result.operations) counts[item.action]=",
    "(counts[item.action]||0)+1;\n      this.db.prepare('INSERT INTO sync_runs(finished_at,operation_counts,error_count) VALUES(?,?,?)').run(now,JSON.stringify(counts",
    "),result.errors.length);\n      this.db.exec('COMMIT');\n    } catch(error) {this.db.exec('ROLLBACK');throw error;}\n  }\n  close() {this.db.close();}\n}\nmodule.expo",
    "rts={SyncStore};\n\n},\n\"calendar-sync.cjs\": function(require, module, exports, __filename, __dirname) {\n'use strict';\nconst fs=require('node:fs');\nconst path=requ",
    "ire('node:path');\nconst crypto=require('node:crypto');\nconst {spawn}=require('node:child_process');\nfunction notifyCompletion(mode,ok,launch=spawn,platform=proc",
    "ess.platform) {\n  if(platform!=='win32')return;\n  const label=mode==='--sync'?'同期':mode==='--auth'?'接続設定':'プレビュー';\n  const message=ok?label+'が完了しました。マクロの「処理状況・結",
    "果を確認」からレポートを開けます。':label+'でエラーが発生しました。「処理状況・結果を確認」からレポートを確認してください。';\n  const script=\"$shell=New-Object -ComObject WScript.Shell; [void]$shell.Popup('\"+message+\"",
    "',10,'Mery Google 同期',\"+(ok?64:48)+\")\";\n  try {\n    const child=launch('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'ut",
    "f16le').toString('base64')],{windowsHide:true,stdio:'ignore'});\n    child.on('error',()=>{});child.unref();\n  } catch {}\n}\nconst progressPage=require('./progres",
    "s.cjs');\nconst tasks=require('./tasks-sync.cjs');\nconst core=require('./calendar-sync-core.cjs');\nconst google=require('./calendar-google.cjs');\nconst {SyncStor",
    "e}=require('./calendar-store.cjs');\nconst DEFAULT_HUB='C:\\\\Projects\\\\ai-work-hub';\nfunction decodeFile(buffer) {\n  if(buffer[0]===255 && buffer[1]===254) return",
    " buffer.subarray(2).toString('utf16le');\n  if(buffer[0]===254 && buffer[1]===255) {const copy=Buffer.from(buffer.subarray(2));copy.swap16();return copy.toString",
    "('utf16le');}\n  return buffer.toString('utf8').replace(/^\\uFEFF/,'');\n}\nfunction readConfiguration(hub) {\n  const dir=path.join(hub,'.mery-calendar');\n  const f",
    "ile=path.join(dir,'config.json');\n  const user=fs.existsSync(file)?JSON.parse(decodeFile(fs.readFileSync(file))):{};\n  const calendarId=user.calendarId||'primar",
    "y';\n  if(typeof calendarId!=='string'||!calendarId.trim()) throw new Error('calendarId が不正です。');\n  return {todoPaths:user.todoPaths,taskListId:user.taskListId,c",
    "alendarId,credentialsPath:path.resolve(hub,user.credentialsPath||'.mery-calendar/oauth-client.json'),tokenPath:path.join(dir,'token.dpapi'),statePath:path.join(",
    "dir,'sync.sqlite'),reportPath:path.join(hub,'CALENDAR_SYNC_REPORT.md'),lockPath:path.join(dir,'sync.lock'),hub,dir};\n}\nasync function synchronize(documents,stat",
    "e,events,api,calendarId,apply=false,onProgress=()=>{}) {\n  if(state.calendarId && state.calendarId!==calendarId) throw new Error('同期先のカレンダーが変更されています。別の作業ハブを使うか、",
    "既存の同期関係を確認してください。');\n  const parsed={TASKS:core.parseDocument(documents.TASKS,'TASKS'),LOG:core.parseDocument(documents.LOG,'LOG')};\n  const local=[...parsed.TA",
    "SKS.items,...parsed.LOG.items];\n  if(new Set(local.map(x=>x.id)).size!==local.length) throw new Error('TASKS と LOG で同期IDが重複しています。コピーした項目の <!-- mery-calendar:...",
    " --> を片方から削除してください。');\n  const entries=state.entries||{};\n  const known=new Map(Object.entries(entries).map(([id,x])=>[x.eventId,{id,...x.local}]));\n  const rem",
    "ote=events.filter(event=>known.has(event.id)||event.extendedProperties?.private?.meryId||/^\\[(TASKS(?: ✓)?|LOG)\\]\\s/.test(event.summary||'')).map(event=>core.fr",
    "omEvent(event,calendarId,known.get(event.id)));\n  const operations=core.planSync(local,remote,entries);\n  const docs={TASKS:parsed.TASKS.text,LOG:parsed.LOG.tex",
    "t};\n  const nextState={version:1,calendarId,entries:{...entries}};\n  const pulls=[],removals=[],errors=[];\n  if(apply) {\n    let processed=0;\n    for(const oper",
    "ation of operations) {\n      onProgress({stage:\"LOG を同期しています\",done:processed++,total:operations.length,item:operation.local?.text||operation.remote?.text||\"\"});",
    "\n      const {id,action,local:l,remote:r,base}=operation;\n      const eventId=r?.eventId||base?.eventId||'a'+id;\n      const resource='calendars/'+encodeURIComp",
    "onent(calendarId)+'/events/'+encodeURIComponent(eventId);\n      try {\n        if(action==='conflict') continue;\n        if(action==='forget') {delete nextState.",
    "entries[id];continue;}\n        if(action==='deleteRemote') {\n          await api.request('DELETE',resource+'?sendUpdates=none',null,r.etag);\n          delete ne",
    "xtState.entries[id];continue;\n        }\n        if(action==='deleteLocal') {removals.push(id);delete nextState.entries[id];continue;}\n        let saved=r;\n     ",
    "   if(action==='createRemote') {\n          const event=await api.request('POST','calendars/'+encodeURIComponent(calendarId)+'/events?sendUpdates=none',{id:event",
    "Id,...core.toEvent(l)});\n          saved=core.fromEvent(event,calendarId,l);\n        } else if(action==='push') {\n          const event=await api.request('PATCH",
    "',resource+'?sendUpdates=none',core.toEvent(l),r.etag);\n          saved=core.fromEvent(event,calendarId,l);\n        } else if(action==='pull') pulls.push(r);\n  ",
    "      if(saved?.unsupported) throw new Error(saved.unsupported);\n        const item=action==='pull'?r:l;\n        nextState.entries[id]={eventId:saved.eventId,lo",
    "cal:core.fields(item),remote:core.fields(saved)};\n      } catch(error) {errors.push({id,message:error.message});}\n    }\n  }\n  return {documents:apply?core.apply",
    "Items(docs,pulls,removals):documents,state:nextState,operations,errors};\n}\nfunction report(result,apply) {\n  const labels={createRemote:'カレンダーへ新規登録',push:'カレンダー",
    "を更新',pull:'Mery へ反映',deleteRemote:'カレンダーから削除',deleteLocal:'Mery から削除',conflict:'競合・要確認',adopt:'変更なし',forget:'同期情報を整理'};\n  const counts={};for(const o of result.",
    "operations) counts[o.action]=(counts[o.action]||0)+1;\n  let text='# Google カレンダー同期'+(apply?'結果':'プレビュー')+'\\n\\n';\n  for(const [key,label] of Object.entries(label",
    "s)) text+='- '+label+': '+(counts[key]||0)+'件\\n';\n  text+='- 通信エラー: '+result.errors.length+'件\\n\\n';\n  for(const o of result.operations.filter(x=>x.action!=='ado",
    "pt'&&x.action!=='forget')) {\n    const item=o.local||o.remote||o.base?.local;\n    text+='## '+labels[o.action]+'\\n\\n'+(item?.kind||'')+' / '+(item?.date||'')+' ",
    "/ '+(item?.text||o.id)+'\\n\\n';\n    if(o.action==='conflict') text+='Mery とカレンダーの変更が競合するか、未対応の予定形式です。自動で上書きしません。\\n\\nMery: '+JSON.stringify(o.local?core.fields(o.",
    "local):null)+'\\n\\nカレンダー: '+JSON.stringify(o.remote?.unsupported|| (o.remote&&!o.remote.deleted?core.fields(o.remote):null))+'\\n\\n';\n  }\n  for(const error of res",
    "ult.errors) text+='## エラー\\n\\n'+error.id+': '+error.message+'\\n\\n';\n  return text;\n}\nfunction backupAndSave(file,text,original) {\n  if(fs.existsSync(file) && !fs",
    ".readFileSync(file).equals(original)) throw new Error('同期中にファイルが変更されました。再実行してください: '+file);\n  const timestamp=new Date().toISOString().replace(/[-:.TZ]/g,'')+'_",
    "'+crypto.randomBytes(4).toString('hex');\n  fs.writeFileSync(file.replace(/\\.md$/,'_backup_'+timestamp+'.md'),original,{flag:'wx'});\n  const tmp=file+'.'+timesta",
    "mp+'.tmp';\n  fs.writeFileSync(tmp,'\\uFEFF'+text,'utf8');fs.renameSync(tmp,file);\n}\nasync function cli(args=process.argv.slice(2)) {\n  const hubIndex=args.indexO",
    "f('--hub');\n  const hub=hubIndex>=0?args[hubIndex+1]:DEFAULT_HUB;\n  if(!hub) throw new Error('--hub に作業フォルダーを指定してください。');\n  const config=readConfiguration(hub);",
    "\n  fs.mkdirSync(config.dir,{recursive:true});\n  let lock,store;\n  try {lock=fs.openSync(config.lockPath,'wx');} catch {throw new Error('別の同期処理が実行中です。異常終了した場合は .",
    "mery-calendar/sync.lock を確認してください。');}\n  const mode=args.includes('--auth')?'--auth':args.includes('--sync')?'--sync':'--preview';\n  const statusPath=path.join(",
    "config.dir,'run-status.json');let runError;\n  let live={phase:'running',mode,pid:process.pid,startedAt:new Date().toISOString()};\n  const writeStatus=value=>{li",
    "ve={...live,...value};const tmp=statusPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(live));fs.renameSync(tmp,statusPath);fs.writeFileSync(path.join(config.dir",
    ",'progress.html'),progressPage.render(live));};\n  const onProgress=value=>writeStatus({...value,phase:'running'});\n  try {\n    writeStatus({phase:'running',mode",
    ",pid:process.pid,startedAt:new Date().toISOString()});\n    const offline=args.includes('--offline-preview');\n    const auth=args.includes('--auth');\n    const a",
    "pply=args.includes('--sync');\n    onProgress({stage:auth?'ブラウザーでのログインを待っています':'Google に接続しています'});\n    const api=offline?null:await google.connect(config,auth);",
    "\n    if(auth) {\n      const calendars=await google.listCalendars(api);\n      const text='# Google カレンダー接続完了\\n\\n設定ファイル: '+path.join(config.dir,'config.json')+'\\n",
    "\\n現在の calendarId: `'+config.calendarId+'`\\n\\n## 利用できるカレンダー\\n\\n'+calendars.map(x=>'- '+x.summary+' / '+x.accessRole+'\\n  ID: `'+x.id+'`').join('\\n')+'\\n';\n      ",
    "fs.writeFileSync(config.reportPath,'\\uFEFF'+text,'utf8');console.log(text);return;\n    }\n    // Bind SQLite mappings to the real calendar ID, rather than the ac",
    "count-dependent primary alias.\n    if(!offline && config.calendarId==='primary') {\n      const primary=(await google.listCalendars(api)).find(calendar=>calendar",
    ".primary);\n      if(!primary?.id) throw new Error('Google のメインカレンダーを特定できませんでした。');\n      config.calendarId=primary.id;\n    }\n    const useTasks=args.includes('-",
    "-tasks');\n    if(!useTasks&&fs.existsSync(path.join(config.dir,'tasks-ids.json')))throw new Error('ID別ファイル方式では --tasks を指定するか、更新済みの Mery 同期マクロを使用してください。');\n    ",
    "if(useTasks&&offline)throw new Error('My Tasks は接続ありのプレビューを使用してください。');\n    const taskReport=useTasks?await tasks.run(config,api,apply,onProgress):'';\n    const",
    " originals={},documents={};\n    for(const kind of ['TASKS','LOG']) {\n      const file=path.join(hub,kind+'.md');\n      if(!fs.existsSync(file)) throw new Error(",
    "kind+'.md がありません。両方のファイルを作成してから同期してください。');\n      originals[kind]=fs.readFileSync(file);documents[kind]=decodeFile(originals[kind]);\n    }\n    store=new SyncSto",
    "re(config.statePath);\n    const state=store.load();\n    if(apply) {\n      // Persist identifiers before sending requests so interrupted first syncs can be retri",
    "ed.\n      const stamped={TASKS:useTasks?{text:documents.TASKS,items:[]}:core.parseDocument(documents.TASKS,'TASKS'),LOG:core.parseDocument(documents.LOG,'LOG')}",
    ";\n      const ids=[...stamped.TASKS.items,...stamped.LOG.items].map(x=>x.id);\n      if(new Set(ids).size!==ids.length) throw new Error('TASKS と LOG で同期IDが重複していま",
    "す。');\n      for(const kind of ['TASKS','LOG']) if(stamped[kind].text!==documents[kind]) {\n        backupAndSave(path.join(hub,kind+'.md'),stamped[kind].text,ori",
    "ginals[kind]);\n        originals[kind]=fs.readFileSync(path.join(hub,kind+'.md'));documents[kind]=decodeFile(originals[kind]);\n      }\n    }\n    onProgress({sta",
    "ge:\"カレンダーの予定を読み込んでいます\",done:null,total:null,item:\"\"});\n    const events=offline?[]:await google.listAll(api,config.calendarId);\n    if(offline && Object.keys(st",
    "ate.entries).length) throw new Error('既に同期済みです。削除誤判定を防ぐため、接続ありのプレビューを使用してください。');\n    const legacy=Object.fromEntries(Object.entries(state.entries).filter(([,x]",
    ")=>x.local.kind==='TASKS'));\n    const logState=useTasks?{...state,entries:Object.fromEntries(Object.entries(state.entries).filter(([,x])=>x.local.kind==='LOG')",
    ")}:state;\n    const logEvents=useTasks?events.filter(x=>x.extendedProperties?.private?.meryKind==='LOG'||/^\\[LOG\\] /.test(x.summary||'')||Object.values(logState",
    ".entries).some(y=>y.eventId===x.id)):events;\n    const result=await synchronize(useTasks?{...documents,TASKS:''}:documents,logState,logEvents,api,config.calenda",
    "rId,apply,onProgress);\n    if(useTasks){result.documents.TASKS=documents.TASKS;result.state.entries={...legacy,...result.state.entries};}\n    if(apply) {\n      ",
    "// Check both originals before saving either file. Preserve snapshots before every rewrite.\n      for(const kind of ['TASKS','LOG']) if(!fs.readFileSync(path.jo",
    "in(hub,kind+'.md')).equals(originals[kind])) throw new Error('同期中に '+kind+'.md が変更されました。結果を確認して再実行してください。');\n      for(const kind of ['TASKS','LOG']) if(result.",
    "documents[kind]!==documents[kind]) backupAndSave(path.join(hub,kind+'.md'),result.documents[kind],originals[kind]);\n      store.save(result.state,result);\n    }",
    "\n    const text=report(result,apply)+taskReport;\n    fs.writeFileSync(config.reportPath,'\\uFEFF'+text,'utf8');console.log(text);\n    if(result.errors.length) pr",
    "ocess.exitCode=1;\n  } catch(error) {\n    runError=error.message;\n    fs.writeFileSync(config.reportPath,'\\uFEFF# Google 同期エラー\\n\\n'+runError+'\\n','utf8');\n    th",
    "row error;\n  } finally {\n    try {if(store) store.close();} finally {\n      fs.closeSync(lock);fs.unlinkSync(config.lockPath);\n      writeStatus({phase:'complet",
    "ed',mode,stage:'処理終了',item:'',done:null,total:null,ok:!runError&&!process.exitCode,error:runError||null,finishedAt:new Date().toISOString()});\n      if(args.inc",
    "ludes('--tasks'))notifyCompletion(mode,!runError&&!process.exitCode);\n    }\n  }\n}\nmodule.exports={decodeFile,readConfiguration,synchronize,report,cli,notifyComp",
    "letion};\nif(require.main===module) cli().catch(error=>{\n  console.error(error.message);process.exitCode=1;\n  try {\n    const args=process.argv.slice(2),i=args.i",
    "ndexOf('--hub');\n    const hub=i>=0?args[i+1]:DEFAULT_HUB;\n    fs.writeFileSync(path.join(hub,'CALENDAR_SYNC_REPORT.md'),'\\uFEFF# Google カレンダー同期エラー\\n\\n'+error.m",
    "essage+'\\n','utf8');\n  } catch {}\n});\n\n}};\nconst __modules = Object.create(null);\nfor (const name of Object.keys(__definitions)) __modules[name] = {exports:{}};",
    "\nconst __loaded = new Set();\nconst __run = require.main === module;\nfunction __load(name) {\n  if (__loaded.has(name)) return __modules[name].exports;\n  if (!__d",
    "efinitions[name]) throw new Error('Missing embedded module: ' + name);\n  __loaded.add(name);\n  const localRequire = spec => spec.startsWith('./') ? __load(spec.",
    "slice(2)) : require(spec);\n  localRequire.main = __run ? __modules['calendar-sync.cjs'] : null;\n  __definitions[name](localRequire, __modules[name], __modules[n",
    "ame].exports, __path.join(__dirname,name), __dirname);\n  return __modules[name].exports;\n}\nmodule.exports = __load('calendar-sync.cjs');\n"
].join("");

main();
