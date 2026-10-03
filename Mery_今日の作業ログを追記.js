#title = "今日の作業ログを追記"

// Mery タスク管理 v0.3.2
// LOG.md に「今日の作業ログ」テンプレートを追記/挿入します。
// 既存内容は削除しません。
// 同じ日付の見出しがすでにある場合は、追加するか確認します。

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var LOG_PATH = HUB_DIR + "\\LOG.md";

main();

function main() {
    try {
        ensureFolder(HUB_DIR);
        ensureFile(LOG_PATH, "# LOG\n\n");

        var targetDoc = findOpenDocumentByFullName(LOG_PATH);

        if (!targetDoc) {
            var existingText = readTextFile(LOG_PATH);
            editor.NewFile();
            targetDoc = editor.ActiveDocument;
            targetDoc.Text = existingText;
            targetDoc.Save(LOG_PATH);
        }

        targetDoc.Activate();

        var currentText = targetDoc.Text;
        var today = getTodayLabel();
        var heading = "## " + today + " 作業ログ";

        if (currentText.indexOf(heading) >= 0) {
            if (!Confirm("今日の日付の作業ログがすでにあります。\nもう一つ追加しますか？")) {
                return;
            }
        }

        var selectedText = "";
        try {
            selectedText = targetDoc.selection.Text;
        } catch (e) {
            selectedText = "";
        }

        var template = buildLogTemplate(today, selectedText);
        var newText = insertTemplate(currentText, template);

        targetDoc.Text = newText;
        targetDoc.Save(LOG_PATH);

        targetDoc.selection.StartOfDocument(false);
        alert("今日の作業ログテンプレートを LOG.md に追加しました。");

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function buildLogTemplate(today, selectedText) {
    var memoLine = "- ";
    if (selectedText && selectedText.replace(/\s/g, "").length > 0) {
        memoLine = "- " + selectedText.replace(/\r\n/g, "\n").replace(/\n/g, "\n- ");
    }

    return ""
        + "## " + today + " 作業ログ\n\n"
        + "### やったこと\n"
        + "- \n\n"
        + "### 試したこと\n"
        + "- \n\n"
        + "### うまくいったこと\n"
        + "- \n\n"
        + "### 詰まったこと\n"
        + "- \n\n"
        + "### 次回メモ\n"
        + "- \n\n"
        + "### メモ\n"
        + memoLine + "\n\n"
        + "---\n\n";
}

function insertTemplate(currentText, template) {
    if (!currentText) {
        return "# LOG\n\n" + template;
    }

    currentText = String(currentText);
    var normalized = currentText.replace(/\r\n/g, "\n");

    if (normalized.indexOf("# LOG") === 0) {
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

        if (!d.FullName) {
            continue;
        }

        if (normalizePath(d.FullName) === target) {
            return d;
        }
    }

    return null;
}
