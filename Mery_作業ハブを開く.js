#title = "Mery 作業ハブを開く"
#tooltip = "作業用ファイルを準備し、TASKS.mdとLOG.mdを表示します。COMMAND.mdとOUTBOX.mdは必要時に開きます。"

// Mery + Gemini タスク管理用 作業ハブ起動マクロ v0.3
// 注意:
// - 親マクロなので #language は付けません。
// - Gemini API は呼びません。
// - 既存ファイルを勝手に初期化しません。存在しない場合だけ作成します。
// - すでに開いているタブがあれば、そのタブを再利用します。

var HUB_DIR = "C:\\Projects\\ai-work-hub";

var FILES = [
    {
        name: "TASKS.md",
        initial: buildTasksTemplate()
    },
    {
        name: "LOG.md",
        initial: buildLogTemplate()
    },
    {
        name: "COMMAND.md",
        initial: buildCommandTemplate()
    },
    {
        name: "OUTBOX.md",
        initial: "# OUTBOX\r\n\r\nAIからの返答をここに表示します。\r\n"
    },
    {
        name: "TODO案.md",
        initial: "# TODO案\r\n\r\nGemini_TODO生成.js の出力先です。\r\n"
    },
    {
        name: "LOG案.md",
        initial: "# LOG案\r\n\r\nGemini_LOG生成.js の出力先です。\r\n"
    }
];

main();

function main() {
    try {
        ensureFolder(HUB_DIR);

        for (var i = 0; i < FILES.length; i++) {
            var fullPath = HUB_DIR + "\\" + FILES[i].name;
            ensureFile(fullPath, FILES[i].initial);
        }

        // 通常の作業では TASKS と LOG を表示。既存タブがあれば再利用します。
        showFileInSingleTab(HUB_DIR + "\\TASKS.md");
        showFileInSingleTab(HUB_DIR + "\\LOG.md");
        // OUTBOX は Gemini の結果表示時、COMMAND はファイルを開く操作で表示します。

        // 最後に TASKS.md を前面に戻す
        showFileInSingleTab(HUB_DIR + "\\TASKS.md");
    }
    catch (e) {
        alert("作業ハブを開けませんでした: " + e.message);
    }
}

function ensureFolder(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FolderExists(path)) {
        fso.CreateFolder(path);
    }
}

function ensureFile(path, initialText) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (fso.FileExists(path)) {
        return;
    }
    writeUtf8Text(path, initialText);
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

function showFileInSingleTab(fullPath) {
    var opened = findOpenDocumentByFullName(fullPath);
    if (opened) {
        opened.Activate();
        return;
    }

    // editor.OpenFile は環境によって現在タブを置き換えることがあるため使わない。
    // NewFile → Text設定 → Save で、既存タブを壊しにくい形にする。
    var text = readUtf8Text(fullPath);
    editor.NewFile();
    var d = editor.ActiveDocument;
    d.Text = text;
    d.Save(fullPath);
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

function writeUtf8Text(path, text) {
    var stream = new ActiveXObject("ADODB.Stream");
    stream.Type = 2; // text
    stream.Charset = "utf-8";
    stream.Open();
    stream.WriteText(text);
    stream.SaveToFile(path, 2); // overwrite
    stream.Close();
}

function todayText() {
    var d = new Date();
    var y = d.getFullYear();
    var m = ("0" + (d.getMonth() + 1)).slice(-2);
    var day = ("0" + d.getDate()).slice(-2);
    return y + "-" + m + "-" + day;
}

function buildTasksTemplate() {
    return "# TASKS\r\n\r\n"
        + "## 今日やる\r\n"
        + "- [ ] \r\n\r\n"
        + "## 次にやる\r\n"
        + "- [ ] \r\n\r\n"
        + "## 後で\r\n"
        + "- [ ] \r\n\r\n"
        + "## 置く\r\n"
        + "- [ ] \r\n\r\n"
        + "## 確認が必要\r\n"
        + "- [ ] \r\n";
}

function buildLogTemplate() {
    return "# LOG\r\n\r\n"
        + "## " + todayText() + "\r\n"
        + "- \r\n";
}

function buildCommandTemplate() {
    return "# COMMAND\r\n\r\n"
        + "対象: \r\n\r\n"
        + "やってほしいこと:\r\n"
        + "- \r\n\r\n"
        + "制約:\r\n"
        + "- 勝手に完了扱いにしない\r\n"
        + "- 勝手にファイルを上書きしない\r\n"
        + "- 必要なら確認が必要に分ける\r\n\r\n"
        + "出力:\r\n"
        + "- 今日やる\r\n"
        + "- 後で\r\n"
        + "- LOG候補\r\n"
        + "- TODO.md反映候補\r\n";
}
