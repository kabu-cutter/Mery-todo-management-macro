#title = "MeryTODO Thunderbird同期"

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var GOALS_PATH = HUB_DIR + "\\GOALS.md";
var TASKS_PATH = HUB_DIR + "\\TASKS.md";

function showSyncMessage(message) {
    new ActiveXObject("WScript.Shell").Popup(String(message), 0, "MeryTODO CalDAV", 48);
}

function showSyncError(message) {
    new ActiveXObject("WScript.Shell").Popup(String(message), 0, "MeryTODO CalDAV - エラー", 16);
}

syncThunderbird();

function syncThunderbird() {
    try {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var shell = new ActiveXObject("WScript.Shell");
        if (!isThunderbirdRunning()) {
            showSyncError("Thunderbirdが起動していません。\n\nThunderbirdを起動してカレンダーが読み込まれた後、もう一度同期してください。");
            return;
        }
        if (!checkFilesSaved(fso, shell)) return;
        var node = shell.ExpandEnvironmentStrings("%ProgramFiles%\\nodejs\\node.exe");
        if (!fso.FileExists(node)) throw new Error("Node.js が見つかりません: " + node);
        var server = HUB_DIR + "\\MeryTODOmanagem-macro\\calendar-sync\\goals-caldav-server.cjs";
        var worker = HUB_DIR + "\\MeryTODOmanagem-macro\\calendar-sync\\goals-caldav-sync.cjs";
        if (!fso.FileExists(server) || !fso.FileExists(worker)) throw new Error("CalDAV同期スクリプトが見つかりません。リポジトリの配置を確認してください。");
        if (!calDavHealthy()) {
            shell.Run("\"" + node + "\" \"" + server + "\" --hub \"" + HUB_DIR + "\"", 0, false);
            var ready = false;
            for (var wait = 0; wait < 20; wait++) {
                shell.Run("cmd /c ping 127.0.0.1 -n 2 >nul", 0, true);
                if (calDavHealthy()) { ready = true; break; }
            }
            if (!ready) throw new Error("ローカルCalDAVサーバーを起動できませんでした。18453番ポートが使用中でないか確認してください。");
        }
        var report = HUB_DIR + "\\MERYTODO_CALDAV_REPORT.md";
        var previewCode = shell.Run("\"" + node + "\" \"" + worker + "\" --hub \"" + HUB_DIR + "\"", 0, true);
        if (previewCode !== 0 && previewCode !== 2) {
            if (fso.FileExists(report)) openReport(shell, report);
            throw new Error("同期プレビューに失敗しました（終了コード " + previewCode + "）。開いたレポートに原因を表示しました。");
        }
        openReport(shell, report);
        if (shell.Popup("同期プレビューを開きました。競合や削除を確認してください。\n反映すると GOALS.md と TASKS.md の変更前バックアップを作成します。\n\nこの内容を同期しますか？", 0, "MeryTODO CalDAV", 0x24) !== 6) return;
        var applyCode = shell.Run("\"" + node + "\" \"" + worker + "\" --hub \"" + HUB_DIR + "\" --apply", 0, true);
        openReport(shell, report);
        showSyncMessage(applyCode === 0 || applyCode === 2 ? "同期処理が終わりました。結果レポートを確認してください。" : "同期に失敗しました。結果レポートとNode.jsの出力を確認してください。");
    } catch (e) {
        showSyncError("MeryTODO CalDAV同期を開始できませんでした。\n" + e.message);
    }
}

function isThunderbirdRunning() {
    var shell = new ActiveXObject("WScript.Shell");
    var process = shell.Exec("tasklist.exe /FI \"IMAGENAME eq thunderbird.exe\" /NH");
    var output = process.StdOut.ReadAll();
    return /(^|\r?\n)\s*thunderbird\.exe\s/i.test(output);
}

function checkFilesSaved(fso, shell) {
    if (!fso.FileExists(GOALS_PATH)) throw new Error("GOALS.md がありません。先に目標管理メニューで作成してください。");
    if (!fso.FileExists(TASKS_PATH)) throw new Error("TASKS.md がありません。");
    return shell.Popup("同期前にMeryで GOALS.md と TASKS.md を保存してください。\n\n保存しましたか？", 0, "MeryTODO CalDAV", 0x24) === 6;
}

function openReport(shell, path) {
    shell.Run("\"" + path + "\"", 1, false);
}

function calDavHealthy() {
    try {
        var request = new ActiveXObject("WinHttp.WinHttpRequest.5.1");
        request.SetTimeouts(300, 300, 500, 500);
        request.Open("GET", "http://127.0.0.1:18453/healthz", false);
        request.Send();
        return request.Status === 200;
    } catch (e) { return false; }
}
