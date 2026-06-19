#title = "今日の開始テンプレートを挿入"

// Mery タスク管理 v0.6.4
// TASKS.md に「今日の開始テンプレート」を挿入します。
// 標準形式: - [ ] 未完了 / - [x] 完了

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";

main();

function main() {
    try {
        ensureFolder(HUB_DIR);
        ensureFile(TASKS_PATH, "# TASKS\n\n");

        var targetDoc = findOpenDocumentByFullName(TASKS_PATH);

        if (!targetDoc) {
            var existingText = readTextFile(TASKS_PATH);
            editor.NewFile();
            targetDoc = editor.ActiveDocument;
            targetDoc.Text = existingText;
            targetDoc.Save(TASKS_PATH);
        }

        targetDoc.Activate();

        var currentText = targetDoc.Text;
        var today = getTodayLabel();
        var heading = "## " + today + " 今日の作業";

        if (currentText.indexOf(heading) >= 0) {
            try {
                targetDoc.selection.StartOfDocument(false);
                targetDoc.selection.Find(heading, meFindNext);
            } catch (e) {
            }

            alert("今日のTASKSセクションは既にあります。\n新しく追加せず、既存の今日分へ移動しました。\n\n重複している場合は「TASKS.md 今日分の重複項目を整理」を実行してください。");
            return;
        }

        var template = buildStartTemplate(today);
        var newText = insertTemplate(currentText, template);

        targetDoc.Text = newText;
        targetDoc.Save(TASKS_PATH);

        targetDoc.selection.StartOfDocument(false);
        alert("今日の開始テンプレートを TASKS.md に挿入しました。");

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function buildStartTemplate(today) {
    return ""
        + "## " + today + " 今日の作業\n\n"
        + "### 今日やる\n"
        + "- [ ] \n\n"
        + "### 次にやる\n"
        + "- [ ] \n\n"
        + "### 後で\n"
        + "- [ ] \n\n"
        + "### 置く\n"
        + "- [ ] \n\n"
        + "### 確認が必要\n"
        + "- [ ] \n\n"
        + "### メモ\n"
        + "- [ ] \n\n"
        + "---\n\n";
}

function insertTemplate(currentText, template) {
    if (!currentText) {
        return "# TASKS\n\n" + template;
    }

    currentText = String(currentText);
    var normalized = currentText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    if (normalized.indexOf("# TASKS") === 0) {
        var firstLineEnd = normalized.indexOf("\n");
        if (firstLineEnd >= 0) {
            var head = normalized.substring(0, firstLineEnd + 1);
            var rest = normalized.substring(firstLineEnd + 1);
            rest = rest.replace(/^\n+/, "");
            return head + "\n" + template + rest;
        }
    }

    return template + normalized;
}

function getTodayLabel() {
    var d = new Date();
    var y = d.getFullYear();
    var m = zeroPad(d.getMonth() + 1);
    var day = zeroPad(d.getDate());
    var week = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    return y + "-" + m + "-" + day + " (" + week + ")";
}

function zeroPad(n) {
    return n < 10 ? "0" + n : "" + n;
}

function ensureFolder(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FolderExists(path)) {
        fso.CreateFolder(path);
    }
}

function ensureFile(path, defaultText) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(path)) {
        writeTextFile(path, defaultText);
    }
}

function readTextFile(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(path)) {
        return "";
    }

    try {
        var stream = new ActiveXObject("ADODB.Stream");
        stream.Type = 2;
        stream.Charset = "utf-8";
        stream.Open();
        stream.LoadFromFile(path);
        var text = stream.ReadText();
        stream.Close();
        return text;
    } catch (e) {
        var file = fso.OpenTextFile(path, 1, false, -1);
        var fallback = file.ReadAll();
        file.Close();
        return fallback;
    }
}

function writeTextFile(path, text) {
    try {
        var stream = new ActiveXObject("ADODB.Stream");
        stream.Type = 2;
        stream.Charset = "utf-8";
        stream.Open();
        stream.WriteText(text);
        stream.SaveToFile(path, 2);
        stream.Close();
    } catch (e) {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var file = fso.CreateTextFile(path, true, true);
        file.Write(text);
        file.Close();
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

        if (!d.FullName) {
            continue;
        }

        if (normalizePath(d.FullName) === target) {
            return d;
        }
    }

    return null;
}
