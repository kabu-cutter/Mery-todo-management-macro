#title = "今日やる統計を表示"

// TASKS.md の今日の「今日やる」だけを集計し、TASKS_STATS.md に表示します。
// TASKS.md 自体は変更しません。

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";
var STATS_PATH = HUB_DIR + "\\TASKS_STATS.md";

main();

function main() {
    try {
        var text = getDocumentOrFileText(TASKS_PATH);
        var date = getTodayDate();
        var section = extractTodaySection(text, date, "今日やる");
        if (!section.found) {
            showMessage("今日の「今日やる」欄が見つかりませんでした。\n\n" + date + " のTASKSを作成してから実行してください。", true);
            return;
        }

        var stats = collectStats(section.lines);
        var report = buildReport(date, stats);
        showTextInSingleTab(STATS_PATH, report);
        showMessage("今日やる統計を更新しました。", false);
    } catch (e) {
        showMessage("今日やる統計を作成できませんでした。\n" + e.message, true);
    }
}

function extractTodaySection(text, date, sectionName) {
    var lines = normalizeNewlines(text).split("\n");
    var inDay = false;
    var inSection = false;
    var found = false;
    var result = [];
    var dayPattern = new RegExp("^##\\s+" + escapeRegExp(date) + "(?:\\s|$)");

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (/^##\s+/.test(line)) {
            if (inDay) break;
            inDay = dayPattern.test(line);
            continue;
        }
        if (!inDay) continue;
        var sectionMatch = line.match(/^###(?!#)\s+(.+?)\s*$/);
        if (sectionMatch) {
            if (inSection) break;
            inSection = trim(sectionMatch[1]) === sectionName;
            if (inSection) found = true;
            continue;
        }
        if (inSection) result.push(line);
    }
    return {found: found, lines: result};
}

function collectStats(lines) {
    var tasks = [];
    var category = "未分類";
    var current = null;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var categoryMatch = line.match(/^####(?!#)\s+(.+?)\s*$/);
        if (categoryMatch) {
            category = trim(categoryMatch[1]) || "未分類";
            current = null;
            continue;
        }
        var taskMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
        if (taskMatch) {
            current = {
                done: taskMatch[1].toLowerCase() === "x",
                category: category,
                text: cleanTaskText(taskMatch[2]),
                source: taskMatch[2]
            };
            tasks.push(current);
            continue;
        }
        if (current && trim(line)) current.source += "\n" + line;
    }

    var categories = {};
    var order = [];
    var completed = 0;
    var scheduled = 0;
    var withMemo = 0;
    var withAsset = 0;
    var withSyncId = 0;
    var names = {};

    for (var j = 0; j < tasks.length; j++) {
        var task = tasks[j];
        if (!categories[task.category]) {
            categories[task.category] = {total: 0, completed: 0};
            order.push(task.category);
        }
        categories[task.category].total++;
        if (task.done) {
            completed++;
            categories[task.category].completed++;
        }
        if (/@(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d(?:\s|$)/.test(task.source)) scheduled++;
        if (/\n\s+\S/.test(task.source) || /(?:メモ|memo)\s*[:：]/i.test(task.source)) withMemo++;
        if (/(?:\[[^\]]+\]\([^\)]+\)|(?:資料|TXT|DOCX|PDF|FILE)\s*[:：])/i.test(task.source)) withAsset++;
        if (/<!--\s*mery-calendar:[a-f0-9]{32}\s*-->/.test(task.source)) withSyncId++;
        var key = normalizeTaskName(task.text);
        if (key) names[key] = (names[key] || 0) + 1;
    }

    var duplicateGroups = 0;
    var duplicateExtras = 0;
    for (var name in names) {
        if (names.hasOwnProperty(name) && names[name] > 1) {
            duplicateGroups++;
            duplicateExtras += names[name] - 1;
        }
    }

    return {
        total: tasks.length,
        completed: completed,
        remaining: tasks.length - completed,
        scheduled: scheduled,
        withMemo: withMemo,
        withAsset: withAsset,
        withSyncId: withSyncId,
        duplicateGroups: duplicateGroups,
        duplicateExtras: duplicateExtras,
        categories: categories,
        categoryOrder: order
    };
}

function buildReport(date, stats) {
    var rate = stats.total ? Math.round(stats.completed * 100 / stats.total) : 0;
    var lines = [];
    lines.push("# 今日やる統計");
    lines.push("");
    lines.push("## " + date);
    lines.push("");
    lines.push("### 全体");
    lines.push("");
    lines.push("- 登録: **" + stats.total + "件**");
    lines.push("- 未完了: **" + stats.remaining + "件**");
    lines.push("- 完了: **" + stats.completed + "件**");
    lines.push("- 完了率: **" + rate + "%** " + progressBar(rate));
    lines.push("- 今日の量: **" + workloadLabel(stats.remaining) + "**");
    lines.push("");
    lines.push("### カテゴリ別");
    lines.push("");
    lines.push("| カテゴリ | 登録 | 未完了 | 完了 | 完了率 |");
    lines.push("|---|---:|---:|---:|---:|");
    if (!stats.categoryOrder.length) {
        lines.push("| （項目なし） | 0 | 0 | 0 | 0% |");
    }
    for (var i = 0; i < stats.categoryOrder.length; i++) {
        var name = stats.categoryOrder[i];
        var item = stats.categories[name];
        var itemRate = item.total ? Math.round(item.completed * 100 / item.total) : 0;
        lines.push("| " + escapeTable(name) + " | " + item.total + " | " + (item.total - item.completed) + " | " + item.completed + " | " + itemRate + "% |");
    }
    lines.push("");
    lines.push("### 整理状況");
    lines.push("");
    lines.push("- 時刻を設定済み: " + stats.scheduled + "件");
    lines.push("- メモあり: " + stats.withMemo + "件");
    lines.push("- 資料リンクあり: " + stats.withAsset + "件");
    lines.push("- カレンダー同期IDあり: " + stats.withSyncId + "件");
    lines.push("- 同名重複の候補: " + stats.duplicateGroups + "組（重複分 " + stats.duplicateExtras + "件）");
    lines.push("- 未分類: " + categoryCount(stats, "未分類") + "件");
    lines.push("");
    lines.push("### 見方");
    lines.push("");
    lines.push("- 件数は今日の `### 今日やる` だけを対象にしています。");
    lines.push("- 同名重複は候補表示です。内容が同じでも別タスクなら、そのままで問題ありません。");
    lines.push("- このレポートを作っても TASKS.md は変更されません。");
    lines.push("");
    return lines.join("\n");
}

function workloadLabel(remaining) {
    if (remaining === 0) return "完了";
    if (remaining <= 3) return "集中しやすい";
    if (remaining <= 7) return "取り組みやすい";
    if (remaining <= 12) return "やや多め";
    return "多め（優先する3〜5件を決めるのがおすすめ）";
}

function progressBar(rate) {
    var filled = Math.round(rate / 10);
    var result = "`";
    for (var i = 0; i < 10; i++) result += i < filled ? "■" : "□";
    return result + "`";
}

function categoryCount(stats, name) {
    return stats.categories[name] ? stats.categories[name].total : 0;
}

function cleanTaskText(text) {
    return trim(String(text || "")
        .replace(/\s*<!--\s*mery-calendar:[a-f0-9]{32}\s*-->/g, "")
        .replace(/\s+@(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d\s*$/, ""));
}

function normalizeTaskName(text) {
    return cleanTaskText(text).toLowerCase().replace(/\s+/g, " ");
}

function escapeTable(text) {
    return String(text || "").replace(/\|/g, "\\|");
}

function getTodayDate() {
    var d = new Date();
    return d.getFullYear() + "-" + zeroPad(d.getMonth() + 1) + "-" + zeroPad(d.getDate());
}

function zeroPad(value) {
    return value < 10 ? "0" + value : String(value);
}

function normalizeNewlines(text) {
    return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trim(text) {
    return String(text || "").replace(/^\s+|\s+$/g, "");
}

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDocumentOrFileText(path) {
    var doc = findOpenDocument(path);
    return doc ? doc.Text : readTextFile(path);
}

function showTextInSingleTab(path, text) {
    var app = getMeryEditor();
    var doc = findOpenDocument(path);
    if (!doc) {
        writeTextFile(path, text);
        app.NewFile();
        doc = app.ActiveDocument;
    }
    doc.Activate();
    doc.Text = text;
    doc.Save(path);
    try { doc.selection.StartOfDocument(false); } catch (e) {}
}

function findOpenDocument(path) {
    var app = getMeryEditor();
    var target = normalizePath(path);
    for (var i = 0; i < app.Documents.Count; i++) {
        var doc = app.Documents.Item(i);
        if (doc.FullName && normalizePath(doc.FullName) === target) return doc;
    }
    return null;
}

function getMeryEditor() {
    if (typeof editor !== "undefined") return editor;
    if (typeof Editor !== "undefined") return Editor;
    throw new Error("Meryのエディターオブジェクトを取得できません。");
}

function normalizePath(path) {
    return new ActiveXObject("Scripting.FileSystemObject").GetAbsolutePathName(path).toLowerCase();
}

function readTextFile(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(path)) throw new Error("TASKS.md が見つかりません: " + path);
    var stream = new ActiveXObject("ADODB.Stream");
    try {
        stream.Type = 2;
        stream.Charset = "utf-8";
        stream.Open();
        stream.LoadFromFile(path);
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

function showMessage(message, isError) {
    new ActiveXObject("WScript.Shell").Popup(String(message), 0, "Mery TODO", isError ? 16 : 64);
}
