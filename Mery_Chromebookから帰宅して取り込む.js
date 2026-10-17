#title = "Chromebookから帰宅してTASKSを取り込む"
var HUB_DIR = "C:\\Projects\\ai-work-hub";
var MODE = "--import";
runTravel();

function runTravel() {
    try {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var folder = new ActiveXObject("Shell.Application").BrowseForFolder(0, "外出時に使ったGoogle Driveフォルダーを選択してください", 0);
        if (!folder) return;
        var travel = folder.Self.Path;
        if (!fso.FileExists(fso.BuildPath(travel, "TASKS.md"))) throw new Error("選択フォルダーにTASKS.mdがありません。");
        if (!Confirm("Chromebook側のTASKS.mdと、リンクされたメモ・資料の変更をWindowsへ取り込みます。\nWindows側も同じファイルを外出後に変更していれば、安全のため自動取り込みを止めます。\n\n選択先: " + travel + "\n\n続けますか？")) return;
        saveTasks();
        var node = new ActiveXObject("WScript.Shell").ExpandEnvironmentStrings("%ProgramFiles%\\nodejs\\node.exe");
        var worker = fso.BuildPath(fso.GetParentFolderName(ScriptFullName), "calendar-sync\\chromebook-travel.cjs");
        if (!fso.FileExists(node) || !fso.FileExists(worker)) throw new Error("Node.js またはChromebook連携スクリプトが見つかりません。");
        var code = new ActiveXObject("WScript.Shell").Run(quote(node) + " " + quote(worker) + " --hub " + quote(HUB_DIR) + " --travel " + quote(travel) + " " + MODE, 0, true);
        if (code !== 0) throw new Error("取り込みを中止しました。Windows側との競合がないか確認してください。TASKS.md は上書きしていません。");
        reloadTasks();
        alert("ChromebookのTASKS・リンクされたメモ・資料を取り込みました。変更前のバックアップを作成し、Google Tasks / Google カレンダー / Thunderbird用のIDも維持しました。\n\n内容を確認した後、作業メニューから必要な同期を実行してください。Google同期とThunderbird同期は各レポートを確認してから反映してください。");
    } catch (e) { alert("帰宅時の取り込みに失敗しました: " + e.message); }
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
function reloadTasks() {
    var fso = new ActiveXObject("Scripting.FileSystemObject"), target = fso.GetAbsolutePathName(HUB_DIR + "\\TASKS.md").toLowerCase();
    for (var i = 0; i < editor.Documents.Count; i++) {
        var doc = editor.Documents.Item(i);
        if (doc.FullName && fso.GetAbsolutePathName(doc.FullName).toLowerCase() === target) { doc.Text = loadImportedText(doc.FullName); doc.Saved = true; }
    }
}
function loadImportedText(path) {
    var stream = new ActiveXObject("ADODB.Stream");
    try { stream.Type=2; stream.Charset="utf-8"; stream.Open(); stream.LoadFromFile(path); return stream.ReadText().replace(/^\uFEFF/, ""); }
    finally { if (stream.State !== 0) stream.Close(); }
}
function quote(value) { if (/["\r\n%]/.test(value)) throw new Error("パスに対応していない文字があります。"); return '"' + value + '"'; }
