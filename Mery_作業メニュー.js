#title = "Mery作業メニュー"

// Mery タスク管理 v0.7.1
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
var MENU_GOOGLE_CALENDAR = 13;
var MENU_GEMINI_GROUP_TODAY = 14;
var MENU_RANDOM_TODAY = 15;
var MENU_CREATE_MEMO = 16;
var MENU_OPEN_MEMO = 17;
var MENU_BACKUP = 18;
var MENU_ADD_ASSET = 19;
var MENU_OPEN_ASSET = 20;
var MENU_GOALS = 21;
var MENU_BUTTON_GUIDE = 22;

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
var MACRO_GEMINI_GROUP_TODAY = "Mery_TASKS今日やるをGeminiでグループ分け.js";
var MACRO_GOOGLE_CALENDAR = "Mery_Googleカレンダーと同期.js";
var MACRO_GOALS = "Mery_目標管理.js";

main();

function main() {
    try {
        var menu = CreatePopupMenu();
        var goalsMacroPresent = macroFileExistsBesideLauncher(MACRO_GOALS);

        menu.Add("作業ハブを開く", MENU_OPEN_HUB);
        menu.Add("", 0, meMenuSeparator);
        menu.Add("今日の開始テンプレートを挿入", MENU_START_TEMPLATE);
        menu.Add(goalsMacroPresent ? "年・月・週の目標と期限を管理" : "年・月・週の目標と期限を管理（マクロ未配置）", MENU_GOALS, goalsMacroPresent ? 0 : meMenuGrayed);
        menu.Add("プロジェクトTODO.mdを読み込む", MENU_LOAD_PROJECT_TODO);
        menu.Add("TASKS.md 今日分の重複項目を整理", MENU_MERGE_TASKS_DUPLICATES);
        menu.Add("LOG.md の同日日付を統合", MENU_MERGE_LOG_DATES);
        menu.Add("日次レビューを作成", MENU_DAILY_REVIEW);
        menu.Add("", 0, meMenuSeparator);
        menu.Add("Geminiで選択範囲をタスク整理", MENU_GEMINI_TASK);
        menu.Add("TASKS.md今日分をGeminiで整理", MENU_GEMINI_TASKS_TODAY);
        menu.Add("今日やる優先度をGeminiで整理", MENU_GEMINI_PRIORITY_TODAY);
        menu.Add("今日やるをGeminiでグループ分け・反映", MENU_GEMINI_GROUP_TODAY);
        menu.Add("今日やるをランダムに並べ替える", MENU_RANDOM_TODAY);
        menu.Add("", 0, meMenuSeparator);
        menu.Add("選択範囲を今日のTASKS欄へ追加", MENU_INSERT_TASKS_SECTION);
        menu.Add("TASKS選択項目をLOGへ記録", MENU_TASKS_TO_LOG);
        menu.Add("OUTBOX選択範囲を末尾に反映", MENU_REFLECT_OUTBOX_END);
        menu.Add("", 0, meMenuSeparator);
        menu.Add("このTODOにメモを作る", MENU_CREATE_MEMO);
        menu.Add("関連メモを開く", MENU_OPEN_MEMO);
        menu.Add("資料を追加", MENU_ADD_ASSET);
        menu.Add("資料を開く", MENU_OPEN_ASSET);
        menu.Add("", 0, meMenuSeparator);
        menu.Add("Google カレンダーと双方向同期", MENU_GOOGLE_CALENDAR);
        menu.Add("作業ハブのバックアップ…", MENU_BACKUP);
        menu.Add("作業メニューのボタン追加案内", MENU_BUTTON_GUIDE);

        var selected = menu.Track(0);
        if (selected === 0) return;

        if (selected === MENU_OPEN_HUB) return runMacro(MACRO_OPEN_HUB);
        if (selected === MENU_START_TEMPLATE) return runMacro(MACRO_START_TEMPLATE);
        if (selected === MENU_GOALS) {
            if (!goalsMacroPresent) {
                alert("目標管理マクロが見つかりません。\n親マクロと同じフォルダーに配置してください。\n\n" + macroPathBesideLauncher(MACRO_GOALS));
                return;
            }
            return runMacro(MACRO_GOALS);
        }
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
        if (selected === MENU_RANDOM_TODAY) return runMacro("Mery_TASKS今日やるをランダムに並べ替える.js");
        if (selected === MENU_CREATE_MEMO) return runMacro("Mery_このTODOにメモを作る.js");
        if (selected === MENU_OPEN_MEMO) return runMacro("Mery_関連メモを開く.js");
        if (selected === MENU_BACKUP) return runMacro("Mery_バックアップ.js");
        if (selected === MENU_ADD_ASSET) return runMacro("Mery_資料を追加.js");
        if (selected === MENU_OPEN_ASSET) return runMacro("Mery_資料を開く.js");
        if (selected === MENU_GEMINI_GROUP_TODAY) return runMacro(MACRO_GEMINI_GROUP_TODAY);
        if (selected === MENU_GOOGLE_CALENDAR) return runMacro(MACRO_GOOGLE_CALENDAR);
        if (selected === MENU_BUTTON_GUIDE) return showMacroButtonGuide();

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function macroPathBesideLauncher(fileName) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    return fso.BuildPath(fso.GetParentFolderName(ScriptFullName), fileName);
}

function macroFileExistsBesideLauncher(fileName) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    return fso.FileExists(macroPathBesideLauncher(fileName));
}

function showMacroButtonGuide() {
    var macroPath = macroPathBesideLauncher("Mery_作業メニュー.js");
    alert("作業メニューをボタンから開く設定\n\n" +
        "1. Mery の [マクロ] → [カスタマイズ] を開く\n" +
        "2. [新規作成] から、次のマクロを登録する\n" +
        macroPath + "\n" +
        "3. 登録したマクロを一覧で表示対象にする\n" +
        "4. [表示] メニューからマクロバーを表示する\n" +
        "5. マクロバーの作業メニューをクリックして起動する\n\n" +
        "マクロファイル:\n" + macroPath + "\n\n" +
        "※ Mery 起動時の自動実行は設定しません。ボタンを押したときに実行します。");
}

function runMacro(fileName) {
    try {
        editor.ExecuteMacro(fileName);
    } catch (e) {
        alert("マクロを実行できませんでした。\n\n対象: " + fileName + "\n\n詳細: " + e.message);
    }
}
