#title = "選択範囲を今日のTASKS欄へ追加"

// Mery タスク管理 v0.6.4
// OUTBOX.md / TASKS案.md / PROJECT_TODO.md / COMMAND.md / 普通のメモなど、
// 現在の選択範囲を TASKS.md の今日のセクション内へ追加します。
// v0.6.4: サブ項目の見出しレベル差と二重三重チェック表記を吸収します。
// 標準形式: - [ ] 未完了 / - [x] 完了
// 互換入力: - 項目 / - ✓ 項目 / ✓ 項目 / 済: 項目 / - [ ] 項目 / - [x] 項目

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";

var MENU_TODAY = 1;
var MENU_NEXT = 2;
var MENU_LATER = 3;
var MENU_HOLD = 4;
var MENU_CONFIRM = 5;
var MENU_MEMO = 6;
var MENU_END = 7;

var SKIPPED_DUPLICATES = 0;
var NORMALIZED_CROSS_DUPLICATES = 0;

var STANDARD_TASK_SECTIONS = [
    "今日やる",
    "次にやる",
    "後で",
    "置く",
    "確認が必要",
    "メモ"
];

var SECTION_ALIASES = {
    "今日やる": "今日やる",
    "今日": "今日やる",
    "today": "今日やる",
    "今やる": "今日やる",

    "次にやる": "次にやる",
    "次": "次にやる",
    "next": "次にやる",

    "後で": "後で",
    "あとで": "後で",
    "later": "後で",

    "置く": "置く",
    "保留": "置く",
    "保留中": "置く",
    "park": "置く",

    "確認が必要": "確認が必要",
    "確認": "確認が必要",
    "確認事項": "確認が必要",
    "要確認": "確認が必要",

    "メモ": "メモ",
    "memo": "メモ",
    "notes": "メモ"
};

main();

function main() {
    try {
        var sourceText = getSelectedOrActiveLineText();

        if (!sourceText || sourceText.replace(/\s/g, "").length === 0) {
            alert("TASKS.md に追加するテキストを選択するか、追加したい行にカーソルを置いてください。\n\nOUTBOX.md / TASKS案.md / PROJECT_TODO.md / COMMAND.md など、どこからでも使えます。");
            return;
        }

        var menu = CreatePopupMenu();
        menu.Add("今日やる に追加", MENU_TODAY);
        menu.Add("次にやる に追加", MENU_NEXT);
        menu.Add("後で に追加", MENU_LATER);
        menu.Add("置く に追加", MENU_HOLD);
        menu.Add("確認が必要 に追加", MENU_CONFIRM);
        menu.Add("メモ に追加", MENU_MEMO);
        menu.Add("", 0, meMenuSeparator);
        menu.Add("TASKS.md の末尾に追記", MENU_END);

        var selected = menu.Track(0);
        if (selected === 0) {
            return;
        }

        ensureFolder(HUB_DIR);
        ensureFile(TASKS_PATH, "# TASKS\n\n");

        var tasksDoc = getOrOpenDocument(TASKS_PATH, "# TASKS\n\n");
        tasksDoc.Activate();

        var today = getTodayLabel();
        var currentText = tasksDoc.Text;
        var newText = currentText;
        SKIPPED_DUPLICATES = 0;
        NORMALIZED_CROSS_DUPLICATES = 0;

        if (selected === MENU_END) {
            newText = appendToEnd(currentText, buildEndBlock(sourceText));
        } else {
            var sectionName = getSectionNameByMenu(selected);
            var formattedText = normalizeTaskLinesToCheckbox(sourceText);
            newText = insertIntoTodayTaskSection(currentText, today, sectionName, formattedText);
        }

        var todayHeading = "## " + today + " 今日の作業";
        if (newText.indexOf(todayHeading) >= 0) {
            var normalizedResult = normalizeTodayTasksText(newText, todayHeading);
            newText = normalizedResult.changedText;
            NORMALIZED_CROSS_DUPLICATES = normalizedResult.crossSectionDuplicateCount;
        }

        tasksDoc.Text = newText;
        tasksDoc.Save(TASKS_PATH);

        moveToInsertedSection(tasksDoc, selected, today);

        var message = "TASKS.md に追加しました。";
        if (SKIPPED_DUPLICATES > 0) {
            message += "\n\n同じ欄に既にあったためスキップ: " + SKIPPED_DUPLICATES + "件";
        }
        if (NORMALIZED_CROSS_DUPLICATES > 0) {
            message += "\n今日の全サブ項目横断で整理した重複: " + NORMALIZED_CROSS_DUPLICATES + "件";
        }
        alert(message);

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

    try {
        sel.StartOfLine(false, mePosLogical);
        sel.EndOfLine(true, mePosLogical);
        text = sel.Text;
    } catch (e2) {
        text = "";
    }

    return text;
}

function getSectionNameByMenu(menuId) {
    if (menuId === MENU_TODAY) return "今日やる";
    if (menuId === MENU_NEXT) return "次にやる";
    if (menuId === MENU_LATER) return "後で";
    if (menuId === MENU_HOLD) return "置く";
    if (menuId === MENU_CONFIRM) return "確認が必要";
    if (menuId === MENU_MEMO) return "メモ";
    return "今日やる";
}

function normalizeTaskLinesToCheckbox(text) {
    var normalized = String(text)
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    var lines = normalized.split("\n");
    var out = [];

    for (var i = 0; i < lines.length; i++) {
        var line = trim(lines[i]);

        if (!line) continue;
        if (/^#+\s+/.test(line) || /^---+$/.test(line)) continue;

        var task = parseTaskLine(line);
        if (!task.body) continue;

        out.push((task.done ? "- [x] " : "- [ ] ") + task.body);
    }

    if (out.length === 0) return "- [ ] ";
    return out.join("\n");
}

function insertIntoTodayTaskSection(text, today, sectionName, insertText) {
    var normalized = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    if (!normalized || normalized.replace(/\s/g, "").length === 0) {
        normalized = "# TASKS\n\n";
    }

    normalized = ensureTopTitle(normalized, "# TASKS");

    var todayHeading = "## " + today + " 今日の作業";

    if (normalized.indexOf(todayHeading) < 0) {
        normalized = insertTodayTemplateAfterTitle(normalized, today);
    }

    var sectionInfo = getTodaySectionInfo(normalized, todayHeading);
    var sectionText = getSubsectionText(sectionInfo.block, sectionName);
    var existingKeys = collectTaskKeys(sectionText);

    var filteredText = filterDuplicateInsertLines(insertText, existingKeys);
    if (!filteredText || filteredText.replace(/\s/g, "").length === 0) {
        return normalized;
    }

    normalized = ensureSubSection(normalized, todayHeading, sectionName);

    var subHeading = "### " + sectionName;
    var subIndex = normalized.indexOf(subHeading, normalized.indexOf(todayHeading));
    var insertPos = findEndOfSubSection(normalized, subIndex);

    var before = normalized.substring(0, insertPos).replace(/\s+$/g, "");
    var after = normalized.substring(insertPos).replace(/^\n+/g, "");

    return before + "\n" + filteredText + "\n\n" + after;
}

function normalizeTodayTasksText(text, todayHeading) {
    var normalized = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    var collected = collectSameDayBlocksForReflect(normalized, todayHeading);

    if (collected.blocks.length === 0) {
        return {
            changedText: normalized,
            crossSectionDuplicateCount: 0
        };
    }

    var combinedBlock = todayHeading + "\n\n";

    for (var i = 0; i < collected.blocks.length; i++) {
        combinedBlock += stripMainHeadingForReflect(collected.blocks[i], todayHeading) + "\n\n";
    }

    var blockResult = normalizeTodayBlock(combinedBlock, todayHeading);

    return {
        changedText: collected.before + blockResult.text + collected.after,
        crossSectionDuplicateCount: blockResult.crossSectionDuplicateCount
    };
}

function collectSameDayBlocksForReflect(text, todayHeading) {
    var starts = [];
    var idx = text.indexOf(todayHeading, 0);

    while (idx >= 0) {
        if (idx === 0 || text.charAt(idx - 1) === "\n") {
            starts.push(idx);
        }

        idx = text.indexOf(todayHeading, idx + todayHeading.length);
    }

    if (starts.length === 0) {
        return {
            before: text,
            blocks: [],
            after: ""
        };
    }

    var blocks = [];
    var firstStart = starts[0];
    var lastEnd = firstStart;
    var remaining = "";

    for (var i = 0; i < starts.length; i++) {
        var start = starts[i];
        var end = findNextDatedTaskHeading(text, start + todayHeading.length);

        if (end < 0) {
            end = text.length;
        }

        // 統合対象の間にある別の日付や本文を捨てずに残す。
        remaining += text.substring(lastEnd, start);
        blocks.push(text.substring(start, end));
        lastEnd = end;
    }

    return {
        before: text.substring(0, firstStart),
        blocks: blocks,
        after: remaining + text.substring(lastEnd)
    };
}

function stripMainHeadingForReflect(blockText, todayHeading) {
    var lines = String(blockText || "").split("\n");
    var out = [];

    for (var i = 0; i < lines.length; i++) {
        var line = trim(lines[i]);

        if (!line) {
            continue;
        }

        if (line === todayHeading) {
            continue;
        }

        out.push(lines[i]);
    }

    return out.join("\n");
}

function getTodaySectionInfo(text, todayHeading) {
    var start = text.indexOf(todayHeading);
    var next = findNextDatedTaskHeading(text, start + todayHeading.length);
    var end = next >= 0 ? next : text.length;

    return {
        before: text.substring(0, start),
        block: text.substring(start, end),
        after: text.substring(end)
    };
}

function findNextDatedTaskHeading(text, fromIndex) {
    var re = /\n##\s+[0-9]{4}-[0-9]{2}-[0-9]{2}\s+\(.+?\)\s+今日の作業/g;
    re.lastIndex = fromIndex;
    var match = re.exec(text);
    return match ? match.index : -1;
}

function normalizeTodayBlock(blockText, fallbackHeading) {
    var lines = String(blockText || "").split("\n");
    var heading = "";
    var sections = {};
    var order = [];
    var current = "";

    for (var i = 0; i < STANDARD_TASK_SECTIONS.length; i++) {
        sections[STANDARD_TASK_SECTIONS[i]] = { lines: [], keys: {} };
        order.push(STANDARD_TASK_SECTIONS[i]);
    }

    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        var raw = lines[lineIndex];
        var line = trim(raw);

        if (!line) continue;
        if (/^---+$/.test(line)) continue;

        var headingInfo = parseHeadingLine(line);

        if (headingInfo.isHeading) {
            if (isTodayMainHeading(line)) {
                if (!heading) heading = line;
                continue;
            }

            var sectionName = normalizeSubsectionName(headingInfo.title);
            if (sectionName) {
                current = sectionName;
                continue;
            }

            current = "メモ";
            continue;
        }

        if (!current) current = "メモ";
        if (!sections[current]) {
            sections[current] = { lines: [], keys: {} };
            order.push(current);
        }

        var item = normalizeTaskDisplayLine(line);
        if (!item) continue;

        var key = makeTaskKey(item);
        if (!key) continue;

        var old = sections[current].keys[key];
        if (old) {
            if (isDoneLine(item) && !isDoneLine(old.line)) {
                sections[current].lines[old.index] = item;
                old.line = item;
            }
            continue;
        }

        sections[current].keys[key] = { index: sections[current].lines.length, line: item };
        sections[current].lines.push(item);
    }

    var crossResult = dedupeAcrossSubsections(sections, order);

    if (!heading) heading = fallbackHeading;

    var output = heading + "\n\n";
    for (var outIndex = 0; outIndex < order.length; outIndex++) {
        var name = order[outIndex];
        var sec = sections[name];

        output += "### " + name + "\n";
        if (!sec || sec.lines.length === 0) {
            output += "- [ ] \n\n";
        } else {
            output += sec.lines.join("\n") + "\n\n";
        }
    }
    output += "---";

    return {
        text: output,
        crossSectionDuplicateCount: crossResult.crossSectionDuplicateCount
    };
}

function parseHeadingLine(line) {
    var match = trim(line).match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) return { isHeading: false, level: 0, title: "" };
    return { isHeading: true, level: match[1].length, title: trim(match[2]) };
}

function isTodayMainHeading(line) {
    return /^##\s+[0-9]{4}-[0-9]{2}-[0-9]{2}\s+\(.+?\)\s+今日の作業\s*$/.test(trim(line));
}

function normalizeSubsectionName(title) {
    title = trim(title);
    title = title.replace(/^[0-9]+[.)]\s*/, "");
    title = title.replace(/^[-*]\s*/, "");
    title = trim(title);

    var lower = title.toLowerCase();

    if (SECTION_ALIASES[title]) return SECTION_ALIASES[title];
    if (SECTION_ALIASES[lower]) return SECTION_ALIASES[lower];

    return "";
}

function dedupeAcrossSubsections(sections, order) {
    var global = {};
    var count = 0;

    for (var s = 0; s < order.length; s++) {
        var name = order[s];
        var sec = sections[name];
        if (!sec) continue;

        for (var i = 0; i < sec.lines.length; i++) {
            var line = sec.lines[i];
            var key = makeTaskKey(line);
            if (!key) continue;
            if (!global[key]) global[key] = [];
            global[key].push({ sectionName: name, sectionIndex: s, lineIndex: i, line: line });
        }
    }

    var keepMap = {};
    for (var key in global) {
        var entries = global[key];
        if (entries.length <= 1) continue;
        keepMap[key] = chooseEntryToKeep(entries);
        count += entries.length - 1;
    }

    for (var s2 = 0; s2 < order.length; s2++) {
        var name2 = order[s2];
        var sec2 = sections[name2];
        if (!sec2) continue;

        var newLines = [];
        for (var j = 0; j < sec2.lines.length; j++) {
            var line2 = sec2.lines[j];
            var key2 = makeTaskKey(line2);

            if (!key2 || !keepMap[key2]) {
                newLines.push(line2);
                continue;
            }

            var keep = keepMap[key2];
            if (keep.sectionName === name2 && keep.lineIndex === j) {
                var body = parseTaskLine(line2).body;
                newLines.push(hasAnyDone(global[key2]) ? "- [x] " + body : "- [ ] " + body);
            }
        }
        sec2.lines = newLines;
    }

    return { crossSectionDuplicateCount: count };
}

function chooseEntryToKeep(entries) {
    var best = entries[0];

    for (var i = 1; i < entries.length; i++) {
        var entry = entries[i];

        if (entry.sectionIndex < best.sectionIndex) {
            best = entry;
            continue;
        }

        if (entry.sectionIndex === best.sectionIndex && isDoneLine(entry.line) && !isDoneLine(best.line)) {
            best = entry;
        }
    }

    return best;
}

function hasAnyDone(entries) {
    for (var i = 0; i < entries.length; i++) {
        if (isDoneLine(entries[i].line)) return true;
    }
    return false;
}

function getSubsectionText(todayBlock, sectionName) {
    var lines = String(todayBlock || "").split("\n");
    var current = "";
    var collected = [];

    for (var i = 0; i < lines.length; i++) {
        var line = trim(lines[i]);
        var headingInfo = parseHeadingLine(line);

        if (headingInfo.isHeading) {
            var normalized = normalizeSubsectionName(headingInfo.title);
            if (normalized) {
                current = normalized;
                continue;
            }
        }

        if (current === sectionName) {
            collected.push(lines[i]);
        }
    }

    return collected.join("\n");
}

function collectTaskKeys(text) {
    var keys = {};
    var lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

    for (var i = 0; i < lines.length; i++) {
        var key = makeTaskKey(lines[i]);
        if (key) keys[key] = true;
    }
    return keys;
}

function filterDuplicateInsertLines(insertText, existingKeys) {
    var lines = String(insertText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var out = {};
    var result = [];

    for (var i = 0; i < lines.length; i++) {
        var line = trim(lines[i]);
        if (!line) continue;

        var key = makeTaskKey(line);
        if (!key) continue;

        if (existingKeys[key] || out[key]) {
            SKIPPED_DUPLICATES++;
            continue;
        }

        out[key] = true;
        result.push(line);
    }

    return result.join("\n");
}

function normalizeTaskDisplayLine(line) {
    var task = parseTaskLine(line);
    if (!task.body) return "";
    return (task.done ? "- [x] " : "- [ ] ") + task.body;
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

function makeTaskKey(line) {
    var task = parseTaskLine(line);
    var body = trim(task.body);
    if (!body) return "";
    return body.replace(/\s+/g, " ").toLowerCase();
}

function isDoneLine(line) {
    return parseTaskLine(line).done;
}

function ensureTopTitle(text, title) {
    if (text.indexOf(title) === 0) return text;
    return title + "\n\n" + text.replace(/^\n+/g, "");
}

function insertTodayTemplateAfterTitle(text, today) {
    var template = buildTodayTemplate(today);
    var firstLineEnd = text.indexOf("\n");

    if (text.indexOf("# TASKS") === 0 && firstLineEnd >= 0) {
        var head = text.substring(0, firstLineEnd + 1);
        var rest = text.substring(firstLineEnd + 1).replace(/^\n+/g, "");
        return head + "\n" + template + rest;
    }

    return template + text;
}

function buildTodayTemplate(today) {
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

function ensureSubSection(text, todayHeading, sectionName) {
    var info = getTodaySectionInfo(text, todayHeading);
    if (normalizeSubsectionName(sectionName) && getSubsectionText(info.block, sectionName)) return text;

    var insert = "\n\n### " + sectionName + "\n- [ ] \n";
    return info.before + info.block.replace(/\s*---\s*$/g, "") + insert + "\n---" + info.after;
}

function findEndOfSubSection(text, subIndex) {
    var nextSub = findNextSubHeading(text, subIndex + 1);
    var nextDay = findNextDatedTaskHeading(text, subIndex + 1);

    if (nextSub < 0 && nextDay < 0) return text.length;
    if (nextSub < 0) return nextDay;
    if (nextDay < 0) return nextSub;
    return Math.min(nextSub, nextDay);
}

function findNextSubHeading(text, fromIndex) {
    var re = /\n#{2,6}\s+(.+?)\s*$/gm;
    re.lastIndex = fromIndex;

    var match;
    while ((match = re.exec(text)) !== null) {
        if (normalizeSubsectionName(match[1])) {
            return match.index;
        }
    }

    return -1;
}

function buildEndBlock(text) {
    var today = getTodayLabel();
    return "\n\n## " + today + " 選択範囲反映\n\n" + normalizeTaskLinesToCheckbox(text) + "\n\n---\n";
}

function appendToEnd(currentText, blockText) {
    currentText = String(currentText || "");
    if (!currentText || currentText.replace(/\s/g, "").length === 0) currentText = "# TASKS\n\n";
    return currentText.replace(/\s*$/g, "") + blockText;
}

function moveToInsertedSection(doc, selected, today) {
    try {
        doc.selection.StartOfDocument(false);
        var keyword = selected === MENU_END ? "## " + today + " 選択範囲反映" : "### " + getSectionNameByMenu(selected);
        doc.selection.Find(keyword, meFindNext);
        doc.selection.EndOfLine(false, mePosLogical);
    } catch (e) {
        try { doc.selection.StartOfDocument(false); } catch (e2) {}
    }
}

function getOrOpenDocument(path, defaultText) {
    var d = findOpenDocumentByFullName(path);
    if (d) return d;

    var existingText = readTextFile(path);
    if (!existingText || String(existingText).replace(/\s/g, "").length === 0) existingText = defaultText;

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
    if (!fso.FolderExists(path)) fso.CreateFolder(path);
}

function ensureFile(path, defaultText) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(path)) writeTextFile(path, defaultText);
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
        if (!d.FullName) continue;
        if (normalizePath(d.FullName) === target) return d;
    }

    return null;
}
