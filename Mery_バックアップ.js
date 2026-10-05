#title = "Mery 作業ハブのバックアップ"
#tooltip = "今すぐ保存、最新・履歴・一覧の表示、保存先と毎日21時の設定。"

var HUB_DIR = "C:\\Projects\\ai-work-hub";
main();

function main() {
    try {
        var menu = CreatePopupMenu();
        menu.Add("今すぐバックアップ", 1);
        menu.Add("最新を開く", 2);
        menu.Add("履歴を開く", 3);
        menu.Add("バックアップ一覧を開く", 4);
        menu.Add("", 0, meMenuSeparator);
        menu.Add("保存先を設定・毎日21時に登録", 5);
        var choice = menu.Track(0);
        if (!choice) return;
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var shell = new ActiveXObject("WScript.Shell");
        var configPath = HUB_DIR + "\\backup.json";
        if (!fso.FileExists(configPath)) throw new Error("backup.json がありません。");
        if (choice === 5) {
            var dest = prompt("バックアップ先のフォルダ（例：E:\\ai-work-hub-backup）\nディスクの初期化は行いません。", "");
            if (!dest) return;
            if (!/^[A-Za-z]:\\/.test(dest) || /["%\r\n]/.test(dest)) throw new Error("ドライブ文字から始まるフォルダを指定してください。");
            var setupCode = shell.Run(psCommand(shell, "setup-backup.ps1") + " -Destination \"" + dest + "\" -DailyTime 21:00", 0, true);
            if (setupCode !== 0) throw new Error("設定または定期実行の登録に失敗しました。README_バックアップ.md の手動設定方法をご確認ください。既存タスクは上書きしません。");
            alert("保存先を設定し、毎日21時のバックアップを登録しました。\n" + dest);
            return;
        }
        var config = readConfig(configPath);
        if (!config.Destination || !config.DestinationId) throw new Error("保存先は未設定です。\n「保存先を設定・毎日21時に登録」から設定できます。");
        if (!/^[A-Za-z]:\\/.test(config.Destination) || /["%\r\n]/.test(config.Destination)) throw new Error("保存先の設定を確認してください。");
        if (choice === 1) {
            var code = shell.Run(psCommand(shell, "backup.ps1"), 0, true);
            if (code !== 0) {
                var statusPath = HUB_DIR + "\\.backup\\status.json";
                var detail = fso.FileExists(statusPath) ? readConfig(statusPath).Error : "保存先と設定を確認してください。";
                throw new Error("バックアップに失敗しました。\n" + detail);
            }
            alert("バックアップが完了しました。\n最新: " + config.Destination + "\\最新");
            return;
        }
        var marker = config.Destination + "\\.ai-work-hub-backup-id";
        if (!fso.FileExists(marker) || readUtf8(marker).replace(/^\s+|\s+$/g, "") !== config.DestinationId) throw new Error("設定した保存先が接続されていません。");
        var path = config.Destination + (choice === 2 ? "\\最新" : choice === 3 ? "\\履歴" : "\\バックアップ一覧.md");
        if (choice === 4) {
            if (!fso.FileExists(path)) throw new Error("まだバックアップ一覧がありません。最初の保存後に作成されます。");
            shell.Run("\"" + shell.ExpandEnvironmentStrings("%SystemRoot%\\explorer.exe") + "\" /select,\"" + path + "\"", 1, false);
        } else {
            if (!fso.FolderExists(path)) throw new Error("まだこの保存フォルダはありません。履歴は2回目の保存から作成されます。");
            shell.Run("\"" + shell.ExpandEnvironmentStrings("%SystemRoot%\\explorer.exe") + "\" \"" + path + "\"", 1, false);
        }
    } catch (e) { alert("バックアップ: " + e.message); }
}

function psCommand(shell, name) {
    var script = HUB_DIR + "\\" + name;
    if (!(new ActiveXObject("Scripting.FileSystemObject")).FileExists(script)) throw new Error(name + " がありません。");
    return "\"" + shell.ExpandEnvironmentStrings("%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe") + "\" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\"";
}
function readUtf8(path) {
    var stream = new ActiveXObject("ADODB.Stream");
    stream.Type = 2; stream.Charset = "utf-8"; stream.Open(); stream.LoadFromFile(path);
    var text = stream.ReadText(); stream.Close();
    return text.replace(/^\uFEFF/, "");
}
function readConfig(path) { return JSON.parse(readUtf8(path)); }
