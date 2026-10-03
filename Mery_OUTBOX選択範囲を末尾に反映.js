#title = "OUTBOX選択範囲を末尾に反映"

// Mery タスク管理 v0.3.4
// 選択範囲またはアクティブ行を、TASKS.md / LOG.md の末尾に追記します。
// v0.3.3 の「先頭付近へ挿入」だと見失いやすかったため、末尾追記に変更しました。
// 既存内容は削除しません。

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";
var LOG_PATH = HUB_DIR + "\\LOG.md";

var MENU_TO_TASKS = 1;
var MENU_TO_LOG = 2;
var MENU_TO_BOTH = 3;

main();

function main() {
    try {
        var sourceText = getSelectedOrActiveLineText();

        if (!sourceText || sourceText.replace(/\s/g, "").length === 0) {
            alert("反映するテキストを選択するか、反映したい行にカーソルを置いてください。");
            return;
        }

        var menu = CreatePopupMenu();
        menu.Add("TASKS.md の末尾に追記", MENU_TO_TASKS);
        menu.Add("LOG.md の末尾に追記", MENU_TO_LOG);
        menu.Add("TASKS.md と LOG.md の両方に追記", MENU_TO_BOTH);

        var selected = menu.Track(0);
        if (selected === 0) {
            return;
        }

        ensureFolder(HUB_DIR);

        var message = "";

        if (selected === MENU_TO_TASKS || selected === MENU_TO_BOTH) {
            appendBlockToFileTab(TASKS_PATH, "# TASKS\n\n", buildReflectionBlock("OUTBOX反映", sourceText));
            message += "TASKS.md に追記しました。\n";
        }

        if (selected === MENU_TO_LOG || selected === MENU_TO_BOTH) {
            appendBlockToFileTab(LOG_PATH, "# LOG\n\n", buildReflectionBlock("OUTBOX反映ログ", sourceText));
            message += "LOG.md に追記しました。\n";
        }

        alert(message + "\n反映文字数: " + sourceText.length);

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function getSelectedOrActiveLineText() {
    var sel = document.selection;
    var text = "";

    try {
        text = sel.Text;
    } catch (e) {
        text = "";
    }

    if (text && text.length > 0) {
        return text;
    }

    // 選択がない場合は、アクティブ行を使う。
    try {
        sel.StartOfLine(false, mePosLogical);
        sel.EndOfLine(true, mePosLogical);
        text = sel.Text;
    } catch (e2) {
        text = "";
    }

    return text;
}

function buildReflectionBlock(title, text) {
    var today = getTodayLabel();
    var normalizedText = String(text)
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\s+$/g, "");

    return ""
        + "\n\n"
        + "## " + today + " " + title + "\n\n"
        + normalizedText + "\n\n"
        + "---\n";
}

function appendBlockToFileTab(path, defaultText, blockText) {
    ensureFile(path, defaultText);

    var targetDoc = findOpenDocumentByFullName(path);

    if (targetDoc) {
        // 既にタブが開いている場合は、そのタブの末尾に追記して保存する。
        targetDoc.Activate();

        var currentText = targetDoc.Text;
        if (!currentText || String(currentText).replace(/\s/g, "").length === 0) {
            currentText = defaultText;
        }

        targetDoc.Text = String(currentText).replace(/\s*$/g, "") + blockText;
        targetDoc.Save(path);

        try {
            targetDoc.selection.EndOfDocument(false);
        } catch (e) {
        }

        return;
    }

    // タブが開いていない場合は、ファイルへ追記してから新規タブで表示する。
    var existingText = readTextFile(path);
    if (!existingText || String(existingText).replace(/\s/g, "").length === 0) {
        existingText = defaultText;
    }

    var newText = String(existingText).replace(/\s*$/g, "") + blockText;
    writeTextFile(path, newText);

    editor.NewFile();
    targetDoc = editor.ActiveDocument;
    targetDoc.Text = newText;
    targetDoc.Save(path);

    try {
        targetDoc.selection.EndOfDocument(false);
    } catch (e2) {
    }
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
