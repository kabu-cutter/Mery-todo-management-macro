#title = "LOG同日日付を統合"

// Mery タスク管理 v0.4.8
// LOG.md 内で同じ日付の「## YYYY-MM-DD (...) 作業ログ」が複数ある場合、1つに統合します。
// AI APIは使いません。
// 実行前に LOG_backup_YYYYMMDD_HHMMSS.md を作成します。

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var LOG_PATH = HUB_DIR + "\\LOG.md";

var STANDARD_SUBSECTIONS = [
    "やったこと",
    "試したこと",
    "うまくいったこと",
    "詰まったこと",
    "次回メモ",
    "メモ"
];

main();

function main() {
    try {
        ensureFolder(HUB_DIR);
        ensureFile(LOG_PATH, "# LOG\n\n");

        var logDoc = getOrOpenDocument(LOG_PATH, "# LOG\n\n");
        logDoc.Activate();

        var originalText = logDoc.Text;

        if (!originalText || originalText.replace(/\s/g, "").length === 0) {
            alert("LOG.md が空です。");
            return;
        }

        var result = mergeDuplicateLogDates(originalText);

        if (result.changedCount === 0) {
            alert("同じ日付の重複ログは見つかりませんでした。");
            return;
        }

        if (!Confirm(
            "同じ日付の作業ログを統合します。\n\n"
            + "統合対象: " + result.changedCount + " 日分\n"
            + "統合前にバックアップを作成します。\n\n"
            + "実行しますか？"
        )) {
            return;
        }

        var backupPath = createBackup(originalText);

        logDoc.Text = result.text;
        logDoc.Save(LOG_PATH);

        try {
            logDoc.selection.StartOfDocument(false);
        } catch (e) {
        }

        alert(
            "LOG.md の同日日付ログを統合しました。\n\n"
            + "統合対象: " + result.changedCount + " 日分\n"
            + "バックアップ:\n" + backupPath
        );

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function mergeDuplicateLogDates(text) {
    var normalized = String(text)
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    var topTitle = "# LOG";
    var body = normalized;

    if (body.indexOf("# LOG") === 0) {
        var firstLineEnd = body.indexOf("\n");
        if (firstLineEnd >= 0) {
            topTitle = body.substring(0, firstLineEnd).replace(/\s+$/g, "");
            body = body.substring(firstLineEnd + 1);
        }
    }

    var sections = splitLogSections(body);

    if (sections.length === 0) {
        return { text: normalized, changedCount: 0 };
    }

    var groups = {};
    var order = [];
    var nonLogBlocks = [];

    for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];

        if (!sec.heading || !isLogDateHeading(sec.heading)) {
            nonLogBlocks.push(sec.raw);
            continue;
        }

        var key = sec.heading;

        if (!groups[key]) {
            groups[key] = [];
            order.push(key);
        }

        groups[key].push(sec);
    }

    var changedCount = 0;
    var output = topTitle + "\n\n";

    // 日付ログを元の登場順で出す。重複しているものは統合する。
    for (var j = 0; j < order.length; j++) {
        var heading = order[j];
        var list = groups[heading];

        if (list.length > 1) {
            changedCount++;
        }

        output += buildMergedLogSection(heading, list) + "\n\n";
    }

    // 日付見出しではないブロックがあれば末尾に残す。
    for (var k = 0; k < nonLogBlocks.length; k++) {
        var block = String(nonLogBlocks[k]).replace(/^\s+|\s+$/g, "");
        if (block) {
            output += block + "\n\n";
        }
    }

    output = output.replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "") + "\n";

    return { text: output, changedCount: changedCount };
}

function splitLogSections(body) {
    var text = String(body || "");
    var lines = text.split("\n");
    var sections = [];
    var current = [];
    var currentHeading = "";

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        if (/^##\s+/.test(line)) {
            if (current.length > 0) {
                sections.push({
                    heading: currentHeading,
                    raw: current.join("\n")
                });
            }

            current = [line];
            currentHeading = line.replace(/\s+$/g, "");
        } else {
            current.push(line);
        }
    }

    if (current.length > 0) {
        sections.push({
            heading: currentHeading,
            raw: current.join("\n")
        });
    }

    return sections;
}

function isLogDateHeading(heading) {
    return /^##\s+[0-9]{4}-[0-9]{2}-[0-9]{2}\s+\(.+\)\s+作業ログ\s*$/.test(heading);
}

function buildMergedLogSection(heading, sections) {
    var sectionMap = {};
    var unknownLines = [];
    var subsectionOrder = STANDARD_SUBSECTIONS.slice(0);

    for (var i = 0; i < STANDARD_SUBSECTIONS.length; i++) {
        sectionMap[STANDARD_SUBSECTIONS[i]] = [];
    }

    for (var s = 0; s < sections.length; s++) {
        var parsed = parseLogSection(sections[s].raw);

        for (var key in parsed.map) {
            if (!sectionMap[key]) {
                sectionMap[key] = [];
                subsectionOrder.push(key);
            }

            appendUniqueLines(sectionMap[key], parsed.map[key]);
        }

        appendUniqueLines(unknownLines, parsed.unknown);
    }

    if (unknownLines.length > 0) {
        appendUniqueLines(sectionMap["メモ"], unknownLines);
    }

    var output = heading + "\n\n";

    // 標準外の小見出しと、その配下の記録も保存する。
    for (var j = 0; j < subsectionOrder.length; j++) {
        var name = subsectionOrder[j];
        output += "### " + name + "\n";

        var lines = sectionMap[name] || [];
        if (lines.length === 0) {
            output += "- \n\n";
        } else {
            output += toBulletLines(lines) + "\n\n";
        }
    }

    output += "---";

    return output;
}

function toBulletLines(lines) {
    var out = [];

    for (var i = 0; i < lines.length; i++) {
        var line = trim(lines[i]);
        if (line) {
            out.push("- " + line);
        }
    }

    return out.join("\n");
}

function parseLogSection(raw) {
    var lines = String(raw || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n");

    var map = {};
    var unknown = [];
    var currentSub = "";

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var trimmed = trim(line);

        if (!trimmed) {
            continue;
        }

        if (/^##\s+/.test(trimmed)) {
            continue;
        }

        if (/^---+$/.test(trimmed)) {
            continue;
        }

        var subMatch = trimmed.match(/^###\s+(.+?)\s*$/);
        if (subMatch) {
            currentSub = subMatch[1];

            if (!map[currentSub]) {
                map[currentSub] = [];
            }

            continue;
        }

        if (currentSub) {
            if (!map[currentSub]) {
                map[currentSub] = [];
            }

            appendUniqueLine(map[currentSub], cleanupLogLine(trimmed));
        } else {
            appendUniqueLine(unknown, cleanupLogLine(trimmed));
        }
    }

    return { map: map, unknown: unknown };
}

function cleanupLogLine(line) {
    line = trim(line);

    // 空の箇条書きや空のチェックボックスは落とす。
    if (line === "-" || line === "*" || line === "- [ ]" || line === "- [x]" || line === "- [X]") {
        return "";
    }

    // LOG側は実績なので、TASKS側の完了印は外す。
    line = line.replace(/^[-*]\s+✓\s*/, "");
    line = line.replace(/^✓\s*/, "");
    line = line.replace(/^[-*]\s+済[:：]\s*/, "");
    line = line.replace(/^済[:：]\s*/, "");

    // 旧形式の飾りを外しすぎず、見た目だけ軽くする。
    line = line.replace(/^[-*]\s+\[[ xX]\]\s+/, "");
    line = line.replace(/^[-*]\s+/, "");

    return trim(line);
}

function appendUniqueLines(target, lines) {
    if (!lines) {
        return;
    }

    for (var i = 0; i < lines.length; i++) {
        appendUniqueLine(target, lines[i]);
    }
}

function appendUniqueLine(target, line) {
    line = trim(line);

    if (!line) {
        return;
    }

    for (var i = 0; i < target.length; i++) {
        if (target[i] === line) {
            return;
        }
    }

    target.push(line);
}

function createBackup(text) {
    var backupPath = HUB_DIR + "\\LOG_backup_" + getTimestampForFile() + ".md";
    writeTextFile(backupPath, text);
    return backupPath;
}

function getTimestampForFile() {
    var d = new Date();
    return ""
        + d.getFullYear()
        + zeroPad(d.getMonth() + 1)
        + zeroPad(d.getDate())
        + "_"
        + zeroPad(d.getHours())
        + zeroPad(d.getMinutes())
        + zeroPad(d.getSeconds());
}

function getOrOpenDocument(path, defaultText) {
    var d = findOpenDocumentByFullName(path);

    if (d) {
        return d;
    }

    var existingText = readTextFile(path);
    if (!existingText || String(existingText).replace(/\s/g, "").length === 0) {
        existingText = defaultText;
    }

    editor.NewFile();
    d = editor.ActiveDocument;
    d.Text = existingText;
    d.Save(path);

    return d;
}

function trim(str) {
    return String(str).replace(/^\s+|\s+$/g, "");
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
