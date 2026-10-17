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
            if (!fso.FileExists(statusPath)) { showError("まだ処理状況がありません。接続設定またはプレビューを実行してください。"); return; }
            var current = JSON.parse(readUtf8Text(statusPath));
            if (current.phase === "running" || current.phase === "queued") {
                var progress = current.mode === "--auth"
                    ? "Google カレンダー / Tasks の接続設定中です。\nブラウザー認証を求められた場合は、Googleへのアクセスを許可してください。"
                    : "処理中です。少し待ってから、もう一度結果を確認してください。";
                showStatusMessage(progress + "\n開始: " + current.startedAt); return;
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
            if (!confirmAction("開いている TASKS.md / LOG.md / TODO.md の編集を保存して処理します。\n"
                + (selected === 3 ? "追加・変更・削除を双方向に反映します。競合は保留し、ローカル変更前にバックアップを作成します。\n初回はプレビューで対象を確認してください。\n" : "カレンダーの読み取りと同期内容の確認を行います。\n")
                + "続行しますか？")) return;
            saveOpenHubDocuments();
        }

        var mode = selected === 1 ? "--auth" : selected === 2 ? "--preview" : "--sync";
        var runner = new ActiveXObject("WScript.Shell");
        writeRunStatus(statusPath, JSON.stringify({phase:"queued",mode:mode,startedAt:new Date().toLocaleString(),startedMs:new Date().getTime()}));
        runner.Run(quoteArg(NODE_EXE) + " " + quoteArg(helper) + " --hub " + quoteArg(HUB_DIR) + " " + mode + " --tasks", 0, false);
        var progressMessage = mode === "--auth"
            ? "Google カレンダー / Tasks の接続設定中です。\nブラウザー認証を求められた場合は、Googleへのアクセスを許可してください。\n完了後は「処理状況・結果を確認」を選んでください。"
            : "処理を開始しました。\n完了後、このマクロの「処理状況・結果を確認」を選んでください。\n同期中の TASKS.md / LOG.md / TODO.md の編集は、完了後に行ってください。";
        Status = progressMessage;
        showStatusMessage(progressMessage);
    } catch (e) {
        showError("Google カレンダー同期エラー: " + e.message);
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
    for (var i = 0; i < getMeryEditor().Documents.Count; i++) {
        var d = getMeryEditor().Documents.Item(i);
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
    for (var i=0;i<getMeryEditor().Documents.Count;i++) {
        var d=getMeryEditor().Documents.Item(i);
        if(d.FullName && fso.GetFileName(d.FullName).toLowerCase()==="todo.md" && !d.Saved) d.Save(d.FullName);
    }
}

function reloadOpenHubDocuments() {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    for (var j=0;j<getMeryEditor().Documents.Count;j++) {
        var todo=getMeryEditor().Documents.Item(j);
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
        getMeryEditor().NewFile();
        d = getMeryEditor().ActiveDocument;
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


function getMeryEditor() {
    if (typeof Editor !== "undefined") return Editor;
    if (typeof editor !== "undefined") return editor;
    throw new Error("Meryのエディターオブジェクトを取得できません。");
}
function confirmAction(message) {
    return new ActiveXObject("WScript.Shell").Popup(String(message), 0, "Mery Google 同期", 4 + 32) === 6;
}
function showError(message) {
    new ActiveXObject("WScript.Shell").Popup(String(message), 0, "Mery Google 同期", 0x30);
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
    "pe=value=>String(value??'').replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[ch]));\r\nfunction render(state){const active=sta",
    "te.phase==='running'||state.phase==='queued';const title=active?'同期処理中':state.ok?'処理が完了しました':'処理にエラーがあります';const count=Number.isInteger(state.total)?'<p class=\"",
    "count\">'+escape(state.done||0)+' / '+escape(state.total)+' 件</p><progress max=\"'+Math.max(1,state.total)+'\" value=\"'+(state.done||0)+'\"></progress>':'';return '",
    "<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\">'+(active?'<meta http-equiv=\"refresh\" content=\"1\">':'')+'<title>Mery 同期の進捗</title><style>body{font:18px sys",
    "tem-ui;background:#f4f6fa;color:#243247;margin:8vh auto;max-width:680px;padding:24px}main{background:white;padding:36px;border-radius:18px;box-shadow:0 8px 32px",
    " #24324712}h1{font-size:26px}progress{width:100%;height:18px;accent-color:#287c70}.count{font-size:28px}small{color:#64748b}</style><main><h1>'+title+'</h1><p>'",
    "+escape(state.stage||'処理を起動しています')+'</p>'+count+'<p>'+escape(state.item||'')+'</p><p>'+escape(state.error||'')+'</p><small>'+(active?'1秒ごとに自動更新します。通信待ちの間は件数が変わら",
    "ないことがあります。':'Meryの同期マクロから「処理状況・結果を確認」を選んでください。')+'</small></main></html>';}\r\nmodule.exports={render};\r\n\n},\n\"task-identities.cjs\": function(require, module, expo",
    "rts, __filename, __dirname) {\n'use strict';\nconst fs=require('node:fs'),crypto=require('node:crypto');\nconst core=require('./calendar-sync-core.cjs');\nconst str",
    "ip=text=>text.replace(/\\s*<!-- mery-calendar:[a-f0-9]{32} -->/g,'').replace(/\\r\\n?/g,'\\n');\nfunction load(file){if(!fs.existsSync(file))return [];const data=JSO",
    "N.parse(fs.readFileSync(file,'utf8'));if(data.version!==1||!Array.isArray(data.snapshots)||data.snapshots.some(x=>typeof x!=='string'))throw Error('TASKS のIDファイ",
    "ルが不正です。バックアップから復元してください。');return data.snapshots;}\nfunction similarity(left,right){\n  const a=[...left.normalize('NFKC').trim()],b=[...right.normalize('NFKC').t",
    "rim()];\n  if(!a.length||!b.length||Math.max(a.length,b.length)>2048)return 0;\n  let previous=Array.from({length:b.length+1},(_,i)=>i),current=new Array(b.length",
    "+1);\n  for(let i=1;i<=a.length;i++){\n    current[0]=i;\n    for(let j=1;j<=b.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===",
    "b[j-1]?0:1));\n    [previous,current]=[current,previous];\n  }\n  let longest=Array(b.length+1).fill(0),common=0;\n  for(let i=1;i<=a.length;i++)for(let j=b.length;",
    "j>=1;j--){longest[j]=a[i-1]===b[j-1]?longest[j-1]+1:0;common=Math.max(common,longest[j]);}\n  return Math.max(1-previous[b.length]/Math.max(a.length,b.length),co",
    "mmon/Math.min(a.length,b.length));\n}\nfunction pairEdited(old,fresh,ids,textOf,options={}){\n  const threshold=options.threshold??.55,margin=options.margin??.1,mi",
    "nLength=options.minLength??0;let matched=0,ambiguous=false;\n  while(old.length&&fresh.length){\n    const scores=old.map(a=>fresh.map(b=>{\n      const left=textO",
    "f(a),right=textOf(b);\n      if(Math.min([...left.normalize('NFKC').trim()].length,[...right.normalize('NFKC').trim()].length)<minLength)return 0;\n      return s",
    "imilarity(left,right);\n    }));\n    const best=(values)=>{\n      const sorted=values.map((score,index)=>({score,index})).sort((a,b)=>b.score-a.score);\n      ret",
    "urn sorted[0]&&sorted[0].score>=threshold&&(sorted.length===1||sorted[0].score-sorted[1].score>=margin)?sorted[0].index:-1;\n    };\n    let pair=null;\n    for(le",
    "t i=0;i<old.length;i++){\n      const j=best(scores[i]);if(j<0)continue;\n      const reverse=best(scores.map(row=>row[j]));\n      if(reverse===i){pair=[i,j];brea",
    "k;}\n    }\n    if(!pair){ambiguous=scores.some(row=>row.some(score=>score>=threshold));break;}\n    const [i,j]=pair;ids.set(fresh[j].index,old[i].id);old.splice(",
    "i,1);fresh.splice(j,1);matched++;\n  }\n  return {matched,ambiguous};\n}\nfunction restore(text,snapshots,makeId=core.uuid){\n  const parsed=core.parseDocument(text,",
    "'TASKS',makeId);if(!snapshots.length)return parsed.text;\n  const categoryMap=(source,items)=>{\n    const lines=source.replace(/\\r\\n?/g,'\\n').split('\\n'),result=",
    "new Map();\n    for(const item of items){\n      let category='';\n      for(let i=item.index-1;i>=0;i--){\n        if(/^###\\s/.test(lines[i]))break;\n        const ",
    "match=lines[i].match(/^####(?!#)\\s+(.+?)\\s*$/);if(match){category=match[1];break;}\n      }\n      result.set(item.index,category);\n    }\n    return result;\n  };\n",
    "  const freshCategories=categoryMap(text,parsed.items);for(const item of parsed.items)item.category=freshCategories.get(item.index)||'';\n  const explicit=new Se",
    "t(text.match(/<!-- mery-calendar:([a-f0-9]{32}) -->/g)?.map(x=>x.match(/[a-f0-9]{32}/)[0])||[]);\n  const context=x=>x.date+'\\0'+x.section;\n  const identityText=",
    "x=>x.text.replace(/\\s+\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\s+\\d{1,2}:\\d{2}\\s+[AP]M(?:\\s+[-–—]\\s+\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\s+\\d{1,2}:\\d{2}\\s+[AP]M)?$/i,'').trim();\n  const key=",
    "x=>context(x)+'\\0'+identityText(x);\n  const newKeys=new Set(parsed.items.map(key));\n  const candidates=snapshots.map(s=>{const items=core.parseDocument(s,'TASKS",
    "',makeId).items,categories=categoryMap(s,items);for(const item of items)item.category=categories.get(item.index)||'';return {text:s,items};});\n  const chosen=ca",
    "ndidates.find(x=>strip(x.text)===strip(text))||candidates.sort((a,b)=>b.items.filter(x=>newKeys.has(key(x))).length-a.items.filter(x=>newKeys.has(key(x))).lengt",
    "h)[0];\n  let old=chosen.items.filter(x=>!explicit.has(x.id)),fresh=parsed.items.filter(x=>!explicit.has(x.id));const ids=new Map(),anchoredContexts=new Set();\n ",
    " function match(group,duplicates){\n    for(const k of new Set(fresh.map(group))){\n      const a=old.filter(x=>group(x)===k),b=fresh.filter(x=>group(x)===k);if(!",
    "a.length)continue;\n      const pairedOld=[],pairedFresh=[];\n      const bind=(left,right)=>{ids.set(right.index,left.id);pairedOld.push(left);pairedFresh.push(r",
    "ight);anchoredContexts.add(context(left));anchoredContexts.add(context(right));};\n      if(a.length===1&&b.length===1)bind(a[0],b[0]);\n      else if(duplicates)",
    "{\n        // Exact same-name rows may legitimately be copied into a new category.\n        // Preserve IDs in the same fourth-level category first, then pair any",
    "\n        // indistinguishable remainder by document order. Surplus fresh rows are\n        // additions; surplus historical rows are deletions.\n        for(const",
    " category of new Set(a.concat(b).map(x=>x.category))){\n          const left=a.filter(x=>x.category===category&&!pairedOld.includes(x));\n          const right=b.",
    "filter(x=>x.category===category&&!pairedFresh.includes(x));\n          for(let i=0;i<Math.min(left.length,right.length);i++)bind(left[i],right[i]);\n        }\n   ",
    "     const left=a.filter(x=>!pairedOld.includes(x)),right=b.filter(x=>!pairedFresh.includes(x));\n        for(let i=0;i<Math.min(left.length,right.length);i++)bi",
    "nd(left[i],right[i]);\n      }\n      if(pairedOld.length){old=old.filter(x=>!pairedOld.includes(x));fresh=fresh.filter(x=>!pairedFresh.includes(x));}\n    }\n  }\n ",
    " match(key,true);match(x=>x.text,false);\n  // Pair likely edits by text similarity. Unmatched old/new rows are deletions/additions;\n  // when their relationship",
    " is ambiguous, stop rather than assigning the wrong sync ID.\n  for(const k of new Set(fresh.map(context))){\n    const a=old.filter(x=>context(x)===k),b=fresh.fi",
    "lter(x=>context(x)===k);if(!a.length)continue;\n    let result={matched:0,ambiguous:false};\n    if(a.length===1&&b.length===1){ids.set(b[0].index,a[0].id);result",
    ".matched=1;a.length=0;b.length=0;}\n    else result=pairEdited(a,b,ids,identityText);\n    if(a.length&&b.length&&(result.ambiguous||!result.matched&&!anchoredCon",
    "texts.has(k)))throw Error('TASKS の編集・追加・削除の対応が曖昧で、IDを安全に特定できません。同期IDを残すか、変更を分けて同期してください。');\n    old=old.filter(x=>!a.includes(x));fresh=fresh.filter(x=>!b.inclu",
    "des(x));\n  }\n  // A task can be both renamed and moved to another date/section. After the\n  // context-local pass, pair only globally distinctive, high-confiden",
    "ce edits.\n  // Keep the existing fail-safe below for anything that remains ambiguous.\n  const onlyOneUnmatchedPair=old.length===1&&fresh.length===1;\n  if(old.le",
    "ngth&&fresh.length&&!onlyOneUnmatchedPair)pairEdited(old,fresh,ids,identityText,{threshold:.72,margin:.18,minLength:8});\n  if(old.length&&fresh.length){\n    if(",
    "onlyOneUnmatchedPair)ids.set(fresh[0].index,old[0].id);\n    else if(old.some(a=>fresh.some(b=>similarity(identityText(a),identityText(b))>=.55)))throw Error('TA",
    "SKS の移動と編集が重なり、IDを特定できません。移動と編集を分けて同期してください。');\n    // With no plausible text relationship, keep fresh IDs as additions and let\n    // unmatched historical IDs ",
    "represent deletions; do not confuse these with edits.\n  }\n  const parsedLines=new Set(parsed.items.map(x=>x.index));\n  const loose=text.replace(/\\r\\n?/g,'\\n').s",
    "plit('\\n').filter((line,index)=>!parsedLines.has(index)).map(line=>line.match(/^[-*]\\s+\\[[ xX]\\]\\s*(.*)$/)?.[1]?.replace(/\\s*<!-- mery-calendar:[a-f0-9]{32} -->",
    "/g,'').trim()).filter(Boolean);\n  if(old.some(x=>loose.includes(x.text)))throw Error('同期済み項目が日付見出しの外にあります。日付見出しを確認してください。');\n  const lines=parsed.text.split('\\n",
    "');for(const item of parsed.items)if(ids.has(item.index))lines[item.index]=lines[item.index].replace(item.id,ids.get(item.index));\n  const result=lines.join('\\n",
    "');core.parseDocument(result,'TASKS');return result;\n}\nfunction checkpoint(file,marked,snapshots){\n  const next=[marked,...snapshots.filter(x=>x!==marked)].slic",
    "e(0,3),tmp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';\n  fs.writeFileSync(tmp,JSON.stringify({version:1,snapshots:next},null,2),'utf8');fs.renameSync",
    "(tmp,file);return next;\n}\nmodule.exports={strip,load,restore,checkpoint};\n\n},\n\"tasks-sync.cjs\": function(require, module, exports, __filename, __dirname) {\n'use",
    " strict';\r\nconst fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');\r\nconst {DatabaseSync}=require('node:sqlite');\r\nconst core=requir",
    "e('./calendar-sync-core.cjs');\r\nconst identities=require('./task-identities.cjs');\r\nconst marker=/\\s*<!-- mery-calendar:([a-f0-9]{32}) -->/;\r\nconst dueMarker=/\\",
    "s*<!-- mery-due:(\\d{4}-\\d{2}-\\d{2}) -->/;\r\nfunction decode(b){if(b[0]===255&&b[1]===254)return b.subarray(2).toString('utf16le');if(b[0]===254&&b[1]===255){cons",
    "t c=Buffer.from(b.subarray(2));c.swap16();return c.toString('utf16le');}return b.toString('utf8').replace(/^\\uFEFF/,'');}\r\nfunction parse(text,file,isTasks){\r\n ",
    " if(isTasks){const p=core.parseDocument(text,'TASKS');return {...p,items:p.items.map(x=>({...x,file}))};}\r\n  const lines=text.replace(/\\r\\n?/g,'\\n').split('\\n')",
    ",items=[];let fence='';\r\n  for(let index=0;index<lines.length;index++){\r\n    const line=lines[index],f=line.match(/^\\s*(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1",
    "][0];else if(fence===f[1][0])fence='';continue;}if(fence)continue;\r\n    const m=line.match(/^\\s*[-*]\\s+\\[([ xX])\\]\\s*(.+)$/);if(!m)continue;\r\n    const id=m[2].",
    "match(marker)?.[1]||crypto.randomBytes(16).toString('hex'),date=m[2].match(dueMarker)?.[1]||'';\r\n    if(date&&!(/^\\d{4}-\\d{2}-\\d{2}$/.test(date)&&Number.isFinit",
    "e(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date))throw Error('TODO の日付が不正です: '+file);\r\n    const body=m[2].replac",
    "e(marker,'').replace(dueMarker,'').trim();if(!body)continue;\r\n    if(!m[2].match(marker))lines[index]=line+' <!-- mery-calendar:'+id+' -->';\r\n    items.push({id",
    ",file,index,kind:'TODO',text:body,done:m[1].toLowerCase()==='x',date});\r\n  }\r\n  for(const line of lines){const id=line.match(marker)?.[1];if(id&&!items.some(x=>",
    "x.id===id))throw Error('同期済み TODO を解析できません: '+file);}\r\n  return {text:lines.join('\\n'),items};\r\n}\r\nconst fields=x=>({text:x.text,done:!!x.done,date:x.date||''})",
    ";\r\nconst equal=(a,b)=>JSON.stringify(fields(a))===JSON.stringify(fields(b));\r\nfunction resource(x,notes=''){return {title:x.text,status:x.done?'completed':'need",
    "sAction',due:x.date?x.date+'T00:00:00.000Z':null,notes};}\r\nasync function pages(api,route,params={}){const items=[];let page='';do{const r=await api.tasksReques",
    "t('GET',route+'?'+new URLSearchParams({...params,...(page?{pageToken:page}:{})}));items.push(...(r.items||[]));page=r.nextPageToken||'';}while(page);return item",
    "s;}\r\nfunction save(file,text,original){if(!fs.readFileSync(file).equals(original))throw Error('同期中に変更されました: '+file);fs.writeFileSync(file+'.backup_'+Date.now()+",
    "'_'+crypto.randomBytes(3).toString('hex')+'.md',original,{flag:'wx'});const temp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';fs.writeFileSync(temp,'\\u",
    "FEFF'+text);fs.renameSync(temp,file);}\r\nfunction todayDate(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2",
    "-digit'}).format(new Date());}\r\nfunction updateDocument(doc,item,remote,today=todayDate()){\r\n  if(item.kind==='TASKS'&&remote&&item.date===today&&item.section==",
    "='今日やる'){\r\n    const lines=doc.split('\\n'),index=lines.findIndex(line=>line.match(marker)?.[1]===item.id);\r\n    if(index>=0){lines[index]='- ['+(remote.done?'x'",
    ":' ')+'] '+remote.text+(item.start?' @'+item.start+'-'+item.end:'')+' <!-- mery-calendar:'+item.id+' -->';return lines.join('\\n');}\r\n  }\r\n  if(item.kind==='TASK",
    "S')return core.applyItems({TASKS:doc,LOG:''},remote?[{...item,...fields(remote),date:today,section:'今日やる'}]:[],remote?[]:[item.id]).TASKS;\r\n  const lines=doc.sp",
    "lit('\\n'),index=lines.findIndex(x=>x.match(marker)?.[1]===item.id);if(index<0)throw Error('TODO 項目が見つかりません。');\r\n  if(!remote)lines.splice(index,1);else{const pr",
    "efix=lines[index].match(/^(\\s*[-*]\\s+)\\[[ xX]\\]\\s*/)[1];lines[index]=prefix+'['+(remote.done?'x':' ')+'] '+remote.text+(remote.date?' <!-- mery-due:'+remote.dat",
    "e+' -->':'')+' <!-- mery-calendar:'+item.id+' -->';}return lines.join('\\n');\r\n}\r\nasync function run(config,api,apply,onProgress=()=>{}){\r\n  onProgress({stage:\"M",
    "y Tasks のリストを確認しています\",done:null,total:null,item:\"\"});\r\n  const lists=await pages(api,'users/@me/lists',{maxResults:'100'});\r\n  const list=config.taskListId?list",
    "s.find(x=>x.id===config.taskListId):lists.find(x=>x.title==='My Tasks');\r\n  if(!list)throw Error('My Tasks が見つかりません。.mery-calendar/config.json の taskListId に対象リ",
    "ストIDを指定してください。利用可能: '+lists.map(x=>x.title+' / '+x.id).join(', '));\r\n  let paths=config.todoPaths;\r\n  if(paths===undefined){const view=path.join(config.hub,'PRO",
    "JECT_TODO.md');const source=fs.existsSync(view)?decode(fs.readFileSync(view)).match(/^Source:\\s*`([^`]+)`/m)?.[1]:null;paths=source?[source]:[];}\r\n  if(!Array.i",
    "sArray(paths)||paths.some(x=>typeof x!=='string'||!x))throw Error('todoPaths は TODO.md のフルパスの配列にしてください。');\r\n  const files=[path.join(config.hub,'TASKS.md'),...p",
    "aths.map(x=>path.resolve(config.hub,x))];\r\n  if(new Set(files.map(x=>x.toLowerCase())).size!==files.length)throw Error('同期対象ファイルが重複しています。');\r\n  const docs=new M",
    "ap(),local=new Map();\r\n  const identityFile=path.join(config.dir,'tasks-ids.json');let snapshots=identities.load(identityFile);\r\n  for(const file of files){cons",
    "t original=fs.readFileSync(file),text=decode(original),parsed=parse(file===files[0]?identities.restore(text,snapshots):text,file,file===files[0]);docs.set(file,",
    "{original,...parsed});for(const x of parsed.items){if(local.has(x.id))throw Error('同期IDがファイル間で重複しています。コピー先の同期マーカーを削除してください。');local.set(x.id,x);}}\r\n  function s",
    "aveDocument(file,text,d){\r\n    let visible=text;if(file===files[0]){snapshots=identities.checkpoint(identityFile,text,snapshots);visible=identities.strip(text);",
    "}\r\n    if(visible!==decode(d.original)){save(file,visible,d.original);d.original=fs.readFileSync(file);}d.text=text;\r\n  }\r\n  const db=new DatabaseSync(path.join",
    "(config.dir,'tasks.sqlite'));let summary='\\n## My Tasks\\n\\n';\r\n  try{\r\n    db.exec('CREATE TABLE IF NOT EXISTS state (id TEXT PRIMARY KEY, value TEXT NOT NULL);",
    " CREATE TABLE IF NOT EXISTS binding (id INTEGER PRIMARY KEY CHECK(id=1), account TEXT NOT NULL, list TEXT NOT NULL)');\r\n    const binding=db.prepare('SELECT * F",
    "ROM binding').get();if(binding&&(binding.account!==config.calendarId||binding.list!==list.id))throw Error('My Tasks の同期アカウントまたはリストが変更されています。');\r\n    const state",
    "=new Map(db.prepare('SELECT * FROM state').all().map(x=>[x.id,JSON.parse(x.value)]));\r\n    if(!snapshots.length&&state.size&&![...local.keys()].some(id=>state.h",
    "as(id))&&[...state.values()].some(b=>b.file===files[0]))throw Error('TASKS のIDファイルがありません。IDを削除する前の TASKS.md または tasks-ids.json を復元してください。');\r\n    for(const b of",
    " state.values())if(!docs.has(b.file))throw Error('同期済み TODO が対象から外れています。todoPaths に戻してください: '+b.file);\r\n    const route='lists/'+encodeURIComponent(list.id)+'/t",
    "asks';\r\n    onProgress({stage:\"My Tasks の項目を読み込んでいます\"});\r\n    const remoteList=await pages(api,route,{maxResults:'100',showCompleted:'true',showDeleted:'true',s",
    "howHidden:'true'}),remote=new Map();\r\n    for(const r of remoteList){let id=[...state].find(([,b])=>b.remoteId===r.id)?.[0]||r.notes?.match(/^Mery sync: ([a-f0-",
    "9]{32})$/m)?.[1];if(!id){if(r.deleted||r.hidden)continue;id=crypto.createHash('sha256').update(list.id+'\\0'+r.id).digest('hex').slice(0,32);}if(remote.has(id))t",
    "hrow Error('My Tasks の同期IDが重複しています。');remote.set(id,{...r,text:r.title||'',done:r.status==='completed',date:r.due?.slice(0,10)||''});}\r\n    const today=config.t",
    "oday||todayDate();\r\n    summary+='リスト: '+list.title+' / Google取得: '+remoteList.length+'件 / 同期対象: '+local.size+'件 / 照合済み: '+remote.size+'件\\n\\n';\r\n    if(apply){d",
    "b.prepare('INSERT OR IGNORE INTO binding VALUES(1,?,?)').run(config.calendarId,list.id);for(const [file,d] of docs)if(file===files[0]||d.text!==decode(d.origina",
    "l))saveDocument(file,d.text,d);}\r\n    const allIds=[...new Set([...local.keys(),...state.keys(),...remote.keys()])];let processed=0;\r\n    for(const id of allIds",
    "){\r\n      onProgress({stage:apply?\"My Tasks を同期しています\":\"My Tasks の変更を確認しています\",done:processed++,total:allIds.length,item:local.get(id)?.text||remote.get(id)?.text",
    "||state.get(id)?.local.text||\"\"});\r\n      const l=local.get(id),r=remote.get(id),b=state.get(id);let action;\r\n      if(apply&&r&&b?.remoteId===r.id&&r.notes?.sp",
    "lit(/\\r?\\n/).includes('Mery sync: '+id)){\r\n        try{const notes=r.notes.split(/\\r?\\n/).filter(line=>line!=='Mery sync: '+id).join('\\n');const updated=await a",
    "pi.tasksRequest('PATCH',route+'/'+encodeURIComponent(r.id),{notes},r.etag);r.notes=notes;r.etag=updated?.etag||r.etag;}\r\n        catch(error){summary+='- IDメモの整",
    "理を保留: '+(r.text||id)+' / '+error.message+'\\n';process.exitCode=1;}\r\n      }\r\n      if(!b)action=!l?(r&&!r.deleted?'Mery 新規取込':'同期情報整理'):l&&r&&!r.deleted?(equal(",
    "l,r)?'変更なし':'競合'):l&&r?.deleted?'競合':'新規登録';\r\n      else if(!l&&(!r||r.deleted))action='同期情報整理';\r\n      else if(!l)action=equal(r,b.remote)?'Google から削除':'競合';\r",
    "\n      else if(!r||r.deleted)action=equal(l,b.local)?'Mery から削除':'競合';\r\n      else{const lc=!equal(l,b.local),rc=!equal(r,b.remote);action=lc&&rc?(equal(l,r)?'変",
    "更なし':'競合'):lc?'Google 更新':rc?'Mery 更新':'変更なし';}\r\n      if(r&&!r.deleted&&(!r.text.trim()||/[\\r\\n]/.test(r.text)))action='競合';\r\n      if(action==='変更なし'&&l?.kind",
    "==='TASKS'&&(!l.done||l.date===today)&&(l.date!==today||l.section!=='今日やる'))action='Mery 配置更新';\r\n      const pulling=['Mery 更新','Mery 配置更新','Mery 新規取込'].include",
    "s(action);\r\n      const source=l||{id,file:files[0],kind:'TASKS',date:today,section:'今日やる',start:'',end:''};\r\n      summary+='- '+action+': '+(pulling?r.text:l?",
    ".text||b?.local.text||id)+'\\n';\r\n      if(pulling||action==='競合')summary+='  Mery: '+JSON.stringify(l?fields(l):null)+' / Google: '+JSON.stringify(r&&!r.deleted",
    "?fields(r):null)+'\\n';\r\n      if(pulling)summary+='  反映先: '+(source.kind==='TASKS'?today+' / 今日やる':source.file)+'\\n';\r\n      if(r)summary+='  Google項目: '+JSON.s",
    "tringify(fields(r))+'\\n';\r\n      if(!apply||action==='競合')continue;\r\n      try{\r\n        let saved=r;const file=l?.file||b?.file||files[0],d=docs.get(file);\r\n  ",
    "      // Temporary recovery marker covers a crash between POST and saving the Google ID locally.\r\n        if(action==='新規登録')saved=await api.tasksRequest('POST'",
    ",route,resource(l,'Mery sync: '+id));\r\n        if(action==='Google 更新')saved=await api.tasksRequest('PATCH',route+'/'+encodeURIComponent(r.id),resource({...l,da",
    "te:l.date===b.local.date?r.date:l.date},r.notes),r.etag);\r\n        if(action==='Google から削除')await api.tasksRequest('DELETE',route+'/'+encodeURIComponent(r.id),",
    "null,r.etag);\r\n        if(pulling||action==='Mery から削除'){const next=updateDocument(d.text,source,pulling?r:null,today);saveDocument(file,next,d);}\r\n        if([",
    "'同期情報整理','Google から削除','Mery から削除'].includes(action)){db.prepare('DELETE FROM state WHERE id=?').run(id);continue;}\r\n        const current=pulling?{...source,..",
    ".fields(r),...(source.kind==='TASKS'?{date:today}:{})}:l;\r\n        const snapshot={file,local:fields(current),remote:fields({...saved,text:saved.title||saved.te",
    "xt,done:saved.status==='completed',date:saved.due?.slice(0,10)||''}),remoteId:saved.id};\r\n        db.prepare('INSERT INTO state VALUES(?,?) ON CONFLICT(id) DO U",
    "PDATE SET value=excluded.value').run(id,JSON.stringify(snapshot));\r\n        if(saved.notes?.split(/\\r?\\n/).includes('Mery sync: '+id)){\r\n          const notes=s",
    "aved.notes.split(/\\r?\\n/).filter(line=>line!=='Mery sync: '+id).join('\\n');\r\n          await api.tasksRequest('PATCH',route+'/'+encodeURIComponent(saved.id),{no",
    "tes},saved.etag);\r\n        }\r\n      }catch(error){summary+='  エラー: '+error.message+'\\n';process.exitCode=1;}\r\n    }\r\n    onProgress({stage:'My Tasks の処理完了',done",
    ":allIds.length,total:allIds.length,item:''});\r\n    return summary+'\\n対象: '+files.join(', ')+'\\n';\r\n  }finally{db.close();}\r\n}\r\nmodule.exports={parse,fields,equa",
    "l,resource,updateDocument,run,pages,todayDate};\r\n\n},\n\"calendar-sync-core.cjs\": function(require, module, exports, __filename, __dirname) {\n'use strict';\nconst c",
    "rypto = require('node:crypto');\nconst MARKER = /\\s*<!-- mery-calendar:([a-f0-9]{32}) -->/;\nconst STANDARD = {TASKS:['今日やる','次にやる','後で','置く','確認が必要','メモ'],LOG:['",
    "やったこと','試したこと','うまくいったこと','詰まったこと','次回メモ','メモ']};\nconst uuid = () => crypto.randomBytes(16).toString('hex');\nfunction validDate(date) { const timestamp=Date.par",
    "se(date+'T00:00:00Z'); return /^\\d{4}-\\d{2}-\\d{2}$/.test(date) && Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10)===date; }\nfunction",
    " nextDate(date) { return new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10); }\nfunction fields(item) { const {kind,date,section,text,don",
    "e,start,end} = item; return {kind,date,section,text,done:!!done,start:start||'',end:end||''}; }\nfunction equal(a,b) { return JSON.stringify(fields(a)) === JSON.",
    "stringify(fields(b)); }\nfunction parseDocument(input, kind, makeId = uuid) {\n  const lines = input.replace(/\\r\\n?/g,'\\n').split('\\n');\n  const items=[]; const s",
    "een=new Set(); let date='',section='メモ',fence='';\n  for(let index=0;index<lines.length;index++) {\n    const line=lines[index];\n    const f=line.match(/^\\s*(`{3,",
    "}|~{3,})/);\n    if(f) { if(!fence) fence=f[1][0]; else if(fence===f[1][0]) fence=''; continue; }\n    if(fence) continue;\n    const day=line.match(/^##\\s+(\\d{4}-",
    "\\d{2}-\\d{2})(?:\\s+\\([^)]*\\))?(?:\\s+(今日の作業|作業ログ))?\\s*$/);\n    if(day) { date=validDate(day[1]) ? day[1] : ''; section='メモ'; continue; }\n    const sub=line.match(",
    "/^###\\s+(.+?)\\s*$/);\n    if(sub) {section=sub[1];continue;}\n    if(/^##\\s/.test(line)) {date='';continue;}\n    if(!date) continue;\n    const match=kind==='TASKS",
    "' ? line.match(/^[-*]\\s+\\[([ xX])\\]\\s*(.*)$/) : line.match(/^[-*]\\s+(.*)$/);\n    if(!match) continue;\n    let body=kind==='TASKS' ? match[2] : match[1];\n    con",
    "st marker=body.match(MARKER);\n    body=body.replace(MARKER,'').trim();\n    const time=body.match(/\\s+@(\\d{2}:\\d{2})-(\\d{2}:\\d{2})$/);\n    let start='',end='';\n ",
    "   if(time) {\n      [start,end]=[time[1],time[2]];\n      if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(start)||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(end)||start>=end) throw ",
    "new Error(kind+' の時刻が不正です（同日内の開始 < 終了）: '+(index+1)+'行目');\n      body=body.slice(0,time.index).trim();\n    }\n    if(!body) continue;\n    const id=marker ? marke",
    "r[1] : makeId();\n    if(seen.has(id)) throw new Error(kind+' に同じ同期IDが複数あります: '+id);\n    seen.add(id);\n    if(!marker) lines[index]=line.replace(/\\s+$/,'')+' <!-",
    "- mery-calendar:'+id+' -->';\n    items.push({id,kind,date,section,text:body,done:kind==='TASKS' && match[1].toLowerCase()==='x',start,end,index});\n  }\n  for(con",
    "st line of lines) {const id=line.match(MARKER)?.[1];if(id&&!seen.has(id)) throw new Error(kind+' の同期済み項目を解析できません。日付・チェックボックス・時刻を確認してください。');}\n  return {items,te",
    "xt:lines.join('\\n')};\n}\nfunction toEvent(item) {\n  const prefix=item.kind==='LOG' ? '[LOG] ' : item.done ? '[TASKS ✓] ' : '[TASKS] ';\n  return {\n    summary:pre",
    "fix+item.text,\n    start:item.start ? {dateTime:item.date+'T'+item.start+':00+09:00',timeZone:'Asia/Tokyo'} : {date:item.date},\n    end:item.end ? {dateTime:ite",
    "m.date+'T'+item.end+':00+09:00',timeZone:'Asia/Tokyo'} : {date:nextDate(item.date)},\n    extendedProperties:{private:{meryId:item.id,meryKind:item.kind,merySect",
    "ion:item.section}},\n  };\n}\nfunction localTime(value) {\n  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'",
    "2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));\n  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));\n  retur",
    "n {date:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute};\n}\nfunction fromEvent(event, calendarId, base) {\n  const meta=event.extendedProperties?.private||",
    "{};\n  const id=meta.meryId || base?.id || crypto.createHash('sha256').update(calendarId+'\\n'+event.id).digest('hex').slice(0,32);\n  if(!/^[a-f0-9]{32}$/.test(id",
    ")) throw new Error('不正な同期ID: '+event.id);\n  const result={id,eventId:event.id,etag:event.etag,deleted:event.status==='cancelled'};\n  if(result.deleted) return r",
    "esult;\n  try {\n    if(event.recurrence || event.recurringEventId) throw new Error('繰り返し予定は同期対象外です');\n    let date,start='',end='';\n    if(event.start?.date) {\n ",
    "     date=event.start.date;\n      if(!validDate(date)||event.end?.date!==nextDate(date)) throw new Error('複数日の終日予定は同期対象外です');\n    } else {\n      const s=localTi",
    "me(event.start?.dateTime),e=localTime(event.end?.dateTime);\n      if(s.date!==e.date || s.time>=e.time) throw new Error('日をまたぐ予定は同期対象外です');\n      date=s.date;st",
    "art=s.time;end=e.time;\n    }\n    const summary=event.summary||'';\n    const kind=summary.startsWith('[LOG]') ? 'LOG' : summary.startsWith('[TASKS') ? 'TASKS' : ",
    "meta.meryKind||base?.kind||'TASKS';\n    const done=kind==='TASKS' && summary.startsWith('[TASKS ✓]');\n    const text=summary.replace(/^\\[(?:LOG|TASKS(?: ✓)?)\\]\\",
    "s*/,'').trim();\n    if(!text||/[\\r\\n]/.test(text)) throw new Error('空または複数行の件名は同期対象外です');\n    const section=meta.merySection||base?.section||(kind==='LOG'?'やったこ",
    "と':'今日やる');\n    return {...result,kind,date,start,end,done,text,section};\n  } catch(error) {return {...result,unsupported:error.message};}\n}\nfunction planSync(l",
    "ocalItems,remoteItems,entries={}) {\n  const local=new Map(localItems.map(x=>[x.id,x]));\n  const remote=new Map();\n  for(const r of remoteItems) {if(remote.has(r",
    ".id)) throw new Error('カレンダーに同じ同期IDが複数あります: '+r.id);remote.set(r.id,r);}\n  const ids=new Set([...local.keys(),...remote.keys(),...Object.keys(entries)]);\n  cons",
    "t operations=[];\n  for(const id of ids) {\n    const l=local.get(id),r=remote.get(id),base=entries[id];\n    let action;\n    if(r?.unsupported) action='conflict';",
    "\n    else if(!base) {\n      if(l && r && !r.deleted) action=equal(l,r)?'adopt':'conflict';\n      else if(l && r?.deleted) action='conflict';\n      else if(l) ac",
    "tion='createRemote';\n      else if(r && !r.deleted) action='pull';\n      else action='forget';\n    } else if(!l && (!r||r.deleted)) action='forget';\n    else if",
    "(!l) action=equal(r,base.remote)?'deleteRemote':'conflict';\n    else if(!r||r.deleted) action=equal(l,base.local)?'deleteLocal':'conflict';\n    else {\n      con",
    "st lc=!equal(l,base.local),rc=!equal(r,base.remote);\n      action=lc && rc ? (equal(l,r)?'adopt':'conflict') : lc?'push':rc?'pull':'adopt';\n    }\n    operations",
    ".push({id,action,local:l,remote:r,base});\n  }\n  return operations;\n}\nfunction lineFor(item) {return (item.kind==='TASKS' ? '- ['+(item.done?'x':' ')+'] ' : '- '",
    ")+item.text+(item.start?' @'+item.start+'-'+item.end:'')+' <!-- mery-calendar:'+item.id+' -->';}\nfunction dayHeading(item) {\n  const day=['日','月','火','水','木','金",
    "','土'][new Date(item.date+'T00:00:00Z').getUTCDay()];\n  return '## '+item.date+' ('+day+') '+(item.kind==='TASKS'?'今日の作業':'作業ログ');\n}\nfunction applyItems(documen",
    "ts, updates, removals=[]) {\n  const docs={...documents};\n  for(const id of new Set([...removals,...updates.map(x=>x.id)])) {\n    for(const kind of ['TASKS','LOG",
    "']) {\n      docs[kind]=docs[kind].split('\\n').filter(line=>line.match(MARKER)?.[1]!==id).join('\\n');\n    }\n  }\n  for(const item of updates) {\n    const lines=do",
    "cs[item.kind].split('\\n');\n    // IDs are removed above; locate the destination by date, without rebuilding unrelated content.\n    let day=lines.findIndex(line=",
    ">new RegExp('^##\\\\s+'+item.date+'(?:\\\\s|$)').test(line));\n    if(day<0) {\n      if(!lines[0]?.startsWith('# '+item.kind)) lines.unshift('# '+item.kind,'');\n    ",
    "  lines.splice(1,0,'',dayHeading(item),'','### '+item.section,lineFor(item),'','---','');\n    } else {\n      let dayEnd=lines.findIndex((line,i)=>i>day && /^##\\",
    "s/.test(line));\n      if(dayEnd<0) dayEnd=lines.length;\n      let section=lines.findIndex((line,i)=>i>day && i<dayEnd && line.trim()==='### '+item.section);\n   ",
    "   if(section<0) {\n        let end=dayEnd;while(end>day+1 && (!lines[end-1].trim()||/^---+$/.test(lines[end-1].trim()))) end--;\n        lines.splice(end,0,'','#",
    "## '+item.section,lineFor(item),'');\n      } else {\n        let end=section+1;while(end<dayEnd && !/^###\\s/.test(lines[end])&&!/^---+$/.test(lines[end].trim()))",
    " end++;\n        while(end>section+1 && !lines[end-1].trim()) end--;\n        lines.splice(end,0,lineFor(item));\n      }\n    }\n    docs[item.kind]=lines.join('\\n'",
    ");\n  }\n  return docs;\n}\nmodule.exports={MARKER,STANDARD,uuid,fields,equal,parseDocument,toEvent,fromEvent,planSync,applyItems};\n\n},\n\"calendar-google.cjs\": funct",
    "ion(require, module, exports, __filename, __dirname) {\n'use strict';\nconst fs=require('node:fs');\nconst path=require('node:path');\nconst crypto=require('node:cr",
    "ypto');\nconst http=require('node:http');\nconst {execFileSync,spawn}=require('node:child_process');\nconst DRIVE_FILE_SCOPE='https://www.googleapis.com/auth/drive",
    ".file';\nconst SCOPES=['https://www.googleapis.com/auth/tasks','https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.calend",
    "arlist.readonly'];\nfunction protect(text, decrypt=false) {\n  if(process.platform!=='win32') throw new Error('認証情報の保存は Windows の暗号化機能を使用します。');\n  const method=de",
    "crypt?'Unprotect':'Protect';\n  const script='Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cry",
    "ptography.ProtectedData]::'+method+'($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))';\n ",
    " const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:Buffer.from(text).toString('base64'),encoding:'utf8',windo",
    "wsHide:true,maxBuffer:1024*1024});\n  return Buffer.from(output.trim(),'base64');\n}\nfunction loadToken(file) { return fs.existsSync(file) ? JSON.parse(protect(fs",
    ".readFileSync(file),true).toString('utf8')) : null; }\nfunction saveToken(file,token) {\n  fs.mkdirSync(path.dirname(file),{recursive:true});\n  const tmp=file+'.t",
    "mp';\n  fs.writeFileSync(tmp,protect(JSON.stringify(token)));\n  fs.renameSync(tmp,file);\n}\nasync function tokenRequest(parameters) {\n  const response=await fetch",
    "('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams(parameters),signal:AbortSignal.timeout(30000)});\n  if(!response.ok) throw new Err",
    "or('Google 認証に失敗しました（HTTP '+response.status+'）。「Google カレンダーの接続設定」で再接続してください。');\n  return response.json();\n}\nasync function authorize(client, tokenFile, extraSc",
    "opes=[]) {\n  const state=crypto.randomBytes(24).toString('hex');\n  const verifier=crypto.randomBytes(48).toString('base64url');\n  const challenge=crypto.createH",
    "ash('sha256').update(verifier).digest('base64url');\n  const server=http.createServer();\n  await new Promise((resolve,reject)=>{server.once('error',reject);serve",
    "r.listen(0,'127.0.0.1',resolve)});\n  const redirect='http://127.0.0.1:'+server.address().port+'/oauth2callback';\n  const authorization=new URL('https://accounts",
    ".google.com/o/oauth2/v2/auth');\n  for(const [k,v] of Object.entries({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:[...new Set([..",
    ".SCOPES,...extraScopes])].join(' '),state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent'})) authorization.searchPa",
    "rams.set(k,v);\n  let timer;\n  try {\n    const code=await new Promise((resolve,reject)=>{\n      timer=setTimeout(()=>reject(new Error('Google ログインが5分以内に完了しませんでした",
    "。')),300000);\n      server.on('request',(req,res)=>{\n        const url=new URL(req.url,redirect);\n        if(url.pathname!=='/oauth2callback') {res.writeHead(40",
    "4);res.end();return;}\n        if(url.searchParams.get('state')!==state) {res.writeHead(400);res.end('Invalid request');return;}\n        if(url.searchParams.has(",
    "'error')||!url.searchParams.get('code')) {res.end('Authorization was cancelled.');reject(new Error('Google 接続がキャンセルされました。'));return;}\n        res.setHeader('Con",
    "tent-Type','text/html; charset=utf-8');\n        res.end('<p>Google サービスに接続しました。この画面を閉じて Mery に戻ってください。</p>');\n        resolve(url.searchParams.get('code'));\n   ",
    "   });\n      const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',authorization.toString()],{windowsHide:true,stdio:'ignore'});\n      browser.once(",
    "'error',reject);\n    });\n    const result=await tokenRequest({client_id:client.client_id,client_secret:client.client_secret||'',code,code_verifier:verifier,redi",
    "rect_uri:redirect,grant_type:'authorization_code'});\n    if(!result.refresh_token) throw new Error('継続接続用の認証情報を取得できませんでした。再接続してください。');\n    const token={...resu",
    "lt,clientId:client.client_id,expiresAt:Date.now()+result.expires_in*1000};\n    saveToken(tokenFile,token);\n    return token;\n  } finally {clearTimeout(timer);se",
    "rver.close();}\n}\nasync function connect(config, auth=false, extraScopes=[]) {\n  if(!fs.existsSync(config.credentialsPath)) throw new Error('Google の OAuth 設定ファイ",
    "ルがありません。README_Google_Calendar.md の初期設定を行ってください: '+config.credentialsPath);\n  const data=JSON.parse(fs.readFileSync(config.credentialsPath,'utf8').replace(/^\\uF",
    "EFF/,''));\n  const client=data.installed;\n  if(!client?.client_id) throw new Error('「デスクトップアプリ」用の OAuth 認証 JSON を指定してください。');\n  let token=auth?await authorize(c",
    "lient,config.tokenPath,extraScopes):loadToken(config.tokenPath);\n  if(!token||token.clientId!==client.client_id) throw new Error('Google に未接続です。作業メニューの「Google カ",
    "レンダーの接続設定」を実行してください。');\n  if(token.expiresAt<Date.now()+60000) {\n    const refreshed=await tokenRequest({client_id:client.client_id,client_secret:client.client_",
    "secret||'',refresh_token:token.refresh_token,grant_type:'refresh_token'});\n    token={...token,...refreshed,expiresAt:Date.now()+refreshed.expires_in*1000};\n   ",
    " saveToken(config.tokenPath,token);\n  }\n  const tasksRequest=async(method,resource,body,etag)=>{\n    if(!token.scope?.split(' ').includes('https://www.googleapi",
    "s.com/auth/tasks'))throw new Error('Google Tasks の権限がありません。接続設定を再実行してください。');\n    const response=await fetch('https://tasks.googleapis.com/tasks/v1/'+resource,{",
    "method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)",
    "}:{}),signal:AbortSignal.timeout(30000)});\n    if(!response.ok)throw new Error('Google Tasks 通信エラー（HTTP '+response.status+'）。Google Tasks API の有効化と再接続を確認してください。",
    "');\n    return response.status===204?null:response.json();\n  };\n  const hasScope=scope=>token.scope?.split(' ').includes(scope)||false;\n  const driveRequest=asy",
    "nc(method,resource,body)=>{\n    if(!hasScope(DRIVE_FILE_SCOPE))throw new Error('Google Driveの権限がありません。作業メニューの「Google カレンダーの接続設定」を実行し、Google Driveへのアクセスを許可してください",
    "。');\n    const response=await fetch('https://www.googleapis.com/drive/v3/'+resource,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'",
    "application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});\n    const text=await response.text();\n    if(!response.ok){let ",
    "message='';try{message=JSON.parse(text).error?.message||'';}catch{}throw new Error('Google Drive通信エラー（HTTP '+response.status+'）'+(message?': '+message:''));}\n  ",
    "  return text?JSON.parse(text):null;\n  };\n  const driveDownload=async id=>{\n    if(!hasScope(DRIVE_FILE_SCOPE))throw new Error('Google Driveの権限がありません。作業メニューの「Go",
    "ogle カレンダーの接続設定」を実行し、Google Driveへのアクセスを許可してください。');\n    const response=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=me",
    "dia',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(120000)});\n    if(!response.ok)throw new Error('Google Driveからのダウンロードに失敗しま",
    "した（HTTP '+response.status+'）。');\n    return Buffer.from(await response.arrayBuffer());\n  };\n  const driveUpload=async(fileId,metadata,bytes,mimeType='applicatio",
    "n/octet-stream')=>{\n    if(!hasScope(DRIVE_FILE_SCOPE))throw new Error('Google Driveの権限がありません。作業メニューの「Google カレンダーの接続設定」を実行し、Google Driveへのアクセスを許可してください。');\n   ",
    " const base='https://www.googleapis.com/upload/drive/v3/files'+(fileId?'/'+encodeURIComponent(fileId):'');\n    const query=new URLSearchParams({uploadType:'resu",
    "mable',fields:'id,name,mimeType,modifiedTime,parents'});\n    const start=await fetch(base+'?'+query,{method:fileId?'PATCH':'POST',headers:{Authorization:'Bearer",
    " '+token.access_token,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':mimeType,'X-Upload-Content-Length':String(bytes.length)},body:JSO",
    "N.stringify(metadata),signal:AbortSignal.timeout(30000)});\n    if(!start.ok)throw new Error('Google Driveアップロードを開始できません（HTTP '+start.status+'）。');\n    const loc",
    "ation=start.headers.get('location');\n    if(!location)throw new Error('Google Driveからアップロード先URLが返りませんでした。');\n    const uploadUrl=new URL(location);\n    if(uploa",
    "dUrl.protocol!=='https:'||!/(^|\\.)googleapis\\.com$/i.test(uploadUrl.hostname))throw new Error('Google Driveが不正なアップロード先を返しました。');\n    const response=await fetch(",
    "uploadUrl,{method:'PUT',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':mimeType},body:bytes,signal:AbortSignal.timeout(120000)});\n    const ",
    "text=await response.text();\n    if(!response.ok){let message='';try{message=JSON.parse(text).error?.message||'';}catch{}throw new Error('Google Driveへのアップロードに失敗",
    "しました（HTTP '+response.status+'）'+(message?': '+message:''));}\n    return text?JSON.parse(text):null;\n  };\n  return {hasScope,driveRequest,driveDownload,driveUplo",
    "ad,tasksRequest,request:async(method,resource,body,etag)=>{\n    const response=await fetch('https://www.googleapis.com/calendar/v3/'+resource,{method,headers:{A",
    "uthorization:'Bearer '+token.access_token,'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:Abor",
    "tSignal.timeout(30000)});\n    if(!response.ok) {const error=new Error(response.status===412?'カレンダーが同期中に変更されました。再度プレビューしてください。':'Google カレンダー通信エラー（HTTP '+respons",
    "e.status+'）');error.status=response.status;throw error;}\n    return response.status===204 ? null : response.json();\n  }};\n}\nasync function listAll(api,calendarI",
    "d) {\n  const result=[];let page='';\n  do {\n    const query=new URLSearchParams({maxResults:'2500',showDeleted:'true',singleEvents:'false',...(page?{pageToken:pa",
    "ge}:{})});\n    const response=await api.request('GET','calendars/'+encodeURIComponent(calendarId)+'/events?'+query);\n    result.push(...(response.items||[]));pa",
    "ge=response.nextPageToken||'';\n  } while(page);\n  return result;\n}\nasync function listCalendars(api) {\n  const result=[];let page='';\n  do {\n    const response=",
    "await api.request('GET','users/me/calendarList?'+new URLSearchParams({maxResults:'250',...(page?{pageToken:page}:{})}));\n    result.push(...(response.items||[])",
    ");page=response.nextPageToken||'';\n  } while(page);\n  return result;\n}\nmodule.exports={connect,listAll,listCalendars};\n\n},\n\"calendar-store.cjs\": function(requir",
    "e, module, exports, __filename, __dirname) {\n'use strict';\nconst {DatabaseSync}=require('node:sqlite');\nclass SyncStore {\n  constructor(file) {\n    this.db=new ",
    "DatabaseSync(file);\n    const version=this.db.prepare('PRAGMA user_version').get().user_version;\n    if(version>1) {this.db.close();throw new Error('未対応の同期データベー",
    "スです。');}\n    this.db.exec(`\n      PRAGMA foreign_keys=ON;\n      PRAGMA busy_timeout=5000;\n      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value",
    " TEXT NOT NULL) STRICT;\n      CREATE TABLE IF NOT EXISTS sync_items (\n        item_id TEXT PRIMARY KEY,\n        event_id TEXT NOT NULL UNIQUE,\n        kind TEXT",
    " NOT NULL CHECK(kind IN ('TASKS','LOG')),\n        local_snapshot TEXT NOT NULL,\n        remote_snapshot TEXT NOT NULL,\n        updated_at TEXT NOT NULL\n      ) ",
    "STRICT;\n      CREATE TABLE IF NOT EXISTS conflicts (\n        item_id TEXT PRIMARY KEY,\n        local_snapshot TEXT,\n        remote_snapshot TEXT,\n        reason",
    " TEXT NOT NULL,\n        detected_at TEXT NOT NULL\n      ) STRICT;\n      CREATE TABLE IF NOT EXISTS sync_runs (\n        run_id INTEGER PRIMARY KEY,\n        finis",
    "hed_at TEXT NOT NULL,\n        operation_counts TEXT NOT NULL,\n        error_count INTEGER NOT NULL\n      ) STRICT;\n      PRAGMA user_version=1;\n    `);\n  }\n  lo",
    "ad() {\n    const calendar=this.db.prepare(\"SELECT value FROM metadata WHERE key='calendar_id'\").get();\n    const entries=Object.create(null);\n    for(const row ",
    "of this.db.prepare('SELECT * FROM sync_items').all()) entries[row.item_id]={eventId:row.event_id,local:JSON.parse(row.local_snapshot),remote:JSON.parse(row.remo",
    "te_snapshot)};\n    return {version:1,calendarId:calendar?.value,entries};\n  }\n  save(state,result) {\n    const now=new Date().toISOString();\n    this.db.exec('B",
    "EGIN IMMEDIATE');\n    try {\n      this.db.prepare(\"INSERT INTO metadata(key,value) VALUES('calendar_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value\")",
    ".run(state.calendarId);\n      this.db.exec('DELETE FROM sync_items; DELETE FROM conflicts;');\n      const insert=this.db.prepare('INSERT INTO sync_items VALUES(",
    "?,?,?,?,?,?)');\n      for(const [id,entry] of Object.entries(state.entries)) insert.run(id,entry.eventId,entry.local.kind,JSON.stringify(entry.local),JSON.strin",
    "gify(entry.remote),now);\n      const conflict=this.db.prepare('INSERT INTO conflicts VALUES(?,?,?,?,?)');\n      for(const item of result.operations.filter(x=>x.",
    "action==='conflict')) conflict.run(item.id,JSON.stringify(item.local||null),JSON.stringify(item.remote||null),item.remote?.unsupported||'both_sides_changed',now",
    ");\n      const counts={};for(const item of result.operations) counts[item.action]=(counts[item.action]||0)+1;\n      this.db.prepare('INSERT INTO sync_runs(finis",
    "hed_at,operation_counts,error_count) VALUES(?,?,?)').run(now,JSON.stringify(counts),result.errors.length);\n      this.db.exec('COMMIT');\n    } catch(error) {thi",
    "s.db.exec('ROLLBACK');throw error;}\n  }\n  close() {this.db.close();}\n}\nmodule.exports={SyncStore};\n\n},\n\"calendar-sync.cjs\": function(require, module, exports, _",
    "_filename, __dirname) {\n'use strict';\r\nconst fs=require('node:fs');\r\nconst path=require('node:path');\r\nconst crypto=require('node:crypto');\r\nconst {spawn}=requi",
    "re('node:child_process');\r\nfunction notifyCompletion(mode,ok,launch=spawn,platform=process.platform) {\r\n  if(platform!=='win32')return;\r\n  const label=mode==='-",
    "-sync'?'同期':mode==='--auth'?'接続設定':'プレビュー';\r\n  const message=ok?label+'が完了しました。マクロの「処理状況・結果を確認」からレポートを開けます。':label+'でエラーが発生しました。「処理状況・結果を確認」からレポートを確認してください。';\r\n",
    "  const script=\"$shell=New-Object -ComObject WScript.Shell; [void]$shell.Popup('\"+message+\"',10,'Mery Google 同期',\"+(ok?64:48)+\")\";\r\n  try {\r\n    const child=lau",
    "nch('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore'});\r\n  ",
    "  child.on('error',()=>{});child.unref();\r\n  } catch {}\r\n}\r\nconst tasks=require('./tasks-sync.cjs');\r\nconst core=require('./calendar-sync-core.cjs');\r\nconst goo",
    "gle=require('./calendar-google.cjs');\r\nconst {SyncStore}=require('./calendar-store.cjs');\r\nconst DEFAULT_HUB='C:\\\\Projects\\\\ai-work-hub';\r\nfunction decodeFile(b",
    "uffer) {\r\n  if(buffer[0]===255 && buffer[1]===254) return buffer.subarray(2).toString('utf16le');\r\n  if(buffer[0]===254 && buffer[1]===255) {const copy=Buffer.f",
    "rom(buffer.subarray(2));copy.swap16();return copy.toString('utf16le');}\r\n  return buffer.toString('utf8').replace(/^\\uFEFF/,'');\r\n}\r\nfunction readConfiguration(",
    "hub) {\r\n  const dir=path.join(hub,'.mery-calendar');\r\n  const file=path.join(dir,'config.json');\r\n  const user=fs.existsSync(file)?JSON.parse(decodeFile(fs.read",
    "FileSync(file))):{};\r\n  const calendarId=user.calendarId||'primary';\r\n  if(typeof calendarId!=='string'||!calendarId.trim()) throw new Error('calendarId が不正です。'",
    ");\r\n  return {todoPaths:user.todoPaths,taskListId:user.taskListId,calendarId,credentialsPath:path.resolve(hub,user.credentialsPath||'.mery-calendar/oauth-client",
    ".json'),tokenPath:path.join(dir,'token.dpapi'),statePath:path.join(dir,'sync.sqlite'),reportPath:path.join(hub,'CALENDAR_SYNC_REPORT.md'),lockPath:path.join(dir",
    ",'sync.lock'),hub,dir};\r\n}\r\nasync function synchronize(documents,state,events,api,calendarId,apply=false) {\r\n  if(state.calendarId && state.calendarId!==calenda",
    "rId) throw new Error('同期先のカレンダーが変更されています。別の作業ハブを使うか、既存の同期関係を確認してください。');\r\n  const parsed={TASKS:core.parseDocument(documents.TASKS,'TASKS'),LOG:core.parseDocume",
    "nt(documents.LOG,'LOG')};\r\n  const local=[...parsed.TASKS.items,...parsed.LOG.items];\r\n  if(new Set(local.map(x=>x.id)).size!==local.length) throw new Error('TA",
    "SKS と LOG で同期IDが重複しています。コピーした項目の <!-- mery-calendar:... --> を片方から削除してください。');\r\n  const entries=state.entries||{};\r\n  const known=new Map(Object.entries(entries)",
    ".map(([id,x])=>[x.eventId,{id,...x.local}]));\r\n  const remote=events.filter(event=>known.has(event.id)||event.extendedProperties?.private?.meryId||/^\\[(TASKS(?:",
    " ✓)?|LOG)\\]\\s/.test(event.summary||'')).map(event=>core.fromEvent(event,calendarId,known.get(event.id)));\r\n  const operations=core.planSync(local,remote,entries",
    ");\r\n  const docs={TASKS:parsed.TASKS.text,LOG:parsed.LOG.text};\r\n  const nextState={version:1,calendarId,entries:{...entries}};\r\n  const pulls=[],removals=[],er",
    "rors=[];\r\n  if(apply) {\r\n    for(const operation of operations) {\r\n      const {id,action,local:l,remote:r,base}=operation;\r\n      const eventId=r?.eventId||bas",
    "e?.eventId||'a'+id;\r\n      const resource='calendars/'+encodeURIComponent(calendarId)+'/events/'+encodeURIComponent(eventId);\r\n      try {\r\n        if(action===",
    "'conflict') continue;\r\n        if(action==='forget') {delete nextState.entries[id];continue;}\r\n        if(action==='deleteRemote') {\r\n          await api.reques",
    "t('DELETE',resource+'?sendUpdates=none',null,r.etag);\r\n          delete nextState.entries[id];continue;\r\n        }\r\n        if(action==='deleteLocal') {removals",
    ".push(id);delete nextState.entries[id];continue;}\r\n        let saved=r;\r\n        if(action==='createRemote') {\r\n          const event=await api.request('POST','",
    "calendars/'+encodeURIComponent(calendarId)+'/events?sendUpdates=none',{id:eventId,...core.toEvent(l)});\r\n          saved=core.fromEvent(event,calendarId,l);\r\n  ",
    "      } else if(action==='push') {\r\n          const event=await api.request('PATCH',resource+'?sendUpdates=none',core.toEvent(l),r.etag);\r\n          saved=core.",
    "fromEvent(event,calendarId,l);\r\n        } else if(action==='pull') pulls.push(r);\r\n        if(saved?.unsupported) throw new Error(saved.unsupported);\r\n        c",
    "onst item=action==='pull'?r:l;\r\n        nextState.entries[id]={eventId:saved.eventId,local:core.fields(item),remote:core.fields(saved)};\r\n      } catch(error) {",
    "errors.push({id,message:error.message});}\r\n    }\r\n  }\r\n  return {documents:apply?core.applyItems(docs,pulls,removals):documents,state:nextState,operations,error",
    "s};\r\n}\r\nfunction report(result,apply) {\r\n  const labels={createRemote:'カレンダーへ新規登録',push:'カレンダーを更新',pull:'Mery へ反映',deleteRemote:'カレンダーから削除',deleteLocal:'Mery から",
    "削除',conflict:'競合・要確認',adopt:'変更なし',forget:'同期情報を整理'};\r\n  const counts={};for(const o of result.operations) counts[o.action]=(counts[o.action]||0)+1;\r\n  let text",
    "='# Google カレンダー同期'+(apply?'結果':'プレビュー')+'\\n\\n';\r\n  for(const [key,label] of Object.entries(labels)) text+='- '+label+': '+(counts[key]||0)+'件\\n';\r\n  text+='- 通",
    "信エラー: '+result.errors.length+'件\\n\\n';\r\n  for(const o of result.operations.filter(x=>x.action!=='adopt'&&x.action!=='forget')) {\r\n    const item=o.local||o.remot",
    "e||o.base?.local;\r\n    text+='## '+labels[o.action]+'\\n\\n'+(item?.kind||'')+' / '+(item?.date||'')+' / '+(item?.text||o.id)+'\\n\\n';\r\n    if(o.action==='conflict",
    "') text+='Mery とカレンダーの変更が競合するか、未対応の予定形式です。自動で上書きしません。\\n\\nMery: '+JSON.stringify(o.local?core.fields(o.local):null)+'\\n\\nカレンダー: '+JSON.stringify(o.remote?.unsupp",
    "orted|| (o.remote&&!o.remote.deleted?core.fields(o.remote):null))+'\\n\\n';\r\n  }\r\n  for(const error of result.errors) text+='## エラー\\n\\n'+error.id+': '+error.messa",
    "ge+'\\n\\n';\r\n  return text;\r\n}\r\nfunction backupAndSave(file,text,original) {\r\n  if(fs.existsSync(file) && !fs.readFileSync(file).equals(original)) throw new Erro",
    "r('同期中にファイルが変更されました。再実行してください: '+file);\r\n  const timestamp=new Date().toISOString().replace(/[-:.TZ]/g,'')+'_'+crypto.randomBytes(4).toString('hex');\r\n  fs.writ",
    "eFileSync(file.replace(/\\.md$/,'_backup_'+timestamp+'.md'),original,{flag:'wx'});\r\n  const tmp=file+'.'+timestamp+'.tmp';\r\n  fs.writeFileSync(tmp,'\\uFEFF'+text,",
    "'utf8');fs.renameSync(tmp,file);\r\n}\r\nasync function cli(args=process.argv.slice(2)) {\r\n  const hubIndex=args.indexOf('--hub');\r\n  const hub=hubIndex>=0?args[hub",
    "Index+1]:DEFAULT_HUB;\r\n  if(!hub) throw new Error('--hub に作業フォルダーを指定してください。');\r\n  const config=readConfiguration(hub);\r\n  fs.mkdirSync(config.dir,{recursive:tru",
    "e});\r\n  let lock,store;\r\n  try {lock=fs.openSync(config.lockPath,'wx');} catch {throw new Error('別の同期処理が実行中です。異常終了した場合は .mery-calendar/sync.lock を確認してください。');}\r",
    "\n  const mode=args.includes('--auth')?'--auth':args.includes('--sync')?'--sync':'--preview';\r\n  const statusPath=path.join(config.dir,'run-status.json');let run",
    "Error;\r\n  const writeStatus=value=>{const tmp=statusPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,statusPath);};\r\n  try {\r\n    write",
    "Status({phase:'running',mode,pid:process.pid,startedAt:new Date().toISOString()});\r\n    const offline=args.includes('--offline-preview');\r\n    const auth=args.i",
    "ncludes('--auth');\r\n    const apply=args.includes('--sync');\r\n    const api=offline?null:await google.connect(config,auth);\r\n    if(auth) {\r\n      const calenda",
    "rs=await google.listCalendars(api);\r\n      const text='# Google カレンダー接続完了\\n\\n設定ファイル: '+path.join(config.dir,'config.json')+'\\n\\n現在の calendarId: `'+config.calend",
    "arId+'`\\n\\n## 利用できるカレンダー\\n\\n'+calendars.map(x=>'- '+x.summary+' / '+x.accessRole+'\\n  ID: `'+x.id+'`').join('\\n')+'\\n';\r\n      fs.writeFileSync(config.reportPat",
    "h,'\\uFEFF'+text,'utf8');console.log(text);return;\r\n    }\r\n    // Bind SQLite mappings to the real calendar ID, rather than the account-dependent primary alias.\r",
    "\n    if(!offline && config.calendarId==='primary') {\r\n      const primary=(await google.listCalendars(api)).find(calendar=>calendar.primary);\r\n      if(!primary",
    "?.id) throw new Error('Google のメインカレンダーを特定できませんでした。');\r\n      config.calendarId=primary.id;\r\n    }\r\n    const useTasks=args.includes('--tasks');\r\n    if(!useTas",
    "ks&&fs.existsSync(path.join(config.dir,'tasks-ids.json')))throw new Error('ID別ファイル方式では --tasks を指定するか、更新済みの Mery 同期マクロを使用してください。');\r\n    if(useTasks&&offline)th",
    "row new Error('My Tasks は接続ありのプレビューを使用してください。');\r\n    const taskReport=useTasks?await tasks.run(config,api,apply):'';\r\n    const originals={},documents={};\r\n   ",
    " for(const kind of ['TASKS','LOG']) {\r\n      const file=path.join(hub,kind+'.md');\r\n      if(!fs.existsSync(file)) throw new Error(kind+'.md がありません。両方のファイルを作成して",
    "から同期してください。');\r\n      originals[kind]=fs.readFileSync(file);documents[kind]=decodeFile(originals[kind]);\r\n    }\r\n    store=new SyncStore(config.statePath);\r\n   ",
    " const state=store.load();\r\n    if(apply) {\r\n      // Persist identifiers before sending requests so interrupted first syncs can be retried.\r\n      const stampe",
    "d={TASKS:useTasks?{text:documents.TASKS,items:[]}:core.parseDocument(documents.TASKS,'TASKS'),LOG:core.parseDocument(documents.LOG,'LOG')};\r\n      const ids=[..",
    ".stamped.TASKS.items,...stamped.LOG.items].map(x=>x.id);\r\n      if(new Set(ids).size!==ids.length) throw new Error('TASKS と LOG で同期IDが重複しています。');\r\n      for(con",
    "st kind of ['TASKS','LOG']) if(stamped[kind].text!==documents[kind]) {\r\n        backupAndSave(path.join(hub,kind+'.md'),stamped[kind].text,originals[kind]);\r\n  ",
    "      originals[kind]=fs.readFileSync(path.join(hub,kind+'.md'));documents[kind]=decodeFile(originals[kind]);\r\n      }\r\n    }\r\n    const events=offline?[]:await",
    " google.listAll(api,config.calendarId);\r\n    if(offline && Object.keys(state.entries).length) throw new Error('既に同期済みです。削除誤判定を防ぐため、接続ありのプレビューを使用してください。');\r\n    ",
    "const legacy=Object.fromEntries(Object.entries(state.entries).filter(([,x])=>x.local.kind==='TASKS'));\r\n    const logState=useTasks?{...state,entries:Object.fro",
    "mEntries(Object.entries(state.entries).filter(([,x])=>x.local.kind==='LOG'))}:state;\r\n    const logEvents=useTasks?events.filter(x=>x.extendedProperties?.privat",
    "e?.meryKind==='LOG'||/^\\[LOG\\] /.test(x.summary||'')||Object.values(logState.entries).some(y=>y.eventId===x.id)):events;\r\n    const result=await synchronize(use",
    "Tasks?{...documents,TASKS:''}:documents,logState,logEvents,api,config.calendarId,apply);\r\n    if(useTasks){result.documents.TASKS=documents.TASKS;result.state.e",
    "ntries={...legacy,...result.state.entries};}\r\n    if(apply) {\r\n      // Check both originals before saving either file. Preserve snapshots before every rewrite.",
    "\r\n      for(const kind of ['TASKS','LOG']) if(!fs.readFileSync(path.join(hub,kind+'.md')).equals(originals[kind])) throw new Error('同期中に '+kind+'.md が変更されました。結果",
    "を確認して再実行してください。');\r\n      for(const kind of ['TASKS','LOG']) if(result.documents[kind]!==documents[kind]) backupAndSave(path.join(hub,kind+'.md'),result.documen",
    "ts[kind],originals[kind]);\r\n      store.save(result.state,result);\r\n    }\r\n    const text=report(result,apply)+taskReport;\r\n    fs.writeFileSync(config.reportPa",
    "th,'\\uFEFF'+text,'utf8');console.log(text);\r\n    if(result.errors.length) process.exitCode=1;\r\n  } catch(error) {\r\n    runError=error.message;\r\n    fs.writeFile",
    "Sync(config.reportPath,'\\uFEFF# Google 同期エラー\\n\\n'+runError+'\\n','utf8');\r\n    throw error;\r\n  } finally {\r\n    try {if(store) store.close();} finally {\r\n      f",
    "s.closeSync(lock);fs.unlinkSync(config.lockPath);\r\n      writeStatus({phase:'completed',mode,ok:!runError&&!process.exitCode,error:runError||null,finishedAt:new",
    " Date().toISOString()});\r\n      if(args.includes('--tasks'))notifyCompletion(mode,!runError&&!process.exitCode);\r\n    }\r\n  }\r\n}\r\nmodule.exports={decodeFile,read",
    "Configuration,synchronize,report,cli,notifyCompletion};\r\nif(require.main===module) cli().catch(error=>{\r\n  console.error(error.message);process.exitCode=1;\r\n  t",
    "ry {\r\n    const args=process.argv.slice(2),i=args.indexOf('--hub');\r\n    const hub=i>=0?args[i+1]:DEFAULT_HUB;\r\n    fs.writeFileSync(path.join(hub,'CALENDAR_SYN",
    "C_REPORT.md'),'\\uFEFF# Google カレンダー同期エラー\\n\\n'+error.message+'\\n','utf8');\r\n  } catch {}\r\n});\r\n\n}};\nconst __modules = Object.create(null);\nfor (const name of Obj",
    "ect.keys(__definitions)) __modules[name] = {exports:{}};\nconst __loaded = new Set();\nconst __run = require.main === module;\nfunction __load(name) {\n  if (__load",
    "ed.has(name)) return __modules[name].exports;\n  if (!__definitions[name]) throw new Error('Missing embedded module: ' + name);\n  __loaded.add(name);\n  const loc",
    "alRequire = spec => spec.startsWith('./') ? __load(spec.slice(2)) : require(spec);\n  localRequire.main = __run ? __modules['calendar-sync.cjs'] : null;\n  __defi",
    "nitions[name](localRequire, __modules[name], __modules[name].exports, __path.join(__dirname,name), __dirname);\n  return __modules[name].exports;\n}\nmodule.export",
    "s = __load('calendar-sync.cjs');\n"
].join("");

main();
