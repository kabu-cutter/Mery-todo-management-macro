#title = "MeryTODO Thunderbird同期"

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var GOALS_PATH = HUB_DIR + "\\GOALS.md";

syncThunderbird();

function syncThunderbird() {
    try {
        checkGoalsSaved();
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var shell = new ActiveXObject("WScript.Shell");
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
        var previewCode = shell.Run("\"" + node + "\" \"" + worker + "\" --hub \"" + HUB_DIR + "\"", 0, true);
        if (previewCode !== 0 && previewCode !== 2) throw new Error("同期プレビューに失敗しました（終了コード " + previewCode + "）。");
        var report = HUB_DIR + "\\MERYTODO_CALDAV_REPORT.md";
        editor.OpenFile(report, 0, meOpenAllowNewWindow);
        if (shell.Popup("同期プレビューを開きました。競合や削除を確認してください。\n反映すると GOALS.md と TASKS.md の変更前バックアップを作成します。\n\nこの内容を同期しますか？", 0, "MeryTODO CalDAV", 0x24) !== 6) return;
        var applyCode = shell.Run("\"" + node + "\" \"" + worker + "\" --hub \"" + HUB_DIR + "\" --apply", 0, true);
        editor.OpenFile(report, 0, meOpenAllowNewWindow);
        alert(applyCode === 0 || applyCode === 2 ? "同期処理が終わりました。結果レポートを確認してください。" : "同期に失敗しました。結果レポートとNode.jsの出力を確認してください。");
    } catch (e) {
        alert("MeryTODO CalDAV同期を開始できませんでした。\n" + e.message);
    }
}

function checkGoalsSaved() {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(GOALS_PATH)) throw new Error("GOALS.md がありません。先に目標管理メニューで作成してください。");
    var target = fso.GetAbsolutePathName(GOALS_PATH).toLowerCase();
    for (var i = 0; i < editor.Documents.Count; i++) {
        var doc = editor.Documents.Item(i);
        if (doc.FullName && fso.GetAbsolutePathName(doc.FullName).toLowerCase() === target && !doc.Saved) {
            throw new Error("GOALS.md に未保存の変更があります。保存してから同期してください。");
        }
    }
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
