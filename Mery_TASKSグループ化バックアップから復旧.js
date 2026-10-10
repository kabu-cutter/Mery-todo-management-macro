#title = "TASKS.mdをグループ化バックアップから復旧"
#tooltip = "グループ化前のバックアップを選び、現在のTASKS.mdを退避して復旧します。"

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";
var BACKUP_PATTERN = /^TASKS_group_backup_([0-9]+)\.md$/i;
var MENU_BASE = 100;

main();

function main() {
    try {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        if (!fso.FolderExists(HUB_DIR)) throw new Error("作業ハブが見つかりません: " + HUB_DIR);
        var backups = listBackups(fso);
        if (backups.length === 0) throw new Error("TASKS_group_backup_*.md が見つかりません。");

        var menu = CreatePopupMenu();
        var maxItems = Math.min(backups.length, 20);
        for (var i = 0; i < maxItems; i++) {
            menu.Add(formatBackupLabel(backups[i]), MENU_BASE + i);
        }
        var selected = menu.Track(0);
        if (selected < MENU_BASE || selected >= MENU_BASE + maxItems) return;

        var backup = backups[selected - MENU_BASE];
        restoreBackup(fso, backup.path);
    } catch (e) {
        alert("TASKS.mdの復旧に失敗しました。\n\n" + e.message);
    }
}

function listBackups(fso) {
    var folder = fso.GetFolder(HUB_DIR);
    var files = new Enumerator(folder.Files);
    var results = [];
    for (; !files.atEnd(); files.moveNext()) {
        var file = files.item();
        var match = BACKUP_PATTERN.exec(file.Name);
        if (match) results.push({ path: file.Path, name: file.Name, epoch: Number(match[1]) });
    }
    results.sort(function(a, b) { return b.epoch - a.epoch; });
    return results;
}

function formatBackupLabel(backup) {
    var date = new Date(backup.epoch);
    var stamp = date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) +
        " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
    return stamp + "  " + backup.name;
}

function restoreBackup(fso, backupPath) {
    var shell = new ActiveXObject("WScript.Shell");
    var targetExists = fso.FileExists(TASKS_PATH);
    var openDoc = findOpenTasksDocument(fso);
    if (openDoc && !openDoc.Saved) throw new Error("TASKS.mdに未保存の変更があります。保存するか、変更を破棄してから再実行してください。");
    if (!targetExists) throw new Error("復旧先のTASKS.mdが見つかりません: " + TASKS_PATH);

    var sourceText = readUtf8(backupPath);
    if (!confirm("次のバックアップでTASKS.mdを置き換えます。\n\n" + backupPath +
        "\n\n現在のTASKS.mdは先にTASKS_before_restore_日時.mdへ退避します。続けますか？")) return;

    var safetyPath = HUB_DIR + "\\TASKS_before_restore_" + timestamp() + ".md";
    fso.CopyFile(TASKS_PATH, safetyPath, false);
    try {
        if (openDoc) {
            var oldText = openDoc.Text;
            try {
                openDoc.Text = sourceText;
                openDoc.Save(TASKS_PATH);
            } catch (saveError) {
                openDoc.Text = oldText;
                throw saveError;
            }
        } else {
            writeUtf8(TASKS_PATH, sourceText);
        }
        alert("TASKS.mdを復旧しました。\n\n使用したバックアップ:\n" + backupPath +
            "\n\n復旧前の内容:\n" + safetyPath);
    } catch (e) {
        try { fso.CopyFile(safetyPath, TASKS_PATH, true); } catch (ignored) {}
        throw new Error(e.message + "\n復旧前の内容は次に退避されています:\n" + safetyPath);
    }
}

function findOpenTasksDocument(fso) {
    var docs = editor.Documents;
    var expected = fso.GetAbsolutePathName(TASKS_PATH).toLowerCase();
    for (var i = 0; i < docs.Count; i++) {
        var doc = docs.Item(i);
        if (doc.FullName && fso.GetAbsolutePathName(doc.FullName).toLowerCase() === expected) return doc;
    }
    return null;
}

function readUtf8(path) {
    var stream = new ActiveXObject("ADODB.Stream");
    stream.Type = 2; stream.Charset = "utf-8"; stream.Open(); stream.LoadFromFile(path);
    var text = stream.ReadText(); stream.Close();
    return text.replace(/^\uFEFF/, "");
}

function writeUtf8(path, text) {
    var stream = new ActiveXObject("ADODB.Stream");
    stream.Type = 2; stream.Charset = "utf-8"; stream.Open(); stream.WriteText(text);
    stream.SaveToFile(path, 2); stream.Close();
}

function timestamp() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "_" +
        pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}

function pad2(value) { return value < 10 ? "0" + value : String(value); }
