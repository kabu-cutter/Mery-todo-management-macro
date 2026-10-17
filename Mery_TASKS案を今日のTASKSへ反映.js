#title = "TASKS案を今日のTASKSへ反映"

// TASKS案.mdの今日分を、確認後にTASKS.mdへ反映します。
// 入力時点からTASKS.mdが変更されていたら停止します。
// 元ファイルのバックアップと反映プレビューを作成します。

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";
var INPUT_PATH = HUB_DIR + "\\TASKS整理入力.md";
var PLAN_PATH = HUB_DIR + "\\TASKS案.md";
var PREVIEW_PATH = HUB_DIR + "\\TASKS反映プレビュー.md";
var CORE_SECTIONS = ["今日やる", "次にやる", "後で", "置く", "確認が必要"];

main();

function main() {
    try {
        var inputText = readTextFile(INPUT_PATH);
        var planText = readTextFile(PLAN_PATH);
        if (!inputText) throw new Error("TASKS整理入力.md がありません。先にGPTまたはGeminiでTASKS案を生成してください。");
        if (!planText) throw new Error("TASKS案.md がありません。先にGPTまたはGeminiでTASKS案を生成してください。");

        var snapshot = getInputSnapshot(inputText);
        if (!snapshot) throw new Error("整理入力から今日のTASKSスナップショットを読み取れません。TASKS案を作り直してください。");

        var currentText = getDocumentOrFileText(TASKS_PATH);
        var currentSection = extractSection(currentText, snapshot.heading);
        if (!currentSection) throw new Error("対象日のTASKSセクションが見つかりません。");
        if (normalizeNewlines(currentSection) !== normalizeNewlines(snapshot.section)) {
            var oldHoldMarker = "#### TASKS案で一致しなかった元のTODO（保留）";
            if (currentSection.indexOf(oldHoldMarker) < 0) {
                throw new Error("TASKS案の生成後に対象日のTASKSが変更されています。最新の内容でTASKS案を作り直してください。");
            }
        }

        var plan = parsePlan(planText);
        var mergeState = prepareMergeCandidates(plan, snapshot.section);
        var result = buildReplacement(snapshot.heading, mergeState.plan, mergeState.sourceSection);
        var updatedText = replaceSection(currentText, snapshot.heading, result.text);
        var backupPath = HUB_DIR + "\\TASKS_before_AI_apply_" + timestamp() + ".md";

        var preview = "# TASKS反映プレビュー\n\n"
            + "対象: " + snapshot.heading + "\n"
            + "反映先: TASKS.md\n"
            + "確認して統合する候補: " + mergeState.accepted.length + " 件\n"
            + "曖昧・予定情報付きなどで保留する統合候補: " + mergeState.reviewOnly.length + " 件\n"
            + "提案と安全に照合できず元の分類に残すTODO: " + result.preserved + " 件\n"
            + "分類を特定できない元TODO: " + result.unmatched + " 件\n\n"
            + "元TODOと一致せず採用しないAI提案: " + result.ignoredSuggestions + " 件\n\n"
            + "## 保留した統合候補\n"
            + (mergeState.reviewOnly.length ? "- " + mergeState.reviewOnly.join("\n- ") : "なし")
            + "\n\n---\n\n"
            + result.text;
        showTextInSingleTab(PREVIEW_PATH, preview);

        var message = "プレビューを開きました。\n\n"
            + "今日のTASKSセクションだけをTASKS.mdへ反映します。\n"
            + "元ファイルのバックアップを作成します。\n"
            + "確認済みの統合候補: " + mergeState.accepted.length + " 件\n"
            + "保留した統合候補: " + mergeState.reviewOnly.length + " 件\n"
            + "元の分類に残すTODO: " + result.preserved + " 件\n"
            + "分類を特定できないTODO: " + result.unmatched + " 件\n\n"
            + "元TODOと一致せず採用しないAI提案: " + result.ignoredSuggestions + " 件\n\n"
            + "反映しますか？";
        if (!confirmYesNo(message)) return;

        var latestText = getDocumentOrFileText(TASKS_PATH);
        var latestSection = extractSection(latestText, snapshot.heading);
        if (normalizeNewlines(latestText) !== normalizeNewlines(currentText)) {
            throw new Error("確認中にTASKS.mdが変更されました。上書きを避けるため反映を中止しました。");
        }

        writeTextFile(backupPath, latestText);
        var targetDoc = findOpenDocumentByFullName(TASKS_PATH);
        if (targetDoc) {
            targetDoc.Text = updatedText;
            targetDoc.Save(TASKS_PATH);
            targetDoc.Activate();
        } else {
            writeTextFile(TASKS_PATH, updatedText);
            openFileWithDefaultApp(TASKS_PATH);
        }
        showMessage("TASKS案を反映しました。\n\nバックアップ:\n" + backupPath);
    } catch (e) {
        showMessage("TASKS案の反映: " + e.message);
    }
}

function getInputSnapshot(text) {
    text = normalizeNewlines(text);
    var date = text.match(/^対象日:\s*(\d{4}-\d{2}-\d{2}\s+\([^)]*\))/m);
    var marker = "以下は現在のTASKS.mdから抜き出した内容です。\n";
    var markerAt = text.indexOf(marker);
    if (!date || markerAt < 0) return null;
    var heading = "## " + date[1] + " 今日の作業";
    var headingAt = text.indexOf(heading, markerAt + marker.length);
    if (headingAt < 0) return null;
    var section = text.substring(headingAt).replace(/\s+$/g, "");
    return { heading: heading, section: section };
}

function parsePlan(text) {
    var lines = normalizeNewlines(text).split("\n");
    var sections = {};
    var current = "";
    for (var i = 0; i < CORE_SECTIONS.length; i++) sections[CORE_SECTIONS[i]] = null;
    sections["重複・統合候補"] = null;
    for (var n = 0; n < lines.length; n++) {
        var h = lines[n].match(/^##\s+(.+?)\s*$/);
        if (h) {
            current = Object.prototype.hasOwnProperty.call(sections, h[1]) ? h[1] : "";
            if (current && sections[current] !== null) throw new Error("TASKS案に「" + current + "」が重複しています。");
            if (current) sections[current] = [];
            continue;
        }
        if (current) sections[current].push(lines[n]);
    }
    var found = false;
    for (var j = 0; j < CORE_SECTIONS.length; j++) {
        if (sections[CORE_SECTIONS[j]] !== null) found = true;
    }
    if (!found) throw new Error("TASKS案に反映可能な見出しがありません。");
    return sections;
}

// 元タスク名を正確に引用した候補だけを扱います。予定ID・期限・時刻付きは保留します。
function prepareMergeCandidates(plan, sourceSection) {
    var candidates = plan["重複・統合候補"] || [];
    var records = extractTaskRecords(sourceSection);
    var accepted = [];
    var reviewOnly = [];
    var reserved = {};

    for (var i = 0; i < candidates.length; i++) {
        var line = String(candidates[i] || "").replace(/^\s+|\s+$/g, "");
        if (!line || !/^[-*]\s+/.test(line)) continue;
        var parsed = line.match(/^[-*]\s+(?:統合候補:\s*)?[「『](.+?)[」』]\s*\+\s*[「『](.+?)[」』]\s*(?:→|->)\s*[「『](.+?)[」』]\s*$/);
        if (!parsed) { reviewOnly.push(line); continue; }

        var keyA = taskKey("- [ ] " + parsed[1]);
        var keyB = taskKey("- [ ] " + parsed[2]);
        var matchesA = findRecordsByCandidate(records, keyA, parsed[1]);
        var matchesB = findRecordsByCandidate(records, keyB, parsed[2]);
        var reason = "";
        if (!keyA || !keyB || !taskKey("- [ ] " + parsed[3])) reason = "候補の名前が空です";
        else if (keyA === keyB) {
            if (matchesA.length !== 2) reason = "同名タスクを2件に特定できません";
            else { matchesB = [matchesA[1]]; matchesA = [matchesA[0]]; }
        } else if (matchesA.length !== 1 || matchesB.length !== 1) reason = "元タスクを一意に特定できません";
        if (!reason && (!matchesA[0] || !matchesB[0])) reason = "元タスクを特定できません";
        if (!reason && (!taskTextsCorrespond(visibleTaskText(matchesA[0].line), parsed[1]) || !taskTextsCorrespond(visibleTaskText(matchesB[0].line), parsed[2]))) reason = "引用された元タスク名を安全に照合できません";
        if (!reason && (matchesA[0].metadata.length || matchesB[0].metadata.length)) reason = "予定ID・期限・時刻などのメタデータ付きです";
        if (!reason && (/\[[xX]\]/.test(matchesA[0].line) || /\[[xX]\]/.test(matchesB[0].line))) reason = "完了済みタスクを含みます";
        if (!reason && (reserved[keyA] || reserved[keyB])) reason = "別候補と元タスクが重なっています";
        if (!reason) {
            var mergedKey = taskKey("- [ ] " + parsed[3]);
            var titleMatches = findRecordsByKey(records, mergedKey);
            for (var t = 0; t < titleMatches.length; t++) {
                if (titleMatches[t] !== matchesA[0] && titleMatches[t] !== matchesB[0]) {
                    reason = "統合後の名前と同名の別タスクがあります";
                    break;
                }
            }
        }
        if (reason) { reviewOnly.push(line + "（保留: " + reason + "）"); continue; }

        var action = { a: matchesA[0], b: matchesB[0], title: parsed[3], keyA: keyA, keyB: keyB, section: findPlanSection(plan, keyA, keyB) };
        var autoMerge = isTrivialDuplicate(matchesA[0], matchesB[0], parsed[3]);
        var yes = autoMerge || confirmYesNo("統合候補を確認してください。\n\n"
            + matchesA[0].line.replace(/^\s*[-*]\s+\[ \]\s+/, "") + "\n+ "
            + matchesB[0].line.replace(/^\s*[-*]\s+\[ \]\s+/, "") + "\n→ " + parsed[3]
            + "\n\n元のメモ行は統合後の項目に引き継ぎます。\nこの2項目を統合しますか？");
        if (!yes) { reviewOnly.push(line + "（未選択）"); continue; }
        reserved[keyA] = true; reserved[keyB] = true;
        accepted.push(action);
    }
    if (accepted.length) {
        sourceSection = mergeSourceRecords(sourceSection, accepted);
        applyMergesToPlan(plan, accepted);
    }
    return { plan: plan, sourceSection: sourceSection, accepted: accepted, reviewOnly: reviewOnly };
}

function findRecordsByKey(records, key) {
    var found = [];
    for (var i = 0; i < records.length; i++) if (records[i].key === key) found.push(records[i]);
    return found;
}

function findRecordsByCandidate(records, key, candidateText) {
    var found = findRecordsByKey(records, key);
    if (found.length) return found;
    var candidateKey = taskMatchKey("- [ ] " + candidateText);
    for (var i = 0; i < records.length; i++) {
        if (taskTextsCorrespond(visibleTaskText(records[i].line), candidateText)) found.push(records[i]);
    }
    return found;
}

function taskTextsCorrespond(a, b) {
    var ka = taskMatchKey("- [ ] " + a), kb = taskMatchKey("- [ ] " + b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    var shorter = ka.length < kb.length ? ka : kb;
    var longer = ka.length < kb.length ? kb : ka;
    if (shorter.length >= 8 && longer.indexOf(shorter) === 0) return true;
    return bigramSimilarity(ka, kb) >= 0.84;
}

function isTrivialDuplicate(a, b, mergedTitle) {
    var ka = taskMatchKey(a.line), kb = taskMatchKey(b.line);
    var kt = taskMatchKey("- [ ] " + mergedTitle);
    if (!ka || !kb || !kt) return false;
    if (ka === kb && kt === ka) return true;
    return bigramSimilarity(ka, kb) >= 0.94 && (kt === ka || kt === kb);
}

function visibleTaskText(line) {
    return String(line || "").replace(/^\s*[-*]\s+\[[ xX]\]\s+/, "").replace(/^\s+|\s+$/g, "");
}

function findPlanSection(plan, keyA, keyB) {
    for (var i = 0; i < CORE_SECTIONS.length; i++) {
        var name = CORE_SECTIONS[i], lines = plan[name] || [];
        for (var j = 0; j < lines.length; j++) {
            var key = taskKey(lines[j]);
            if (key === keyA || key === keyB) return name;
        }
    }
    return "確認が必要";
}

function applyMergesToPlan(plan, merges) {
    for (var i = 0; i < CORE_SECTIONS.length; i++) {
        var name = CORE_SECTIONS[i], lines = plan[name] || [], kept = [];
        for (var j = 0; j < lines.length; j++) {
            var key = taskKey(lines[j]);
            if (key && isMergeSourceKey(merges, key)) continue;
            kept.push(lines[j]);
        }
        plan[name] = kept;
    }
    for (var m = 0; m < merges.length; m++) {
        var destination = merges[m].section || "確認が必要";
        if (!plan[destination]) plan[destination] = [];
        plan[destination].push("- [ ] " + merges[m].title);
    }
}

function isMergeSourceKey(merges, key) {
    for (var i = 0; i < merges.length; i++) if (merges[i].keyA === key || merges[i].keyB === key) return true;
    return false;
}

function mergeSourceRecords(sourceSection, merges) {
    var lines = normalizeNewlines(sourceSection).split("\n"), output = [], current = null;
    function flush() {
        if (!current) return;
        var action = findMergeForKey(merges, current.key);
        if (!action) {
            output.push(current.line);
            for (var d = 0; d < current.details.length; d++) output.push(current.details[d]);
        } else if (!action.emitted) {
            output.push("- [ ] " + action.title);
            appendMergeDetails(output, action.a.details);
            appendMergeDetails(output, action.b.details);
            action.emitted = true;
        }
        current = null;
    }
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (/^#{1,4}\s/.test(line)) { flush(); output.push(line); }
        else if (/^\s*[-*]\s+\[[ xX]\]\s+/.test(line)) { flush(); current = { line: line, key: taskKey(line), details: [] }; }
        else if (current) current.details.push(line);
        else output.push(line);
    }
    flush();
    return output.join("\n").replace(/\n+$/g, "");
}

function findMergeForKey(merges, key) {
    for (var i = 0; i < merges.length; i++) if (merges[i].keyA === key || merges[i].keyB === key) return merges[i];
    return null;
}

function appendMergeDetails(output, details) {
    for (var i = 0; i < details.length; i++) if (details[i].replace(/\s/g, "")) output.push(details[i]);
}

function buildReplacement(heading, sections, sourceSection) {
    var records = extractTaskRecords(sourceSection);
    var used = [];
    var out = [heading, ""];
    var preservedOriginals = 0;
    var ignoredSuggestions = 0;
    for (var i = 0; i < CORE_SECTIONS.length; i++) {
        var name = CORE_SECTIONS[i];
        out.push("### " + name);
        var lines = sections[name] || [];
        var keptLines = [];
        for (var n = 0; n < lines.length; n++) {
            var line = lines[n];
            var task = line.match(/^(\s*[-*]\s+\[[ xX]\]\s+)(.*)$/);
            if (task) {
                var key = taskKey(line);
                var record = findMatchingRecord(records, used, key);
                if (record) {
                    used[record.index] = true;
                    line = appendMetadata(line, record.metadata);
                    keptLines.push(line);
                    for (var d = 0; d < record.details.length; d++) {
                        if (!containsExactLine(lines, record.details[d])) keptLines.push(record.details[d]);
                    }
                    continue;
                }
                // TASKS整理は既存項目の分類だけを反映する。AIが言い換えたり
                // 新しく作った項目は同期IDを壊すため、TASKS.mdへ追加しない。
                ignoredSuggestions++;
                continue;
            }
            keptLines.push(line);
        }
        // 未照合の元TODOは末尾へ移さず、元の分類に残して本文とメモを保護します。
        for (var r = 0; r < records.length; r++) {
            if (!used[r] && records[r].section === name) {
                used[r] = true;
                preservedOriginals++;
                keptLines.push(records[r].line);
                for (var q = 0; q < records[r].details.length; q++) keptLines.push(records[r].details[q]);
            }
        }
        while (keptLines.length && !keptLines[keptLines.length - 1].replace(/\s/g, "")) keptLines.pop();
        if (keptLines.length) {
            for (var k = 0; k < keptLines.length; k++) out.push(keptLines[k]);
        }
        out.push("");
    }

    var unmatchedRecords = [];
    for (var r = 0; r < records.length; r++) if (!used[r]) unmatchedRecords.push(records[r]);
    if (unmatchedRecords.length) {
        out.push("#### 分類を特定できなかった元のTODO（保留）");
        for (var u = 0; u < unmatchedRecords.length; u++) {
            out.push(unmatchedRecords[u].line);
            for (var q = 0; q < unmatchedRecords[u].details.length; q++) out.push(unmatchedRecords[u].details[q]);
        }
        out.push("");
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return { text: out.join("\n") + "\n", unmatched: unmatchedRecords.length, preserved: preservedOriginals, ignoredSuggestions: ignoredSuggestions };
}

function extractTaskRecords(section) {
    var lines = normalizeNewlines(section).split("\n");
    var records = [];
    var current = null;
    var activeSection = "";
    function flush() {
        if (current) records.push(current);
        current = null;
    }
    for (var i = 1; i < lines.length; i++) {
        var line = lines[i];
        if (/^#{1,4}\s/.test(line)) {
            flush();
            var coreHeader = line.match(/^###\s+(.+?)\s*$/);
            if (coreHeader && isCoreSection(coreHeader[1])) activeSection = coreHeader[1];
            continue;
        }
        if (/^\s*[-*]\s+\[[ xX]\]\s+/.test(line)) {
            flush();
            current = {
                line: line,
                key: taskKey(line),
                metadata: extractMetadata(line),
                details: [],
                section: activeSection,
                index: records.length
            };
        } else if (current && line.replace(/\s/g, "")) {
            current.details.push(line);
        } else if (current) {
            current.details.push(line);
        }
    }
    flush();
    for (var n = 0; n < records.length; n++) records[n].index = n;
    return records;
}

function taskKey(line) {
    var value = String(line || "").replace(/^\s*[-*]\s+\[[ xX]\]\s+/, "");
    value = value.replace(/<!--\s*mery-(?:calendar|due):[^>]*-->/ig, "");
    value = value.replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M(?:\s*[-–—]\s*\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)?/ig, "");
    value = value.replace(/\s+@(?:[01]\d|2[0-3]):[0-5]\d(?:-(?:[01]\d|2[0-3]):[0-5]\d)?/ig, "");
    value = value.replace(/[\uFF01-\uFF5E]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    }).replace(/\u3000/g, " ");
    return value.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").toLowerCase();
}

function extractMetadata(line) {
    var values = [];
    var re = /<!--\s*mery-(?:calendar|due):[^>]*-->/ig;
    var match;
    while ((match = re.exec(line)) !== null) values.push(match[0]);
    var timed = line.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M(?:\s*[-–—]\s*\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)?/i);
    if (timed) values.push(timed[0]);
    var shortTime = line.match(/\s@(?:[01]\d|2[0-3]):[0-5]\d(?:-(?:[01]\d|2[0-3]):[0-5]\d)?/);
    if (shortTime) values.push(shortTime[0].replace(/^\s+/, ""));
    return values;
}

function findMatchingRecord(records, used, key) {
    if (!key) return null;
    for (var i = 0; i < records.length; i++) {
        if (!used[i] && records[i].key === key) return records[i];
    }
    var target = taskMatchKey("- [ ] " + key), match = null, count = 0;
    for (var j = 0; j < records.length; j++) {
        if (!used[j] && taskMatchKey(records[j].line) === target) { match = records[j]; count++; }
    }
    if (count === 1) return match;
    if (count > 1) return null;
    var bestScore = 0, secondScore = 0, best = null;
    for (var k = 0; k < records.length; k++) {
        if (used[k]) continue;
        var score = bigramSimilarity(target, taskMatchKey(records[k].line));
        if (score > bestScore) { secondScore = bestScore; bestScore = score; best = records[k]; }
        else if (score > secondScore) secondScore = score;
    }
    if (best && bestScore >= 0.84 && bestScore - secondScore >= 0.10) return best;
    return null;
}

function taskMatchKey(line) {
    return taskKey(line).replace(/[^0-9a-z\u3040-\u30ff\u3400-\u9fff]/ig, "");
}

function bigramSimilarity(a, b) {
    a = String(a || ""); b = String(b || "");
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    var counts = {}, totalA = a.length - 1, totalB = b.length - 1, common = 0;
    for (var i = 0; i < totalA; i++) {
        var pairA = a.substr(i, 2);
        counts[pairA] = (counts[pairA] || 0) + 1;
    }
    for (var j = 0; j < totalB; j++) {
        var pairB = b.substr(j, 2);
        if (counts[pairB] > 0) { common++; counts[pairB]--; }
    }
    return 2 * common / (totalA + totalB);
}

function isCoreSection(name) {
    for (var i = 0; i < CORE_SECTIONS.length; i++) if (CORE_SECTIONS[i] === name) return true;
    return false;
}

function appendMetadata(line, metadata) {
    for (var i = 0; i < metadata.length; i++) {
        if (line.indexOf(metadata[i]) < 0) line += " " + metadata[i];
    }
    return line;
}

function containsExactLine(lines, target) {
    var normalized = String(target).replace(/^\s+|\s+$/g, "");
    for (var i = 0; i < lines.length; i++) {
        if (String(lines[i]).replace(/^\s+|\s+$/g, "") === normalized) return true;
    }
    return false;
}

function replaceSection(text, heading, replacement) {
    var normalized = normalizeNewlines(text);
    var start = normalized.indexOf(heading);
    if (start < 0) throw new Error("TASKS.md内で対象セクションを見つけられません。");
    var next = normalized.indexOf("\n## ", start + heading.length);
    if (next < 0) return normalized.substring(0, start) + replacement;
    return normalized.substring(0, start) + replacement + "\n" + normalized.substring(next + 1);
}

function extractSection(text, heading) {
    var normalized = normalizeNewlines(text);
    var start = normalized.indexOf(heading);
    if (start < 0) return "";
    var next = normalized.indexOf("\n## ", start + heading.length);
    return (next < 0 ? normalized.substring(start) : normalized.substring(start, next)).replace(/\s+$/g, "");
}

function normalizeNewlines(text) {
    return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function timestamp() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "_" + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}

function pad2(n) { return n < 10 ? "0" + n : String(n); }

function getDocumentOrFileText(path) {
    var d = findOpenDocumentByFullName(path);
    return d ? d.Text : readTextFile(path);
}

function findOpenDocumentByFullName(path) {
    try {
        if (typeof document !== "undefined" && document.FullName
            && normalizePath(document.FullName) === normalizePath(path)) return document;
    } catch (e) {
    }
    return null;
}

function showTextInSingleTab(path, text) {
    var d = findOpenDocumentByFullName(path);
    if (d) {
        d.Activate();
        d.Text = text;
        d.Save(path);
        return d;
    }
    writeTextFile(path, text);
    openFileWithDefaultApp(path);
    return null;
}

function openFileWithDefaultApp(path) {
    try {
        new ActiveXObject("WScript.Shell").Run('"' + path + '"', 1, false);
    } catch (e) {
    }
}

function normalizePath(path) {
    return new ActiveXObject("Scripting.FileSystemObject").GetAbsolutePathName(path).toLowerCase();
}

function readTextFile(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(path)) return "";
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
        stream.WriteText(String(text || ""));
        stream.SaveToFile(path, 2);
    } finally {
        if (stream.State !== 0) stream.Close();
    }
}

function confirmYesNo(message) {
    return new ActiveXObject("WScript.Shell").Popup(String(message), 0, "TASKS案を反映", 4 + 32) === 6;
}

function showMessage(message) {
    new ActiveXObject("WScript.Shell").Popup(String(message), 0, "TASKS案を反映", 48);
}
