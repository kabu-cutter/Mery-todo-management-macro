#title = "TASKS選択項目をLOGへ記録"

// Mery タスク管理 v0.6.3
// TASKS.md などで選択した行を LOG.md の今日の作業ログへ記録します。
// 記録後、元の選択行は - [x] 形式に正規化します。
// 互換入力: - [ ] / - [x] / - ✓ / ✓ / 済: / - 項目 / 二重三重チェック

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var LOG_PATH = HUB_DIR + "\\LOG.md";

var MENU_DONE = 1;
var MENU_TRIED = 2;
var MENU_GOOD = 3;
var MENU_STUCK = 4;
var MENU_NEXT = 5;
var MENU_MEMO = 6;
var MENU_LOG_ONLY = 7;

main();

function main() {
    try {
        var selInfo = getSelectedOrActiveLineInfo();

        if (!selInfo.text || selInfo.text.replace(/\s/g, "").length === 0) {
            alert("LOG.md に記録するTASKS項目を選択するか、記録したい行にカーソルを置いてください。");
            return;
        }

        var menu = CreatePopupMenu();
        menu.Add("LOG.md の「やったこと」に記録して TASKS を [x] にする", MENU_DONE);
        menu.Add("LOG.md の「試したこと」に記録して TASKS を [x] にする", MENU_TRIED);
        menu.Add("LOG.md の「うまくいったこと」に記録して TASKS を [x] にする", MENU_GOOD);
        menu.Add("LOG.md の「詰まったこと」に記録して TASKS を [x] にする", MENU_STUCK);
        menu.Add("LOG.md の「次回メモ」に記録して TASKS を [x] にする", MENU_NEXT);
        menu.Add("LOG.md の「メモ」に記録して TASKS を [x] にする", MENU_MEMO);
        menu.Add("", 0, meMenuSeparator);
        menu.Add("LOG.md に記録だけする（TASKSは変更しない）", MENU_LOG_ONLY);

        var selected = menu.Track(0);
        if (selected === 0) {
            return;
        }

        ensureFolder(HUB_DIR);
        ensureFile(LOG_PATH, "# LOG\n\n");

        var logSectionName = getLogSectionName(selected);
        var logLines = normalizeLinesForLog(selInfo.text);

        if (!logLines || logLines.replace(/\s/g, "").length === 0) {
            alert("記録できる行がありませんでした。見出し行だけを選択していないか確認してください。");
            return;
        }

        appendToTodayLogSection(logSectionName, logLines);

        if (selected !== MENU_LOG_ONLY) {
            markCurrentSelectionAsDone(selInfo);
        }

        alert("LOG.md に記録しました。");

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function getSelectedOrActiveLineInfo() {
    var sel = document.selection;
    var selectionWasEmpty = false;
    var text = "";

    try {
        selectionWasEmpty = sel.IsEmpty;
    } catch (e) {
        selectionWasEmpty = true;
    }

    if (selectionWasEmpty) {
        try {
            sel.StartOfLine(false, mePosLogical);
            sel.EndOfLine(true, mePosLogical);
        } catch (e2) {
        }
    }

    try {
        text = sel.Text;
    } catch (e3) {
        text = "";
    }

    return {
        text: text,
        selectionWasEmpty: selectionWasEmpty
    };
}

function getLogSectionName(menuId) {
    if (menuId === MENU_DONE) {
        return "やったこと";
    }
    if (menuId === MENU_TRIED) {
        return "試したこと";
    }
    if (menuId === MENU_GOOD) {
        return "うまくいったこと";
    }
    if (menuId === MENU_STUCK) {
        return "詰まったこと";
    }
    if (menuId === MENU_NEXT) {
        return "次回メモ";
    }
    if (menuId === MENU_MEMO || menuId === MENU_LOG_ONLY) {
        return "メモ";
    }
    return "やったこと";
}

function normalizeLinesForLog(text) {
    var normalized = String(text)
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    var lines = normalized.split("\n");
    var out = [];

    for (var i = 0; i < lines.length; i++) {
        var line = trim(lines[i]);

        if (!line) {
            continue;
        }

        if (/^#+\s+/.test(line) || /^---+$/.test(line)) {
            continue;
        }

        var task = parseTaskLine(line);

        if (task.body) {
            out.push("- " + task.body);
        }
    }

    return out.join("\n");
}

function markCurrentSelectionAsDone(selInfo) {
    var original = selInfo.text;
    var marked = markLinesAsDone(original);

    if (!marked || marked === original) {
        return;
    }

    try {
        document.selection.Text = marked;
        document.Save(document.FullName);
    } catch (e) {
        alert("LOGには記録しましたが、TASKS側の [x] 保存に失敗しました。\n" + e.message);
    }
}

function markLinesAsDone(text) {
    var normalized = String(text)
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    var endsWithNewline = /\n$/.test(normalized);
    var lines = normalized.split("\n");
    var out = [];

    for (var i = 0; i < lines.length; i++) {
        var raw = lines[i];
        var line = trim(raw);

        if (!line) {
            out.push(raw);
            continue;
        }

        if (/^#+\s+/.test(line) || /^-{3,}$/.test(line)) {
            out.push(raw);
            continue;
        }

        var task = parseTaskLine(line);

        if (task.body) {
            out.push("- [x] " + task.body);
        } else {
            out.push(raw);
        }
    }

    var result = out.join("\n");

    if (endsWithNewline && result.slice(-1) !== "\n") {
        result += "\n";
    }

    return result;
}

function parseTaskLine(line) {
    line = trim(line);

    if (!line) {
        return { done: false, body: "" };
    }

    var done = false;
    var changed = true;

    // 先頭にチェック記法や箇条書きが二重三重についている場合も、ここで吸収する。
    // 例:
    // - [ ] [ ] タスク
    // - [x] [ ] タスク
    // - [ ] - [x] タスク
    // - ✓ [ ] タスク
    // 済: - [ ] タスク
    while (changed) {
        changed = false;
        line = trim(line);

        if (!line) {
            break;
        }

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

        if (/^[-*]\s+✓\s*/.test(line)) {
            done = true;
            line = line.replace(/^[-*]\s+✓\s*/, "");
            changed = true;
            continue;
        }

        if (/^✓\s*/.test(line)) {
            done = true;
            line = line.replace(/^✓\s*/, "");
            changed = true;
            continue;
        }

        if (/^[-*]\s+済[:：]\s*/.test(line)) {
            done = true;
            line = line.replace(/^[-*]\s+済[:：]\s*/, "");
            changed = true;
            continue;
        }

        if (/^済[:：]\s*/.test(line)) {
            done = true;
            line = line.replace(/^済[:：]\s*/, "");
            changed = true;
            continue;
        }

        // 普通の箇条書きや番号付きも、先頭に複数ある場合は外す。
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

    return {
        done: done,
        body: line
    };
}

function appendToTodayLogSection(sectionName, insertText) {
    var today = getTodayLabel();
    var logDoc = getOrOpenDocument(LOG_PATH, "# LOG\n\n");
    logDoc.Activate();

    var currentText = logDoc.Text;
    var newText = insertIntoTodayLogSection(currentText, today, sectionName, insertText);

    logDoc.Text = newText;
    logDoc.Save(LOG_PATH);

    moveToLogSection(logDoc, today, sectionName);
}

function insertIntoTodayLogSection(text, today, sectionName, insertText) {
    var normalized = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    if (!normalized || normalized.replace(/\s/g, "").length === 0) {
        normalized = "# LOG\n\n";
    }

    normalized = ensureTopTitle(normalized, "# LOG");

    var todayHeading = "## " + today + " 作業ログ";

    if (normalized.indexOf(todayHeading) < 0) {
        normalized = insertTodayLogTemplateAfterTitle(normalized, today);
    }

    normalized = ensureSubSection(normalized, todayHeading, sectionName);

    var subHeading = "### " + sectionName;
    var subIndex = normalized.indexOf(subHeading);

    if (subIndex < 0) {
        return appendToEnd(normalized, "\n\n" + subHeading + "\n" + insertText + "\n");
    }

    var insertPos = findEndOfSubSection(normalized, subIndex);

    var before = normalized.substring(0, insertPos).replace(/\s+$/g, "");
    var after = normalized.substring(insertPos).replace(/^\n+/g, "");

    return before + "\n" + insertText + "\n\n" + after;
}

function ensureTopTitle(text, title) {
    if (text.indexOf(title) === 0) {
        return text;
    }

    return title + "\n\n" + text.replace(/^\n+/g, "");
}

function insertTodayLogTemplateAfterTitle(text, today) {
    var template = buildTodayLogTemplate(today);
    var firstLineEnd = text.indexOf("\n");

    if (text.indexOf("# LOG") === 0 && firstLineEnd >= 0) {
        var head = text.substring(0, firstLineEnd + 1);
        var rest = text.substring(firstLineEnd + 1).replace(/^\n+/g, "");
        return head + "\n" + template + rest;
    }

    return template + text;
}

function buildTodayLogTemplate(today) {
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
        + "- \n\n"
        + "---\n\n";
}

function ensureSubSection(text, todayHeading, sectionName) {
    var todayStart = text.indexOf(todayHeading);

    if (todayStart < 0) {
        return text;
    }

    var nextDayStart = text.indexOf("\n## ", todayStart + todayHeading.length);
    var todayEnd = nextDayStart >= 0 ? nextDayStart : text.length;
    var todayBlock = text.substring(todayStart, todayEnd);

    var subHeading = "### " + sectionName;
    if (todayBlock.indexOf(subHeading) >= 0) {
        return text;
    }

    var before = text.substring(0, todayEnd).replace(/\s+$/g, "");
    var after = text.substring(todayEnd).replace(/^\n+/g, "");

    return before + "\n\n" + subHeading + "\n- \n\n" + after;
}

function findEndOfSubSection(text, subIndex) {
    var nextSub = text.indexOf("\n### ", subIndex + 1);
    var nextDay = text.indexOf("\n## ", subIndex + 1);

    if (nextSub < 0 && nextDay < 0) {
        return text.length;
    }

    if (nextSub < 0) {
        return nextDay;
    }

    if (nextDay < 0) {
        return nextSub;
    }

    return Math.min(nextSub, nextDay);
}

function appendToEnd(currentText, blockText) {
    currentText = String(currentText || "");
    if (!currentText || currentText.replace(/\s/g, "").length === 0) {
        currentText = "# LOG\n\n";
    }

    return currentText.replace(/\s*$/g, "") + blockText;
}

function moveToLogSection(doc, today, sectionName) {
    try {
        doc.selection.StartOfDocument(false);
        doc.selection.Find("### " + sectionName, meFindNext);
        doc.selection.EndOfLine(false, mePosLogical);
    } catch (e) {
        try {
            doc.selection.StartOfDocument(false);
        } catch (e2) {
        }
    }
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

function trim(str) {
    return String(str).replace(/^\s+|\s+$/g, "");
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
