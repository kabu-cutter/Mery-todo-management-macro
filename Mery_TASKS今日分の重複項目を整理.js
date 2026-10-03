#title = "TASKS今日分の重複項目を整理"

// Mery タスク管理 v0.6.4
// TASKS.md の今日のセクション内で、同じ日付ブロック・同名小見出し・重複項目を整理します。
// v0.6.4: サブ項目の見出しレベル差と二重三重チェック表記を吸収します。
// 例: ## 今日やる / ### 今日やる / #### 今日やる を同じ「今日やる」として扱います。
// 標準形式: - [ ] 未完了 / - [x] 完了
// 互換入力: - 項目 / - ✓ 項目 / ✓ 項目 / 済: 項目

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";

var STANDARD_SUBSECTIONS = [
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
        ensureFolder(HUB_DIR);
        ensureFile(TASKS_PATH, "# TASKS\n\n");

        var tasksDoc = getOrOpenDocument(TASKS_PATH, "# TASKS\n\n");
        tasksDoc.Activate();

        var originalText = tasksDoc.Text;
        var today = getTodayLabel();
        var todayHeading = "## " + today + " 今日の作業";

        if (originalText.indexOf(todayHeading) < 0) {
            alert("今日のTASKSセクションが見つかりませんでした。");
            return;
        }

        var result = normalizeTodayTasks(originalText, todayHeading);

        if (
            result.mergedHeadingCount === 0
            && result.removedDuplicateCount === 0
            && result.crossSectionDuplicateCount === 0
            && result.headingLevelFixedCount === 0
            && result.changedText === originalText
        ) {
            alert("今日のTASKS内に、同名見出し・見出しレベル差・重複した日付ブロック・重複項目は見つかりませんでした。");
            return;
        }

        if (!Confirm(
            "今日のTASKSを整理します。\n\n"
            + "統合する同名見出し: " + result.mergedHeadingCount + "件\n"
            + "補正する見出しレベル差: " + result.headingLevelFixedCount + "件\n"
            + "削除する同一欄内の重複: " + result.removedDuplicateCount + "件\n"
            + "削除するサブ項目横断の重複: " + result.crossSectionDuplicateCount + "件\n"
            + "形式は - [ ] / - [x] に正規化します。\n"
            + "実行前にバックアップを作成します。\n\n"
            + "実行しますか？"
        )) {
            return;
        }

        var backupPath = createBackup(originalText);

        tasksDoc.Text = result.changedText;
        tasksDoc.Save(TASKS_PATH);

        try {
            tasksDoc.selection.StartOfDocument(false);
            tasksDoc.selection.Find(todayHeading, meFindNext);
        } catch (e) {
        }

        alert(
            "TASKS.md の今日分を整理しました。\n\n"
            + "統合した同名見出し: " + result.mergedHeadingCount + "件\n"
            + "補正した見出しレベル差: " + result.headingLevelFixedCount + "件\n"
            + "削除した同一欄内の重複: " + result.removedDuplicateCount + "件\n"
            + "削除したサブ項目横断の重複: " + result.crossSectionDuplicateCount + "件\n"
            + "バックアップ:\n" + backupPath
        );

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function normalizeTodayTasks(text, todayHeading) {
    var normalized = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    var collected = collectSameDayBlocks(normalized, todayHeading);

    if (collected.blocks.length === 0) {
        return {
            changedText: normalized,
            mergedHeadingCount: 0,
            removedDuplicateCount: 0,
            crossSectionDuplicateCount: 0,
            headingLevelFixedCount: 0
        };
    }

    var combinedBlock = todayHeading + "\n\n";

    for (var i = 0; i < collected.blocks.length; i++) {
        combinedBlock += stripMainHeading(collected.blocks[i], todayHeading) + "\n\n";
    }

    var blockResult = normalizeTodayBlock(combinedBlock, todayHeading);

    return {
        changedText: collected.before + blockResult.text + collected.after,
        mergedHeadingCount: blockResult.mergedHeadingCount,
        removedDuplicateCount: blockResult.removedDuplicateCount,
        crossSectionDuplicateCount: blockResult.crossSectionDuplicateCount,
        headingLevelFixedCount: blockResult.headingLevelFixedCount
    };
}

function collectSameDayBlocks(text, todayHeading) {
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

function stripMainHeading(blockText, todayHeading) {
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

function findNextDatedTaskHeading(text, fromIndex) {
    var re = /\n##\s+[0-9]{4}-[0-9]{2}-[0-9]{2}\s+\(.+?\)\s+今日の作業/g;
    re.lastIndex = fromIndex;
    var match = re.exec(text);
    return match ? match.index : -1;
}

function normalizeTodayBlock(blockText, fallbackHeading) {
    var lines = String(blockText || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n");

    var heading = "";
    var sections = {};
    var sectionOrder = [];
    var current = "";
    var mergedHeadingCount = 0;
    var removedDuplicateCount = 0;
    var headingLevelFixedCount = 0;

    for (var i = 0; i < STANDARD_SUBSECTIONS.length; i++) {
        sections[STANDARD_SUBSECTIONS[i]] = {
            lines: [],
            keys: {},
            seenHeading: false
        };
        sectionOrder.push(STANDARD_SUBSECTIONS[i]);
    }

    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        var raw = lines[lineIndex];
        var line = trim(raw);

        if (!line) {
            continue;
        }

        if (/^---+$/.test(line)) {
            continue;
        }

        var headingInfo = parseHeadingLine(line);

        if (headingInfo.isHeading) {
            if (isTodayMainHeading(line)) {
                if (!heading) {
                    heading = line;
                }
                continue;
            }

            var sectionName = normalizeSubsectionName(headingInfo.title);

            if (sectionName) {
                current = sectionName;

                if (headingInfo.level !== 3) {
                    headingLevelFixedCount++;
                }

                if (sections[current].seenHeading) {
                    mergedHeadingCount++;
                }

                sections[current].seenHeading = true;
                continue;
            }

            // 未知の見出しは項目として扱わず、メモ欄の文脈に寄せる。
            current = "メモ";
            continue;
        }

        if (!current) {
            current = "メモ";
        }

        if (!sections[current]) {
            sections[current] = {
                lines: [],
                keys: {},
                seenHeading: true
            };
            sectionOrder.push(current);
        }

        var item = normalizeTaskDisplayLine(line);

        if (!item) {
            continue;
        }

        var key = makeTaskKey(item);

        if (!key) {
            continue;
        }

        var old = sections[current].keys[key];

        if (old) {
            if (isDoneLine(item) && !isDoneLine(old.line)) {
                sections[current].lines[old.index] = item;
                old.line = item;
            }
            removedDuplicateCount++;
            continue;
        }

        sections[current].keys[key] = {
            index: sections[current].lines.length,
            line: item
        };
        sections[current].lines.push(item);
    }

    var crossResult = dedupeAcrossSubsections(sections, sectionOrder);

    if (!heading) {
        heading = fallbackHeading || ("## " + getTodayLabel() + " 今日の作業");
    }

    var output = heading + "\n\n";

    for (var outIndex = 0; outIndex < sectionOrder.length; outIndex++) {
        var name = sectionOrder[outIndex];
        var sec = sections[name];

        output += "### " + name + "\n";

        if (!sec || sec.lines.length === 0) {
            output += "- [ ] \n\n";
        } else {
            output += sec.lines.join("\n") + "\n\n";
        }
    }

    output += "---\n";

    return {
        text: output,
        mergedHeadingCount: mergedHeadingCount,
        removedDuplicateCount: removedDuplicateCount,
        crossSectionDuplicateCount: crossResult.crossSectionDuplicateCount,
        headingLevelFixedCount: headingLevelFixedCount
    };
}

function parseHeadingLine(line) {
    var match = trim(line).match(/^(#{1,6})\s+(.+?)\s*$/);

    if (!match) {
        return {
            isHeading: false,
            level: 0,
            title: ""
        };
    }

    return {
        isHeading: true,
        level: match[1].length,
        title: trim(match[2])
    };
}

function isTodayMainHeading(line) {
    return /^##\s+[0-9]{4}-[0-9]{2}-[0-9]{2}\s+\(.+?\)\s+今日の作業\s*$/.test(trim(line));
}

function normalizeSubsectionName(title) {
    title = trim(title);

    // AI出力由来の番号や記号を軽く外す。
    title = title.replace(/^[0-9]+[.)]\s*/, "");
    title = title.replace(/^[-*]\s*/, "");
    title = trim(title);

    var lower = title.toLowerCase();

    if (SECTION_ALIASES[title]) {
        return SECTION_ALIASES[title];
    }

    if (SECTION_ALIASES[lower]) {
        return SECTION_ALIASES[lower];
    }

    return "";
}

function dedupeAcrossSubsections(sections, sectionOrder) {
    var global = {};
    var crossSectionDuplicateCount = 0;

    for (var s = 0; s < sectionOrder.length; s++) {
        var sectionName = sectionOrder[s];
        var sec = sections[sectionName];

        if (!sec) {
            continue;
        }

        for (var i = 0; i < sec.lines.length; i++) {
            var line = sec.lines[i];
            var key = makeTaskKey(line);

            if (!key) {
                continue;
            }

            if (!global[key]) {
                global[key] = [];
            }

            global[key].push({
                sectionName: sectionName,
                sectionIndex: s,
                lineIndex: i,
                line: line
            });
        }
    }

    var keepMap = {};

    for (var key in global) {
        var entries = global[key];

        if (entries.length <= 1) {
            continue;
        }

        var keep = chooseEntryToKeep(entries);

        keepMap[key] = keep;
        crossSectionDuplicateCount += entries.length - 1;
    }

    for (var s2 = 0; s2 < sectionOrder.length; s2++) {
        var name2 = sectionOrder[s2];
        var sec2 = sections[name2];

        if (!sec2) {
            continue;
        }

        var newLines = [];

        for (var j = 0; j < sec2.lines.length; j++) {
            var line2 = sec2.lines[j];
            var key2 = makeTaskKey(line2);

            if (!key2 || !keepMap[key2]) {
                newLines.push(line2);
                continue;
            }

            var keepEntry = keepMap[key2];

            if (keepEntry.sectionName === name2 && keepEntry.lineIndex === j) {
                var body = parseTaskLine(line2).body;
                if (hasAnyDone(global[key2])) {
                    newLines.push("- [x] " + body);
                } else {
                    newLines.push("- [ ] " + body);
                }
            }
        }

        sec2.lines = newLines;
    }

    return {
        crossSectionDuplicateCount: crossSectionDuplicateCount
    };
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
        if (isDoneLine(entries[i].line)) {
            return true;
        }
    }

    return false;
}

function normalizeTaskDisplayLine(line) {
    var task = parseTaskLine(line);

    if (!task.body) {
        return "";
    }

    if (task.done) {
        return "- [x] " + task.body;
    }

    return "- [ ] " + task.body;
}

function makeTaskKey(line) {
    var task = parseTaskLine(line);
    var body = trim(task.body);

    if (!body) {
        return "";
    }

    body = body.replace(/\s+/g, " ");
    return body.toLowerCase();
}

function isDoneLine(line) {
    var task = parseTaskLine(line);
    return task.done;
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

function createBackup(text) {
    var backupPath = HUB_DIR + "\\TASKS_backup_" + getTimestampForFile() + ".md";
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
