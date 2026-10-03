#title = "TASKS今日やるをGeminiで優先度整理"

// Mery タスク管理 v0.6.5
// TASKS.md の今日セクションから「今日やる」だけを抜き出し、Geminiに優先度案を作らせます。
// TASKS.md本体は上書きしません。
// 出力先: C:\Projects\ai-work-hub\PRIORITY案.md
// call_gemini_api.js を利用します。

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";
var INPUT_PATH = HUB_DIR + "\\PRIORITY整理入力.md";
var OUTPUT_PATH = HUB_DIR + "\\PRIORITY案.md";

var SELECTED_TEMPLATE_PROMPT_TAG = "gemini-selected-template-prompt";
var TEMPORARY_CUSTOM_INSTRUCTION_TAG = "gemini-temporary-custom-instruction";
var OUTPUT_PATH_TAG = "gemini-output-path";
var OUTPUT_TITLE_TAG = "gemini-output-title";

main();

function main() {
    try {
        ensureFolder(HUB_DIR);
        ensureFile(TASKS_PATH, "# TASKS\n\n");

        var today = getTodayLabel();
        var tasksText = getDocumentOrFileText(TASKS_PATH);
        var todayHeading = "## " + today + " 今日の作業";

        if (tasksText.indexOf(todayHeading) < 0) {
            alert("今日のTASKSセクションが見つかりませんでした。");
            return;
        }

        var todayBlock = extractTodayBlock(tasksText, todayHeading);
        var todayTasks = extractSubsection(todayBlock, "今日やる");

        if (!todayTasks || todayTasks.replace(/\s/g, "").length === 0) {
            alert("今日やる欄に優先度整理できるタスクが見つかりませんでした。");
            return;
        }

        var inputText = ""
            + "# PRIORITY整理入力\n\n"
            + "対象日: " + today + "\n\n"
            + "以下は TASKS.md の「今日やる」欄です。\n"
            + "TASKS.md本体は上書きせず、優先度案だけを作成してください。\n\n"
            + "## 今日やる\n"
            + todayTasks + "\n";

        var inputDoc = showTextInSingleTab(INPUT_PATH, inputText);
        inputDoc.Activate();
        selectAllDocument(inputDoc);

        inputDoc.Tag(SELECTED_TEMPLATE_PROMPT_TAG) = buildPrompt();
        inputDoc.Tag(TEMPORARY_CUSTOM_INSTRUCTION_TAG) =
            "あなたは個人用TASKS.mdの優先度整理係です。ユーザーの負担を減らし、今日の作業順を現実的に並べてください。出力は日本語Markdown。未完了は `- [ ]`、完了済みは `- [x]` を使ってください。";
        inputDoc.Tag(OUTPUT_PATH_TAG) = OUTPUT_PATH;
        inputDoc.Tag(OUTPUT_TITLE_TAG) = "PRIORITY案";

        editor.ExecuteMacro("call_gemini_api.js");

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function buildPrompt() {
    return ""
        + "以下の `今日やる` タスクを見て、優先度と作業順を提案してください。\n\n"
        + "前提:\n"
        + "- TASKS.md本体は上書きしない。\n"
        + "- ユーザーが迷わず次の1手を選べるようにする。\n"
        + "- タスクが多い場合は、今日全部やる前提にしない。\n"
        + "- 緊急性・依存関係・短時間で片づくもの・詰まりを解消するものを重視する。\n"
        + "- 体力や集中力を使いすぎない現実的な順番にする。\n"
        + "- 同じ意味のタスクがあれば統合候補として示す。\n"
        + "- 完了済みっぽいものはLOG候補に回す。\n\n"
        + "形式ルール:\n"
        + "- 未完了タスクは `- [ ] 項目`。\n"
        + "- 完了済みは `- [x] 項目`。\n"
        + "- `✓` や `済:` は使わず `[x]` に統一。\n"
        + "- 空の項目は出さない。\n\n"
        + "出力形式:\n\n"
        + "# PRIORITY案\n\n"
        + "## まず1つだけやるなら\n"
        + "- [ ] 項目\n"
        + "理由: 短く\n\n"
        + "## 今から順にやるなら\n"
        + "1. [ ] 項目\n"
        + "2. [ ] 項目\n"
        + "3. [ ] 項目\n\n"
        + "## 優先度A 今日やる\n"
        + "- [ ] 項目\n\n"
        + "## 優先度B 余裕があれば\n"
        + "- [ ] 項目\n\n"
        + "## 後で・置く候補\n"
        + "- [ ] 項目\n\n"
        + "## 確認が必要\n"
        + "- [ ] 項目 — 何を確認するか\n\n"
        + "## 統合候補\n"
        + "- [ ] 項目A と 項目B は統合できそう\n\n"
        + "## LOG候補\n"
        + "- [x] 済み/記録に回してよさそうな項目\n\n"
        + "## TASKS.mdへ反映するなら\n"
        + "- [ ] PRIORITY案から選択して「選択範囲を今日のTASKS欄へ追加」で取り込む\n";
}

function extractTodayBlock(text, heading) {
    var s = text.indexOf(heading);
    if (s < 0) return "";
    var re = /\n##\s+[0-9]{4}-[0-9]{2}-[0-9]{2}\s+\(.+?\)\s+今日の作業/g;
    re.lastIndex = s + heading.length;
    var m = re.exec(text);
    var e = m ? m.index : text.length;
    return text.substring(s, e).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function extractSubsection(block, name) {
    var lines = String(block || "").split("\n");
    var inTarget = false;
    var out = [];

    for (var i = 0; i < lines.length; i++) {
        var line = trim(lines[i]);
        if (!line || /^---+$/.test(line)) continue;

        var h = line.match(/^(#{2,6})\s+(.+?)\s*$/);
        if (h) {
            if (h[1].length >= 4) continue;
            var title = trim(h[2]);
            if (title === name || title === "今日" || title.toLowerCase() === "today" || title === "今やる") {
                inTarget = true;
                continue;
            }
            if (inTarget) break;
            continue;
        }

        if (!inTarget) continue;

        var t = parseTaskLine(line);
        if (!t.body) continue;
        out.push((t.done ? "- [x] " : "- [ ] ") + t.body);
    }

    return out.join("\n");
}

function parseTaskLine(line) {
    line = trim(line);
    var done = false;
    var changed = true;

    while (changed) {
        changed = false;
        line = trim(line);

        if (/^[-*]\s+\[[xX]\]\s*/.test(line)) {
            done = true;
            line = line.replace(/^[-*]\s+\[[xX]\]\s*/, "");
            changed = true;
            continue;
        }
        if (/^[-*]\s+\[\s\]\s*/.test(line)) {
            line = line.replace(/^[-*]\s+\[\s\]\s*/, "");
            changed = true;
            continue;
        }
        if (/^\[[xX]\]\s*/.test(line)) {
            done = true;
            line = line.replace(/^\[[xX]\]\s*/, "");
            changed = true;
            continue;
        }
        if (/^\[\s\]\s*/.test(line)) {
            line = line.replace(/^\[\s\]\s*/, "");
            changed = true;
            continue;
        }
        if (/^[-*]\s+✓\s*/.test(line) || /^✓\s*/.test(line)) {
            done = true;
            line = line.replace(/^[-*]\s+✓\s*/, "").replace(/^✓\s*/, "");
            changed = true;
            continue;
        }
        if (/^[-*]\s+済[:：]\s*/.test(line) || /^済[:：]\s*/.test(line)) {
            done = true;
            line = line.replace(/^[-*]\s+済[:：]\s*/, "").replace(/^済[:：]\s*/, "");
            changed = true;
            continue;
        }
        if (/^[-*]\s+/.test(line)) {
            line = line.replace(/^[-*]\s+/, "");
            changed = true;
            continue;
        }
        if (/^[0-9]+[.)]\s+/.test(line)) {
            line = line.replace(/^[0-9]+[.)]\s+/, "");
            changed = true;
            continue;
        }
    }

    line = trim(line);
    if (!line || line === "-" || line === "*" || line === "[ ]" || line === "[x]" || line === "[X]") {
        return { done: false, body: "" };
    }
    return { done: done, body: line };
}

function selectAllDocument(doc) {
    doc.selection.StartOfDocument(false);
    doc.selection.EndOfDocument(true);
}

function getDocumentOrFileText(path) {
    var d = findOpenDocumentByFullName(path);
    return d ? d.Text : readTextFile(path);
}

function showTextInSingleTab(path, text) {
    var d = findOpenDocumentByFullName(path);
    if (d) {
        d.Activate();
        d.Text = text;
        d.Save(path);
        d.selection.StartOfDocument(false);
        return d;
    }

    writeTextFile(path, text);
    editor.NewFile();
    d = editor.ActiveDocument;
    d.Text = text;
    d.Save(path);
    d.selection.StartOfDocument(false);
    return d;
}

function getTodayLabel() {
    var d = new Date();
    var y = d.getFullYear();
    var m = zeroPad(d.getMonth() + 1);
    var day = zeroPad(d.getDate());
    var week = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    return y + "-" + m + "-" + day + " (" + week + ")";
}

function zeroPad(n) { return n < 10 ? "0" + n : "" + n; }
function trim(str) { return String(str).replace(/^\s+|\s+$/g, ""); }

function ensureFolder(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FolderExists(path)) fso.CreateFolder(path);
}

function ensureFile(path, text) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(path)) writeTextFile(path, text);
}

function readTextFile(path) {
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

function writeTextFile(path, text) {
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

function normalizePath(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    return fso.GetAbsolutePathName(path).toLowerCase();
}

function findOpenDocumentByFullName(fullPath) {
    var target = normalizePath(fullPath);
    for (var i = 0; i < editor.Documents.Count; i++) {
        var d = editor.Documents.Item(i);
        if (d.FullName && normalizePath(d.FullName) === target) return d;
    }
    return null;
}
