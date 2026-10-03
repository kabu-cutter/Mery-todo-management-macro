#title = "日次レビューを作成"

// Mery タスク管理 v0.4.0
// TASKS.md / LOG.md / OUTBOX.md をもとに DAILY_REVIEW.md を作成します。
// AI APIは呼びません。今日のセクションを抜き出して、日次レビュー用の形にまとめます。

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";
var LOG_PATH = HUB_DIR + "\\LOG.md";
var OUTBOX_PATH = HUB_DIR + "\\OUTBOX.md";
var REVIEW_PATH = HUB_DIR + "\\DAILY_REVIEW.md";

main();

function main() {
    try {
        ensureFolder(HUB_DIR);
        ensureFile(TASKS_PATH, "# TASKS\n\n");
        ensureFile(LOG_PATH, "# LOG\n\n");
        ensureFile(OUTBOX_PATH, "# OUTBOX\n\n");

        var today = getTodayLabel();

        var tasksText = getDocumentOrFileText(TASKS_PATH);
        var logText = getDocumentOrFileText(LOG_PATH);
        var outboxText = getDocumentOrFileText(OUTBOX_PATH);

        var tasksToday = extractSection(tasksText, "## " + today + " 今日の作業");
        var logToday = extractSection(logText, "## " + today + " 作業ログ");

        if (!tasksToday) {
            tasksToday = "今日のTASKSセクションは見つかりませんでした。\n";
        }

        if (!logToday) {
            logToday = "今日のLOGセクションは見つかりませんでした。\n";
        }

        var outboxRecent = trimText(outboxText, 5000);

        var reviewText = buildReview(today, tasksToday, logToday, outboxRecent);

        showTextInSingleTab(REVIEW_PATH, reviewText);

        alert("DAILY_REVIEW.md を作成しました。");

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function buildReview(today, tasksToday, logToday, outboxRecent) {
    return ""
        + "# DAILY_REVIEW\n\n"
        + "## " + today + " 日次レビュー\n\n"
        + "### 今日のTASKS抜粋\n\n"
        + tasksToday + "\n\n"
        + "### 今日のLOG抜粋\n\n"
        + logToday + "\n\n"
        + "### OUTBOX最近の内容\n\n"
        + outboxRecent + "\n\n"
        + "### 明日に回す候補\n"
        + "- [ ] \n\n"
        + "### 完了として残すこと\n"
        + "- \n\n"
        + "### 詰まったこと\n"
        + "- \n\n"
        + "### 次にAIへ頼むとよさそうな指示\n\n"
        + "```text\n"
        + "以下のTASKS/LOG/OUTBOXをもとに、明日やる作業を3つに絞ってください。\n"
        + "出力は「今日やる / 次にやる / 後で / 置く / 確認が必要」のMarkdownでお願いします。\n"
        + "勝手に完了扱いにせず、不明点は確認が必要に分けてください。\n"
        + "```\n\n"
        + "---\n";
}

function extractSection(text, heading) {
    if (!text) {
        return "";
    }

    var normalized = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var start = normalized.indexOf(heading);

    if (start < 0) {
        return "";
    }

    var next = normalized.indexOf("\n## ", start + heading.length);
    if (next < 0) {
        return normalized.substring(start).replace(/\s+$/g, "");
    }

    return normalized.substring(start, next).replace(/\s+$/g, "");
}

function trimText(text, maxLen) {
    if (!text) {
        return "";
    }

    text = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    if (text.length <= maxLen) {
        return text;
    }

    return "（長いため末尾 " + maxLen + " 文字のみ表示）\n\n" + text.substring(text.length - maxLen);
}

function getDocumentOrFileText(path) {
    var d = findOpenDocumentByFullName(path);

    if (d) {
        return d.Text;
    }

    return readTextFile(path);
}

function showTextInSingleTab(path, text) {
    var d = findOpenDocumentByFullName(path);

    if (d) {
        d.Activate();
        d.Text = text;
        d.Save(path);

        try {
            d.selection.StartOfDocument(false);
        } catch (e) {
        }

        return;
    }

    writeTextFile(path, text);
    editor.NewFile();
    d = editor.ActiveDocument;
    d.Text = text;
    d.Save(path);

    try {
        d.selection.StartOfDocument(false);
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
