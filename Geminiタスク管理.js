#title = "Gemini タスク管理"

// Mery タスク管理 v0.6.0
// 選択範囲またはアクティブ行をGeminiに送り、タスク整理結果をOUTBOX.mdへ出します。
// 標準形式: - [ ] 未完了 / - [x] 完了
// API呼び出しは call_gemini_api.js に委譲します。

BeginUndoGroup();

var doc = document;
var sel = document.selection;

var SELECTED_TEMPLATE_PROMPT_TAG = "gemini-selected-template-prompt";
var TEMPORARY_CUSTOM_INSTRUCTION_TAG = "gemini-temporary-custom-instruction";
var OUTPUT_PATH_TAG = "gemini-output-path";
var OUTPUT_TITLE_TAG = "gemini-output-title";

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var OUTBOX_PATH = HUB_DIR + "\\OUTBOX.md";

main();

function main() {
    var selectionIsEmpty = sel.IsEmpty;

    if (selectionIsEmpty) {
        sel.StartOfLine(false, mePosLogical);
        sel.EndOfLine(true, mePosLogical);
    }

    var promptLength = sel.TextLength;

    if (promptLength === 0) {
        alert("整理するテキストを選択するか、対象行にカーソルを置いてください。");
        return;
    }

    doc.Tag(SELECTED_TEMPLATE_PROMPT_TAG) = buildTaskPrompt();
    doc.Tag(TEMPORARY_CUSTOM_INSTRUCTION_TAG) = "あなたは個人用タスク管理の整理係です。出力は日本語Markdownで、タスクは `- [ ]` / 完了済みは `- [x]` の形式にしてください。";
    doc.Tag(OUTPUT_PATH_TAG) = OUTBOX_PATH;
    doc.Tag(OUTPUT_TITLE_TAG) = "OUTBOX";

    editor.ExecuteMacro("call_gemini_api.js");
}

function buildTaskPrompt() {
    return ""
        + "以下のメモ・ログ・指示を、個人用タスク管理のために整理してください。\n\n"
        + "重要な形式ルール:\n"
        + "- 未完了タスクは `- [ ] 項目` にしてください。\n"
        + "- 完了済み・実施済みに見えるものは `- [x] 項目` にしてください。\n"
        + "- `✓` や `済:` は使わず、`[x]` に統一してください。\n"
        + "- 空の項目は出さないでください。\n"
        + "- 不明点は「確認が必要」に入れてください。\n\n"
        + "出力形式:\n\n"
        + "## 今日やる\n"
        + "- [ ] 項目\n"
        + "- [ ] 項目\n\n"
        + "## 次にやる\n"
        + "- [ ] 項目\n\n"
        + "## 後で\n"
        + "- [ ] 項目\n\n"
        + "## 置く\n"
        + "- [ ] 項目\n\n"
        + "## 確認が必要\n"
        + "- [ ] 項目\n\n"
        + "## LOG候補\n"
        + "- [x] 実施済みっぽい項目\n\n"
        + "## TODO.md反映候補\n"
        + "- [ ] 項目\n\n"
        + "## 更新候補ファイル\n"
        + "- `ファイル名` — 理由\n\n"
        + "## 次にAIへ頼むとよさそうな指示\n"
        + "```text\n"
        + "ここに次の指示を書く\n"
        + "```\n";
}
