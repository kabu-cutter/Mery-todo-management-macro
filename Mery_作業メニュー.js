#title = "Mery作業メニュー"

// Mery タスク管理 v0.6.5
// クリック用ランチャーマクロ。

var MENU_OPEN_HUB = 1;
var MENU_START_TEMPLATE = 2;
var MENU_LOAD_PROJECT_TODO = 3;
var MENU_MERGE_TASKS_DUPLICATES = 4;
var MENU_MERGE_LOG_DATES = 5;
var MENU_DAILY_REVIEW = 6;
var MENU_GEMINI_TASK = 7;
var MENU_GEMINI_TASKS_TODAY = 8;
var MENU_GEMINI_PRIORITY_TODAY = 9;
var MENU_INSERT_TASKS_SECTION = 10;
var MENU_TASKS_TO_LOG = 11;
var MENU_REFLECT_OUTBOX_END = 12;

var MACRO_OPEN_HUB = "Mery_作業ハブを開く.js";
var MACRO_START_TEMPLATE = "Mery_今日の開始テンプレートを挿入.js";
var MACRO_LOAD_PROJECT_TODO = "Mery_プロジェクトTODOを読み込む.js";
var MACRO_MERGE_TASKS_DUPLICATES = "Mery_TASKS今日分の重複項目を整理.js";
var MACRO_MERGE_LOG_DATES = "Mery_LOG同日日付を統合.js";
var MACRO_DAILY_REVIEW = "Mery_日次レビューを作成.js";
var MACRO_GEMINI_TASK = "Geminiタスク管理.js";
var MACRO_GEMINI_TASKS_TODAY = "Mery_TASKS今日分をGeminiで整理.js";
var MACRO_GEMINI_PRIORITY_TODAY = "Mery_TASKS今日やるをGeminiで優先度整理.js";
var MACRO_INSERT_TASKS_SECTION = "Mery_選択範囲を今日のTASKS欄へ追加.js";
var MACRO_TASKS_TO_LOG = "Mery_TASKS選択項目をLOGへ記録.js";
var MACRO_REFLECT_OUTBOX_END = "Mery_OUTBOX選択範囲を末尾に反映.js";

main();

function main() {
    try {
        var menu = CreatePopupMenu();

        menu.Add("作業ハブを開く", MENU_OPEN_HUB);
        menu.Add("", 0, meMenuSeparator);
        menu.Add("今日の開始テンプレートを挿入", MENU_START_TEMPLATE);
        menu.Add("プロジェクトTODO.mdを読み込む", MENU_LOAD_PROJECT_TODO);
        menu.Add("TASKS.md 今日分の重複項目を整理", MENU_MERGE_TASKS_DUPLICATES);
        menu.Add("LOG.md の同日日付を統合", MENU_MERGE_LOG_DATES);
        menu.Add("日次レビューを作成", MENU_DAILY_REVIEW);
        menu.Add("", 0, meMenuSeparator);
        menu.Add("Geminiで選択範囲をタスク整理", MENU_GEMINI_TASK);
        menu.Add("TASKS.md今日分をGeminiで整理", MENU_GEMINI_TASKS_TODAY);
        menu.Add("今日やる優先度をGeminiで整理", MENU_GEMINI_PRIORITY_TODAY);
        menu.Add("", 0, meMenuSeparator);
        menu.Add("選択範囲を今日のTASKS欄へ追加", MENU_INSERT_TASKS_SECTION);
        menu.Add("TASKS選択項目をLOGへ記録", MENU_TASKS_TO_LOG);
        menu.Add("OUTBOX選択範囲を末尾に反映", MENU_REFLECT_OUTBOX_END);

        var selected = menu.Track(0);
        if (selected === 0) return;

        if (selected === MENU_OPEN_HUB) return runMacro(MACRO_OPEN_HUB);
        if (selected === MENU_START_TEMPLATE) return runMacro(MACRO_START_TEMPLATE);
        if (selected === MENU_LOAD_PROJECT_TODO) return runMacro(MACRO_LOAD_PROJECT_TODO);
        if (selected === MENU_MERGE_TASKS_DUPLICATES) return runMacro(MACRO_MERGE_TASKS_DUPLICATES);
        if (selected === MENU_MERGE_LOG_DATES) return runMacro(MACRO_MERGE_LOG_DATES);
        if (selected === MENU_DAILY_REVIEW) return runMacro(MACRO_DAILY_REVIEW);
        if (selected === MENU_GEMINI_TASK) return runMacro(MACRO_GEMINI_TASK);
        if (selected === MENU_GEMINI_TASKS_TODAY) return runMacro(MACRO_GEMINI_TASKS_TODAY);
        if (selected === MENU_GEMINI_PRIORITY_TODAY) return runMacro(MACRO_GEMINI_PRIORITY_TODAY);
        if (selected === MENU_INSERT_TASKS_SECTION) return runMacro(MACRO_INSERT_TASKS_SECTION);
        if (selected === MENU_TASKS_TO_LOG) return runMacro(MACRO_TASKS_TO_LOG);
        if (selected === MENU_REFLECT_OUTBOX_END) return runMacro(MACRO_REFLECT_OUTBOX_END);

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function runMacro(fileName) {
    try {
        editor.ExecuteMacro(fileName);
    } catch (e) {
        alert("マクロを実行できませんでした。\n\n対象: " + fileName + "\n\n詳細: " + e.message);
    }
}
