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

        var copied = copyPreviousDayTasks(currentText, today);
        var template = buildStartTemplate(today, copied);
        var newText = insertTemplate(currentText, template);

        targetDoc.Text = newText;
        targetDoc.Save(TASKS_PATH);

        targetDoc.selection.StartOfDocument(false);
        alert(copied.count
            ? "今日の開始テンプレートを TASKS.md に挿入しました。\n"
                + copied.count + " 件の未完了TODOを " + copied.sourceDate + " から引き継ぎました。\n"
                + "時刻と同期IDは今日の複製から除き、元の日付のTODOには残しています。"
            : "今日の開始テンプレートを TASKS.md に挿入しました。\n引き継ぐ未完了TODOはありませんでした。");

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function buildStartTemplate(today, copied) {
    var sections = ["今日やる", "次にやる", "後で", "置く", "確認が必要", "メモ"];
    var copiedSections = copied && copied.sections ? copied.sections : {};
    var result = "## " + today + " 今日の作業\n\n";
    for (var i = 0; i < sections.length; i++) {
        var name = sections[i];
        result += "### " + name + "\n";
        result += copiedSections[name] || "- [ ] \n";
        result += "\n";
    }
    // 前日側にあるカスタム欄も、TODOがある場合は引き継ぐ。
    if (copied && copied.extraSections) {
        for (var j = 0; j < copied.extraSections.length; j++) {
            result += copied.extraSections[j] + "\n";
        }
    }
    return result + "---\n\n";
}

function copyPreviousDayTasks(text, today) {
    var normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var lines = normalized.split("\n");
    var todayDate = String(today).substring(0, 10);
    var sourceStart = -1;
    var sourceDate = "";
    for (var i = 0; i < lines.length; i++) {
        var heading = lines[i].match(/^##\s+(\d{4}-\d{2}-\d{2})(?:\s+\([^)]*\))?\s+今日の作業\s*$/);
        if (heading && heading[1] < todayDate && heading[1] >= sourceDate) {
            sourceDate = heading[1];
            sourceStart = i;
        }
    }
    if (sourceStart < 0) return { sections: {}, extraSections: [], sourceDate: "", count: 0 };

    var sourceEnd = lines.length;
    for (var end = sourceStart + 1; end < lines.length; end++) {
        if (/^##\s/.test(lines[end])) { sourceEnd = end; break; }
    }
    var sections = {};
    var extraSections = [];
    var currentSection = "";
    var currentCategory = "";
    var count = 0;
    var pending = [];
    var pendingDone = false;

    function flushTask() {
        if (!pending.length) return;
        while (pending.length && !pending[pending.length - 1].trim()) pending.pop();
        if (!pendingDone && pending.length) {
            if (!sections[currentSection]) sections[currentSection] = "";
            var output = sections[currentSection];
            if (currentCategory && output.indexOf("#### " + currentCategory + "\n") < 0) {
                output += "#### " + currentCategory + "\n";
            }
            output += pending.join("\n") + "\n";
            sections[currentSection] = output;
            count++;
        }
        pending = [];
    }

    for (var lineIndex = sourceStart + 1; lineIndex < sourceEnd; lineIndex++) {
        var line = lines[lineIndex];
        var sectionMatch = line.match(/^###\s+(.+?)\s*$/);
        var categoryMatch = line.match(/^####(?!#)\s*(.+?)\s*$/);
        if (sectionMatch || categoryMatch || /^---+\s*$/.test(line)) {
            flushTask();
            if (sectionMatch) { currentSection = sectionMatch[1]; currentCategory = ""; }
            else if (categoryMatch) currentCategory = categoryMatch[1];
            continue;
        }
        if (/^[-*]\s+\[[ xX]\]/.test(line)) {
            flushTask();
            pendingDone = /^[-*]\s+\[[xX]\]/.test(line);
            if (!pendingDone) {
                var cleaned = line.replace(/^([-*]\s+)\[[ xX]\]\s*/, "$1[ ] ");
                cleaned = cleaned.replace(/\s*<!--\s*mery-calendar:[a-f0-9]+\s*-->/ig, "")
                    .replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M(?:\s*[-–—]\s*\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)?(?=\s*(?:<!--\s*mery-due:[^>]*-->\s*)?$)/i, "")
                    .replace(/\s+@(?:[01]\d|2[0-3]):[0-5]\d(?:-(?:[01]\d|2[0-3]):[0-5]\d)?\s*$/, "");
                pending.push(cleaned);
            }
            continue;
        }
        if (pending.length) pending.push(line);
    }
    flushTask();

    // Section with no source tasks remains a normal empty slot in today's template.
    for (var name in sections) {
        if (Object.prototype.hasOwnProperty.call(sections, name)) {
            sections[name] = sections[name].replace(/\n+$/, "\n");
        }
    }
    // Preserve custom ### sections instead of dropping their tasks.
    for (var sectionName in sections) {
        if (Object.prototype.hasOwnProperty.call(sections, sectionName)
            && ["今日やる", "次にやる", "後で", "置く", "確認が必要", "メモ"].indexOf(sectionName) < 0) {
            extraSections.push("### " + sectionName + "\n" + sections[sectionName]);
            delete sections[sectionName];
        }
    }
    return { sections: sections, extraSections: extraSections, sourceDate: sourceDate, count: count };
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
