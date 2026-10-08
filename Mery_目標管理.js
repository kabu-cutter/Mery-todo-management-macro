#title = "Mery 目標管理"

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var GOALS_PATH = HUB_DIR + "\\GOALS.md";

main();

function main() {
    try {
        var menu = CreatePopupMenu();
        menu.Add("目標を順番に作成（複数可）", 6);
        menu.Add("目標ファイルを開く / 作成", 1);
        menu.Add("年間目標を追加", 2);
        menu.Add("選択した目標の下に追加", 3);
        menu.Add("このTODOに期限日・任意時刻を設定", 4);
        menu.Add("このTODOの期限日・時刻を解除", 5);
        menu.Add("MeryTODO CalDAV同期（プレビュー・反映）", 7);
        var choice = menu.Track(0);
        if (!choice) return;
        if (choice === 6) return createGoalChain();
        if (choice === 1) return openGoalsDocument();
        if (choice === 2) return addAnnualGoal();
        if (choice === 3) return addChildGoal();
        if (choice === 4) return setCurrentTaskSchedule(false);
        if (choice === 5) return setCurrentTaskSchedule(true);
        if (choice === 7) return syncGoalsCalDav();
    } catch (e) {
        alert("目標管理: " + e.message);
    }
}

function createGoalChain() {
    try {
        var doc = openGoals();
        if (!doc.Saved) throw new Error("GOALS.md に未保存の変更があります。保存してから実行してください。");
        var year = goalPromptUntilValid("対象年（YYYY）", String(new Date().getFullYear()), function (value) {
            if (!/^\d{4}$/.test(goalTrim(value))) throw new Error("年は YYYY 形式で入力してください。");
        });
        if (year === null) return;
        var groups = [];
        var addAnnual = true;
        while (addAnnual) {
            var annual = goalPromptUntilValid("年間目標", "", goalValidateTitle);
            if (annual === null) return;
            var group = { title: annual, months: [] };
            var addMonth = true;
            while (addMonth) {
                var monthPeriod = goalPromptUntilValid("対象月（YYYY-MM）", goalCurrentMonth(), function (value) {
                    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(goalTrim(value))) throw new Error("対象月は YYYY-MM 形式で入力してください。");
                });
                if (monthPeriod === null) return;
                var month = goalPromptUntilValid("月目標", "", goalValidateTitle);
                if (month === null) return;
                var monthGroup = { period: monthPeriod, title: month, weeks: [] };
                var addWeek = true;
                while (addWeek) {
                    var weekPeriod = goalPromptUntilValid("対象週（ISO形式 YYYY-Www）", goalCurrentWeek(), function (value) {
                        if (!goalValidIsoWeek(goalTrim(value).toUpperCase())) throw new Error("対象週は実在する ISO 週を YYYY-Www 形式で入力してください。");
                    });
                    if (weekPeriod === null) return;
                    var week = goalPromptUntilValid("週目標", "", goalValidateTitle);
                    if (week === null) return;
                    var weekGroup = { period: weekPeriod, title: week, tasks: [] };
                    var addTask = true;
                    while (addTask) {
                        var task = goalPromptUntilValid("行動TODO", "", goalValidateTitle);
                        if (task === null) return;
                        var due = goalPromptUntilValid("TODOの期限日（YYYY-MM-DD、任意）", "", function (value) {
                            value = goalTrim(value);
                            if (value) goalValidateDate(value);
                        });
                        if (due === null) return;
                        var time = goalPromptUntilValid("時間帯（HH:MM-HH:MM、任意。日付だけなら空欄）", "", function (value) {
                            value = goalTrim(value);
                            if (value) {
                                goalValidateTime(value);
                                if (!goalTrim(due)) throw new Error("時間帯を設定する場合は期限日も入力してください。");
                            }
                        });
                        if (time === null) return;
                        weekGroup.tasks.push({ title: task, due: due, time: time });
                        addTask = goalAskAddAnother("TODO");
                        if (addTask === null) return;
                    }
                    monthGroup.weeks.push(weekGroup);
                    addWeek = goalAskAddAnother("週目標");
                    if (addWeek === null) return;
                }
                group.months.push(monthGroup);
                addMonth = goalAskAddAnother("月目標");
                if (addMonth === null) return;
            }
            groups.push(group);
            addAnnual = goalAskAddAnother("年間目標");
            if (addAnnual === null) return;
        }
        var updated = goalBuildWizardText(doc.Text, year, groups);
        saveGoalDocument(doc, updated);
        doc.Activate();
        alert("目標とTODOを追加しました。\n同じ親の下に複数項目を作成できます。期限日と時間帯は任意です。");
    } catch (e) {
        alert("目標を作成できませんでした。\n" + e.message);
    }
}

function goalAskAddAnother(itemName) {
    var answer = goalPromptUntilValid("同じ親の下に別の" + itemName + "も追加しますか？（はい / いいえ）", "いいえ", function (value) {
        value = goalTrim(value).toLowerCase();
        if (value !== "はい" && value !== "いいえ" && value !== "y" && value !== "n" && value !== "yes" && value !== "no") {
            throw new Error("「はい」または「いいえ」で入力してください。");
        }
    });
    if (answer === null) return null;
    answer = goalTrim(answer).toLowerCase();
    return answer === "はい" || answer === "y" || answer === "yes";
}

function goalPromptUntilValid(message, initial, validate) {
    while (true) {
        var value = prompt(message, initial);
        if (value === null) return null;
        try {
            validate(value);
            return value;
        } catch (e) {
            alert(e.message);
        }
    }
}

function goalValidateTitle(value) {
    value = goalTrim(value);
    if (!value || /[\r\n]/.test(value)) throw new Error("内容を1行で入力してください。");
}

function openGoalsDocument() {
    try {
        var doc = openGoals();
        doc.Activate();
    } catch (e) {
        alert("目標ファイルを開けませんでした。\n" + e.message);
    }
}

function syncGoalsCalDav() {
    try {
        var doc = openGoals();
        if (!doc.Saved) throw new Error("GOALS.md に未保存の変更があります。保存してから同期してください。");
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var macro = fso.BuildPath(fso.GetParentFolderName(ScriptFullName), "Mery_Thunderbirdと同期.js");
        if (!fso.FileExists(macro)) throw new Error("Thunderbird同期マクロが見つかりません: " + macro);
        editor.ExecuteMacro(macro);
    } catch (e) {
        alert("MeryTODO CalDAV同期を開始できませんでした。\n" + e.message);
    }
}

function addAnnualGoal() {
    try {
        var doc = openGoals();
        var year = prompt("対象年（YYYY）", String(new Date().getFullYear()));
        if (year === null) return;
        var title = prompt("年間目標", "");
        if (title === null || !goalTrim(title)) return;
        var updated = goalInsertAnnualGoal(doc.Text, year, title);
        saveGoalDocument(doc, updated);
        doc.Activate();
        alert(year + "年の年間目標を追加しました。\n月目標は目標行にカーソルを置いて「選択した目標の下に追加」を使います。");
    } catch (e) {
        alert("年間目標を追加できませんでした。\n" + e.message);
    }
}

function addChildGoal() {
    try {
        var doc = editor.ActiveDocument;
        if (!doc || !doc.FullName || goalFileName(doc.FullName) !== "goals.md") {
            openGoals();
            alert("GOALS.md を開きました。親となる目標行にカーソルを置いて、もう一度実行してください。");
            return;
        }
        if (!doc.Saved) throw new Error("GOALS.md に未保存の変更があります。保存してから実行してください。");
        var parentLine = goalCurrentLine(doc);
        var parent = goalParseParent(parentLine);
        var title = prompt("追加する" + parent.childName + "の内容", "");
        if (title === null || !goalTrim(title)) return;
        var period = "";
        var due = "";
        var time = "";
        if (parent.kind === "month") {
            period = prompt("対象月（YYYY-MM）", goalCurrentMonth());
            if (period === null) return;
        } else if (parent.kind === "week") {
            period = prompt("対象週（ISO形式 YYYY-Www）", goalCurrentWeek());
            if (period === null) return;
        } else if (parent.kind === "task") {
            due = prompt("期限日（YYYY-MM-DD、任意）", "");
            if (due === null) return;
            time = prompt("時間帯（HH:MM-HH:MM、任意。空欄なら日付のみ）", "");
            if (time === null) return;
        }
        var childLine = goalBuildChildLine(parentLine, title, period, due, time);
        var updated = goalInsertChildAfter(doc.Text, parentLine, childLine);
        saveGoalDocument(doc, updated);
        doc.Activate();
        alert(parent.childName + "を追加しました。");
    } catch (e) {
        alert("子目標 / TODO を追加できませんでした。\n" + e.message);
    }
}

function setCurrentTaskSchedule(clear) {
    try {
        var doc = editor.ActiveDocument;
        if (!doc || !doc.FullName) throw new Error("保存済みのMarkdown文書を開いてください。");
        var name = goalFileName(doc.FullName);
        if (name === "tasks.md" || name === "log.md") throw new Error("TASKS.md と LOG.md の日付は見出しで管理します。この機能は GOALS.md / TODO.md などで使ってください。");
        if (!/\.md$/i.test(doc.FullName)) throw new Error("Markdown文書で実行してください。");
        if (!doc.Saved) throw new Error("文書に未保存の変更があります。保存してから実行してください。");
        var line = goalCurrentLine(doc);
        var schedule = goalReadSchedule(line);
        var date = "";
        var time = "";
        if (!clear) {
            date = prompt("期限日（YYYY-MM-DD、空欄で日付なし）", schedule.date);
            if (date === null) return;
            time = prompt("時間帯（HH:MM-HH:MM、任意。空欄なら日付のみ）", schedule.time);
            if (time === null) return;
        }
        var updatedLine = goalSetTaskSchedule(line, date, time);
        if (updatedLine === line) {
            alert("期限日・時刻に変更はありません。");
            return;
        }
        var updatedText = goalReplaceCurrentLine(doc.Text, line, updatedLine);
        saveGoalDocument(doc, updatedText);
        doc.Activate();
        alert(clear ? "期限日・時刻を解除しました。" : "期限日・時刻を設定しました。");
    } catch (e) {
        alert("期限日・時刻を変更できませんでした。\n" + e.message);
    }
}

function openGoals() {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FolderExists(HUB_DIR)) throw new Error("作業ハブがありません: " + HUB_DIR);
    var doc = goalFindOpenDocument(GOALS_PATH);
    if (doc) return doc;
    if (!fso.FileExists(GOALS_PATH)) goalWriteText(GOALS_PATH, goalInitialText());
    editor.NewFile();
    doc = editor.ActiveDocument;
    doc.Text = goalReadText(GOALS_PATH);
    doc.Save(GOALS_PATH);
    return doc;
}

function goalInitialText() {
    return "# 年・月・週の目標とTODO\r\n\r\n" +
        "このファイルは通常のMarkdownとして直接編集できます。行を追加・変更し、保存してください。\r\n" +
        "目標管理マクロを使うと、入力案内に沿って同じファイルへ項目を追加できます。\r\n\r\n" +
        "子目標は複数並べられます。同じ親の下では同じ字下げにします。\r\n" +
        "年→月は2字、月→週は4字、週→TODOは6字下げます。\r\n\r\n" +
        "記入例（引用表示は説明用で、実際の目標ではありません）:\r\n" +
        "> - [ ] 年目標A\r\n" +
        ">   - [ ] 2026-10 月目標A\r\n" +
        ">   - [ ] 2026-11 月目標B\r\n" +
        ">     - [ ] 2026-W41 週目標A\r\n" +
        ">     - [ ] 2026-W42 週目標B\r\n" +
        ">       - [ ] 行動TODO A\r\n" +
        ">       - [ ] 行動TODO B\r\n" +
        "> - [ ] 年目標B\r\n\r\n" +
        "期限日は任意です。時刻も必要な場合だけ `@09:30-10:00` の形式で追加します。\r\n\r\n" +
        "## " + new Date().getFullYear() + "年\r\n";
}

function goalFindOpenDocument(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var target = fso.GetAbsolutePathName(path).toLowerCase();
    for (var i = 0; i < editor.Documents.Count; i++) {
        var doc = editor.Documents.Item(i);
        if (doc.FullName && fso.GetAbsolutePathName(doc.FullName).toLowerCase() === target) return doc;
    }
    return null;
}

function goalFileName(path) {
    return String(path).replace(/\\/g, "/").split("/").pop().toLowerCase();
}

function goalReadText(path) {
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

function goalWriteText(path, text) {
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

function saveGoalDocument(doc, text) {
    if (!doc.Saved) throw new Error("文書に未保存の変更があります。保存してからやり直してください。");
    var path = doc.FullName;
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var stamp = goalTimestamp(new Date());
    var backup = path + ".backup_" + stamp + ".md";
    if (fso.FileExists(path)) fso.CopyFile(path, backup, false);
    doc.Text = text;
    doc.Save(path);
}

function goalTimestamp(date) {
    return String(date.getFullYear()) + goalPad(date.getMonth() + 1) + goalPad(date.getDate()) + "_" + goalPad(date.getHours()) + goalPad(date.getMinutes()) + goalPad(date.getSeconds());
}

function goalCurrentLine(doc) {
    var selection = doc.selection;
    selection.StartOfLine(false, mePosLogical);
    selection.EndOfLine(true, mePosLogical);
    return String(selection.Text).replace(/(?:\r\n|\r|\n)$/, "");
}

function goalReplaceCurrentLine(text, oldLine, newLine) {
    var normalized = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    var lines = normalized.split("\n");
    var matches = 0;
    for (var i = 0; i < lines.length; i++) if (lines[i] === oldLine) { lines[i] = newLine; matches++; }
    if (matches !== 1) throw new Error("対象行を一意に確認できません。重複した行を区別してから実行してください。");
    return lines.join(text.indexOf("\r\n") >= 0 ? "\r\n" : "\n");
}

function goalInsertAnnualGoal(text, year, title) {
    year = goalTrim(year);
    title = goalTrim(title);
    if (!/^\d{4}$/.test(year)) throw new Error("年は YYYY 形式で入力してください。");
    if (!title || /[\r\n]/.test(title)) throw new Error("目標の内容を1行で入力してください。");
    var newline = String(text).indexOf("\r\n") >= 0 ? "\r\n" : "\n";
    var lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var heading = "## " + year + "年";
    var start = lines.indexOf(heading);
    if (start < 0) {
        while (lines.length && !lines[lines.length - 1]) lines.pop();
        if (lines.length) lines.push("");
        lines.push(heading, "- [ ] " + title, "");
        return lines.join(newline);
    }
    var end = start + 1;
    while (end < lines.length && !/^##\s/.test(lines[end])) end++;
    while (end > start + 1 && !lines[end - 1]) end--;
    lines.splice(end, 0, "- [ ] " + title);
    return lines.join(newline);
}

function goalBuildWizardText(text, year, groups) {
    year = goalTrim(year);
    if (!/^\d{4}$/.test(year)) throw new Error("年は YYYY 形式で入力してください。");
    if (!groups || !groups.length) throw new Error("年間目標を1件以上入力してください。");
    var block = [];
    for (var groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        var group = groups[groupIndex];
        goalValidateTitle(group.title);
        var annualLine = "- [ ] " + goalTrim(group.title);
        block.push(annualLine);
        if (!group.months || !group.months.length) throw new Error("各年間目標に月目標を1件以上入力してください。");
        for (var monthIndex = 0; monthIndex < group.months.length; monthIndex++) {
            var month = group.months[monthIndex];
            var monthLine = goalBuildChildLine(annualLine, month.title, month.period, "", "");
            block.push(monthLine);
            if (!month.weeks || !month.weeks.length) throw new Error("各月目標に週目標を1件以上入力してください。");
            for (var weekIndex = 0; weekIndex < month.weeks.length; weekIndex++) {
                var week = month.weeks[weekIndex];
                var weekLine = goalBuildChildLine(monthLine, week.title, week.period, "", "");
                block.push(weekLine);
                if (!week.tasks || !week.tasks.length) throw new Error("各週目標にTODOを1件以上入力してください。");
                for (var taskIndex = 0; taskIndex < week.tasks.length; taskIndex++) {
                    var task = week.tasks[taskIndex];
                    block.push(goalBuildChildLine(weekLine, task.title, "", task.due, task.time));
                }
            }
        }
    }
    var newline = String(text).indexOf("\r\n") >= 0 ? "\r\n" : "\n";
    var lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var heading = "## " + year + "年";
    var section = lines.indexOf(heading);
    if (section < 0) {
        while (lines.length && !lines[lines.length - 1]) lines.pop();
        if (lines.length) lines.push("");
        lines.push(heading);
        section = lines.length - 1;
    }
    var end = section + 1;
    while (end < lines.length && !/^##\s/.test(lines[end])) end++;
    while (end > section + 1 && !lines[end - 1]) end--;
    if (end > section + 1) block.unshift("");
    lines.splice.apply(lines, [end, 0].concat(block));
    return lines.join(newline);
}

function goalParseParent(line) {
    var match = /^([ \t]*)[-*]\s+\[[ xX]\]\s+(.+)$/.exec(String(line));
    if (!match) throw new Error("親となるチェックボックス目標の行にカーソルを置いてください。");
    var indent = match[1].replace(/\t/g, "    ").length;
    var kind, childName;
    if (indent === 0) { kind = "month"; childName = "月目標"; }
    else if (indent === 2) { kind = "week"; childName = "週目標"; }
    else if (indent === 4) { kind = "task"; childName = "TODO"; }
    else throw new Error("年目標（字下げなし）・月目標（2字下げ）・週目標（4字下げ）の行から追加してください。");
    return { indent: indent, kind: kind, childName: childName };
}

function goalBuildChildLine(parentLine, title, period, due, time) {
    var parent = goalParseParent(parentLine);
    title = goalTrim(title);
    if (!title || /[\r\n]/.test(title)) throw new Error("内容を1行で入力してください。");
    var prefix = "";
    if (parent.kind === "month") {
        period = goalTrim(period);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("対象月は YYYY-MM 形式で入力してください。");
        prefix = period + " 月目標: ";
    } else if (parent.kind === "week") {
        period = goalTrim(period).toUpperCase();
        if (!goalValidIsoWeek(period)) throw new Error("対象週は実在する ISO 週を YYYY-Www 形式で入力してください。");
        prefix = period + " 週目標: ";
    } else {
        due = goalTrim(due);
        time = goalTrim(time);
        if (due) goalValidateDate(due);
        if (time) {
            goalValidateTime(time);
            if (!due) throw new Error("時間帯を設定する場合は期限日も入力してください。");
        }
        if (due) title += " <!-- mery-due:" + due + " -->";
        if (time) title = title.replace(/\s*<!-- mery-due:/, " @" + time + " <!-- mery-due:");
    }
    return new Array(parent.indent + 3).join(" ") + "- [ ] " + prefix + title;
}

function goalInsertChildAfter(text, parentLine, childLine) {
    var newline = String(text).indexOf("\r\n") >= 0 ? "\r\n" : "\n";
    var lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var index = lines.indexOf(parentLine);
    if (index < 0) throw new Error("親目標の行が文書内にありません。");
    if (lines.indexOf(parentLine, index + 1) >= 0) throw new Error("同じ目標行が複数あります。内容を区別してから実行してください。");
    lines.splice(index + 1, 0, childLine);
    return lines.join(newline);
}

function goalReadSchedule(line) {
    var details = goalScheduleParts(line);
    return { date: details.date, time: details.time };
}

function goalSetTaskSchedule(line, date, time) {
    var parts = goalScheduleParts(line);
    if (!parts.prefix) throw new Error("チェックボックスのTODO行にカーソルを置いてください。");
    date = goalTrim(date);
    time = goalTrim(time);
    if (date) goalValidateDate(date);
    if (time) {
        goalValidateTime(time);
        if (!date) throw new Error("時間帯を設定する場合は期限日も入力してください。");
    }
    var body = goalTrim(parts.body);
    if (!body) throw new Error("TODOの内容がありません。");
    var result = parts.prefix + body;
    if (time) result += " @" + time;
    if (date) result += " <!-- mery-due:" + date + " -->";
    if (parts.comments.length) result += " " + parts.comments.join(" ");
    return result;
}

function goalScheduleParts(line) {
    var match = /^([ \t]*[-*]\s+\[[ xX]\]\s+)(.*)$/.exec(String(line));
    if (!match) throw new Error("チェックボックスのTODO行にカーソルを置いてください。");
    var body = match[2];
    var date = "";
    var comments = [];
    body = body.replace(/\s*<!--\s*mery-due:([^>]+?)\s*-->/gi, function (all, value) {
        if (date) throw new Error("期限日のマーカーが複数あります。");
        date = goalTrim(value);
        return "";
    });
    body = body.replace(/<!--([\s\S]*?)-->/g, function (all) {
        comments.push(all);
        return "";
    });
    var time = "";
    var timeMatch = /\s+@((?:[01]\d|2[0-3]):[0-5]\d-((?:[01]\d|2[0-3]):[0-5]\d))\s*$/.exec(body);
    if (timeMatch) {
        time = timeMatch[1];
        body = body.substring(0, timeMatch.index);
    }
    if (date) goalValidateDate(date);
    return { prefix: match[1], body: body, date: date, time: time, comments: comments };
}

function goalValidateDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("期限日は YYYY-MM-DD 形式で入力してください。");
    var parts = value.split("-");
    var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    if (date.getUTCFullYear() !== Number(parts[0]) || date.getUTCMonth() !== Number(parts[1]) - 1 || date.getUTCDate() !== Number(parts[2])) throw new Error("実在する日付を入力してください。");
}

function goalValidateTime(value) {
    var match = /^((?:[01]\d|2[0-3]):[0-5]\d)-((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
    if (!match) throw new Error("時間帯は HH:MM-HH:MM 形式で入力してください。");
    if (match[2] <= match[1]) throw new Error("終了時刻は開始時刻より後にしてください。");
}

function goalValidIsoWeek(value) {
    var match = /^(\d{4})-W(\d{2})$/.exec(value);
    if (!match) return false;
    var year = Number(match[1]);
    var week = Number(match[2]);
    if (week < 1 || week > 53) return false;
    var jan4 = new Date(Date.UTC(year, 0, 4));
    var monday = new Date(jan4.getTime());
    monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
    return goalIsoWeek(monday) === value;
}

function goalIsoWeek(date) {
    var thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
    var year = thursday.getUTCFullYear();
    var jan4 = new Date(Date.UTC(year, 0, 4));
    var monday = new Date(jan4.getTime());
    monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
    var week = Math.floor((thursday.getTime() - monday.getTime()) / 604800000) + 1;
    return year + "-W" + goalPad(week);
}

function goalCurrentMonth() {
    var date = new Date();
    return date.getFullYear() + "-" + goalPad(date.getMonth() + 1);
}

function goalCurrentWeek() {
    var date = new Date();
    return goalIsoWeek(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
}

function goalPad(value) {
    return value < 10 ? "0" + value : String(value);
}

function goalTrim(value) {
    return String(value === null || value === undefined ? "" : value).replace(/^\s+|\s+$/g, "");
}
