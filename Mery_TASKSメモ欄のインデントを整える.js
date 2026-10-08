#title = "TASKSのメモ欄のインデントを整える"
#tooltip = "TASKS.mdのメモ本文をタスクより4字下げに整えます。"

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";

main();

function main() {
    var eventDocument = typeof document !== "undefined";
    var doc = eventDocument ? document : editor.ActiveDocument;
    try {
        if (!doc) return;
        if (!samePath(doc.FullName, TASKS_PATH)) {
            if (!eventDocument) alert("作業ハブの TASKS.md を開いてから実行してください。");
            return;
        }
        var original = doc.Text;
        var result = formatMemoIndent(original);
        if (result.text === original) return;
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        if (fso.FileExists(HUB_DIR + "\\.mery-calendar\\sync.lock")) throw new Error("カレンダー同期が終わってから実行してください。");
        var backupPath = writeBackup(doc.FullName, original);
        doc.Text = result.text;
        try { doc.Save(doc.FullName); }
        catch (saveError) { doc.Text = original; throw saveError; }
        if (!eventDocument) alert("メモ欄を " + result.changed + " 件整形しました。\nバックアップ: " + backupPath);
    } catch (e) {
        alert("TASKSのメモ欄を整形できませんでした: " + e.message);
    }
}

function formatMemoIndent(text) {
    var newline = text.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
    var lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    var changed = 0, fence = "", fencedLines = [], i, match, taskIndent, label, end, bodyEnd, j, minIndent, indent, prefix, content;
    for (i = 0; i < lines.length; i++) {
        match = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
        if (match) { fencedLines[i] = true; if (!fence) fence = match[1].charAt(0); else if (fence === match[1].charAt(0)) fence = ""; }
        else fencedLines[i] = !!fence;
    }
    for (i = 0; i < lines.length; i++) {
        if (fencedLines[i]) continue;
        match = /^([ \t]*)[-*]\s+\[[ xX]\]\s+.+$/.exec(lines[i]);
        if (!match) continue;
        taskIndent = visualIndent(match[1]);
        end = lines.length;
        for (j = i + 1; j < lines.length; j++) {
            if (fencedLines[j]) continue;
            if (/^[ \t]*[-*]\s+\[[ xX]\]\s+/.test(lines[j]) || (/^\s*#{1,6}\s/.test(lines[j]))) { end = j; break; }
            if (trimLine(lines[j]) && visualIndent((lines[j].match(/^[ \t]*/) || [""])[0]) <= taskIndent) { end = j; break; }
        }
        label = -1;
        for (j = i + 1; j < end; j++) if (!fencedLines[j] && /^[ \t]+メモ[:：]\s*$/.test(lines[j])) {
            if (label < 0) label = j;
            else break;
        }
        if (label < 0) { i = end - 1; continue; }
        bodyEnd = end;
        for (j = label + 1; j < end; j++) {
            if (fencedLines[j]) continue;
            if (/^[ \t]+(?:関連メモ|資料)[:：]/.test(lines[j])) { bodyEnd = j; break; }
            if (trimLine(lines[j]) && visualIndent((lines[j].match(/^[ \t]*/) || [""])[0]) <= taskIndent) { bodyEnd = j; break; }
        }
        minIndent = null;
        for (j = label + 1; j < bodyEnd; j++) if (!fencedLines[j] && trimLine(lines[j])) {
            indent = visualIndent((lines[j].match(/^[ \t]*/) || [""])[0]);
            if (minIndent === null || indent < minIndent) minIndent = indent;
        }
        if (minIndent !== null) {
            prefix = (lines[i].match(/^[ \t]*/) || [""])[0] + "    ";
            for (j = label + 1; j < bodyEnd; j++) {
                if (fencedLines[j]) continue;
                if (!trimLine(lines[j])) {
                    if (lines[j] !== "") { lines[j] = ""; changed++; }
                    continue;
                }
                indent = visualIndent((lines[j].match(/^[ \t]*/) || [""])[0]);
                content = lines[j].replace(/^[ \t]*/, "");
                var formatted = prefix + repeatSpaces(Math.max(0, indent - minIndent)) + content;
                if (formatted !== lines[j]) { lines[j] = formatted; changed++; }
            }
        }
        i = end - 1;
    }
    return {text: lines.join(newline), changed: changed};
}

function visualIndent(value) { return String(value).replace(/\t/g, "    ").length; }
function trimLine(value) { return String(value).replace(/^[ \t]+|[ \t]+$/g, ""); }
function repeatSpaces(count) { var value = ""; while (count-- > 0) value += " "; return value; }
function samePath(a, b) { return String(a || "").replace(/\//g, "\\").toLowerCase() === String(b).replace(/\//g, "\\").toLowerCase(); }

function writeBackup(path, text) {
    var fso = new ActiveXObject("Scripting.FileSystemObject"), stamp = backupStamp(new Date()), backup = path + ".memo_indent_backup_" + stamp + ".md", n = 1;
    while (fso.FileExists(backup)) backup = path + ".memo_indent_backup_" + stamp + "_" + (n++) + ".md";
    var stream = new ActiveXObject("ADODB.Stream");
    try { stream.Type = 2; stream.Charset = "utf-8"; stream.Open(); stream.WriteText(text); stream.SaveToFile(backup, 1); }
    finally { if (stream.State !== 0) stream.Close(); }
    return backup;
}

function backupStamp(date) {
    function pad(value) { return ("0" + value).slice(-2); }
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + "_" + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
}
