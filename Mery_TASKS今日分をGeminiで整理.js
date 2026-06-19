#title = "TASKS今日分をGeminiで整理"

// Mery タスク管理 v0.6.0
// TASKS.md の今日のセクションをGeminiに送り、TASKS案.mdへ整理案を表示します。
// TASKS.md本体は上書きしません。
// 標準形式: - [ ] 未完了 / - [x] 完了
// call_gemini_api.js を利用します。

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";
var INPUT_PATH = HUB_DIR + "\\TASKS整理入力.md";
var OUTPUT_PATH = HUB_DIR + "\\TASKS案.md";

var SELECTED_TEMPLATE_PROMPT_TAG = "gemini-selected-template-prompt";
var TEMPORARY_CUSTOM_INSTRUCTION_TAG = "gemini-temporary-custom-instruction";
var OUTPUT_PATH_TAG = "gemini-output-path";
var OUTPUT_TITLE_TAG = "gemini-output-title";

main();

function main() {
    try {
        ensureFolder(HUB_DIR);
        ensureFile(TASKS_PATH, "# TASKS\n\n");

        var today = getTodayLabel();
        var tasksText = getDocumentOrFileText(TASKS_PATH);
        var todayHeading = "## " + today + " 今日の作業";
        var targetText = extractSection(tasksText, todayHeading);

        if (!targetText) {
            if (!Confirm("今日のTASKSセクションが見つかりません。\nTASKS.md全体を整理対象にしますか？")) {
                return;
            }
            targetText = tasksText;
        }

        if (!targetText || targetText.replace(/\s/g, "").length === 0) {
            alert("整理するTASKS内容がありません。");
            return;
        }

        var inputText = buildInputText(today, targetText);

        var inputDoc = showTextInSingleTab(INPUT_PATH, inputText);
        inputDoc.Activate();

        selectAllDocument(inputDoc);

        inputDoc.Tag(SELECTED_TEMPLATE_PROMPT_TAG) = buildPrompt();
        inputDoc.Tag(TEMPORARY_CUSTOM_INSTRUCTION_TAG) =
            "あなたは個人用TASKS.mdの整理係です。出力は日本語Markdownで、未完了は `- [ ]`、完了済みは `- [x]` にしてください。";
        inputDoc.Tag(OUTPUT_PATH_TAG) = OUTPUT_PATH;
        inputDoc.Tag(OUTPUT_TITLE_TAG) = "TASKS案";

        editor.ExecuteMacro("call_gemini_api.js");

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function buildInputText(today, targetText) {
    return ""
        + "# TASKS整理入力\n\n"
        + "対象日: " + today + "\n\n"
        + "以下は現在のTASKS.mdから抜き出した内容です。\n"
        + "TASKS.md本体は上書きしないため、整理案だけを作成してください。\n\n"
        + targetText + "\n";
}

function buildPrompt() {
    return ""
        + "以下のTASKS.md内容を整理してください。\n\n"
        + "目的:\n"
        + "- 今日の作業を見やすくする\n"
        + "- 重複や近い項目をまとめる\n"
        + "- 今やるものと後でよいものを分ける\n"
        + "- 完了済みらしいものはLOG化候補に分ける\n"
        + "- 不明点や判断が必要なものは確認が必要に分ける\n\n"
        + "重要な形式ルール:\n"
        + "- 未完了タスクは `- [ ] 項目` にする\n"
        + "- 完了済み・実施済みに見えるものは `- [x] 項目` にする\n"
        + "- `✓` や `済:` は使わず `[x]` に統一する\n"
        + "- 空の項目は出さない\n"
        + "- TASKS.md本体を上書きする指示はしない\n\n"
        + "出力形式:\n\n"
        + "# TASKS案\n\n"
        + "## 今日やる\n"
        + "- [ ] 項目\n\n"
        + "## 次にやる\n"
        + "- [ ] 項目\n\n"
        + "## 後で\n"
        + "- [ ] 項目\n\n"
        + "## 置く\n"
        + "- [ ] 項目\n\n"
        + "## 確認が必要\n"
        + "- [ ] 項目\n\n"
        + "## 重複・統合候補\n"
        + "- [ ] 項目A と 項目B は統合できそう\n\n"
        + "## LOG化候補\n"
        + "- [x] 済み/記録に回してよさそうな項目\n\n"
        + "## 削ってもよさそうな項目\n"
        + "- [ ] 理由つきで短く\n\n"
        + "## TASKS.mdへ反映するなら\n"
        + "- [ ] 次に選択して反映するとよさそうな範囲や注意点\n";
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

function selectAllDocument(doc) {
    try {
        doc.selection.StartOfDocument(false);
        doc.selection.EndOfDocument(true);
    } catch (e) {
        try {
            doc.selection.SelectAll();
        } catch (e2) {
            throw new Error("TASKS整理入力.md の全文選択に失敗しました。");
        }
    }
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

        return d;
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
