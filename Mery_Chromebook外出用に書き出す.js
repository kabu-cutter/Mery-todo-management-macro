#title = "Chromebook外出用TASKSを書き出す"
var HUB_DIR = "C:\\Projects\\ai-work-hub";
var MODE = "--export";
runTravel();

function runTravel() {
    try {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var folder = new ActiveXObject("Shell.Application").BrowseForFolder(0, "Google Drive for desktop の同期フォルダーを選択してください", 0);
        if (!folder) return;
        var travel = folder.Self.Path;
        if (!Confirm("TASKS.md と、そこから参照しているメモ・資料を選択フォルダーへコピーします。\nChromebook で使う場合は、このフォルダーを Google Drive でオフライン利用可能にしてください。\n\n選択先: " + travel + "\n\n続けますか？")) return;
        saveTasks();
        var node = new ActiveXObject("WScript.Shell").ExpandEnvironmentStrings("%ProgramFiles%\\nodejs\\node.exe");
        var worker = fso.BuildPath(fso.GetParentFolderName(ScriptFullName), "calendar-sync\\chromebook-travel.cjs");
        if (!fso.FileExists(node) || !fso.FileExists(worker)) throw new Error("Node.js またはChromebook連携スクリプトが見つかりません。");
        var code = new ActiveXObject("WScript.Shell").Run(quote(node) + " " + quote(worker) + " --hub " + quote(HUB_DIR) + " --travel " + quote(travel) + " " + MODE, 0, true);
        if (code !== 0) throw new Error("書き出しに失敗しました。同期IDや参照ファイルを確認してください。");
        alert("Chromebook用のTASKSを書き出しました。\n\n" + travel + "\\TASKS.md\n\nChromebookではGoogle Driveのファイルをオフライン利用可能にし、外出中はこのTASKS.mdだけを編集してください。帰宅後は「帰宅」ボタンで取り込みます。");
    } catch (e) { alert("外出用の書き出しに失敗しました: " + e.message); }
}

function saveTasks() {
    var target = HUB_DIR + "\\TASKS.md", fso = new ActiveXObject("Scripting.FileSystemObject");
    for (var i = 0; i < editor.Documents.Count; i++) {
        var doc = editor.Documents.Item(i);
        if (doc.FullName && fso.GetAbsolutePathName(doc.FullName).toLowerCase() === fso.GetAbsolutePathName(target).toLowerCase()) {
            if (!doc.Saved) doc.Save(doc.FullName);
            return;
        }
    }
}
function quote(value) { if (/["\r\n%]/.test(value)) throw new Error("パスに対応していない文字があります。"); return '"' + value + '"'; }
