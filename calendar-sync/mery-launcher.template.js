#title = "My Tasks / LOG と双方向同期"

// Node.js 24 以上が必要です。Google 認証と初期設定は README_Google_Calendar.md を参照。
var HUB_DIR = "C:\\Projects\\ai-work-hub";
var NODE_EXE = "node";

main();

function main() {
    try {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var helper = fso.BuildPath(fso.GetParentFolderName(ScriptFullName), "calendar-sync\\calendar-sync.cjs");
        if (!fso.FileExists(helper)) {
            alert("calendar-sync フォルダーをマクロと同じフォルダーへ置いてください。\n" + helper);
            return;
        }
        var menu = CreatePopupMenu();
        menu.Add("Google カレンダー / Tasks の接続設定", 1);
        menu.Add("同期内容をプレビュー（予定・TASKS・LOGは変更しない）", 2);
        menu.Add("TODO → My Tasks / LOG → カレンダーを双方向同期", 3);
        var selected = menu.Track(0);
        if (selected === 0) return;

        if (selected !== 1) {
            if (!Confirm("開いている TASKS.md / LOG.md / TODO.md の編集を保存して処理します。\n"
                + (selected === 3 ? "追加・変更・削除を双方向に反映します。競合は保留し、ローカル変更前にバックアップを作成します。\n初回はプレビューで対象を確認してください。\n" : "カレンダーの読み取りと同期内容の確認を行います。\n")
                + "続行しますか？")) return;
            saveOpenHubDocuments();
        }

        var mode = selected === 1 ? "--auth" : selected === 2 ? "--preview" : "--sync";
        var runner = new ActiveXObject("WScript.Shell");
        var status = runner.Run(quoteArg(NODE_EXE) + " " + quoteArg(helper) + " --hub " + quoteArg(HUB_DIR) + " " + mode + " --tasks", 0, true);
        if (selected === 3) reloadOpenHubDocuments();
        var reportPath = HUB_DIR + "\\CALENDAR_SYNC_REPORT.md";
        if (fso.FileExists(reportPath)) showReport(reportPath);
        alert(status === 0 ? "処理が完了しました。同期レポートを確認してください。" : "処理を完了できませんでした。同期レポートと Node.js / Google 接続設定を確認してください。");
    } catch (e) {
        alert("Google カレンダー同期エラー: " + e.message);
    }
}

function quoteArg(value) {
    if (/["\r\n%]/.test(value)) throw new Error("実行パスに対応していない文字があります。");
    return '"' + value + '"';
}

function findDocument(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var target = fso.GetAbsolutePathName(path).toLowerCase();
    for (var i = 0; i < editor.Documents.Count; i++) {
        var d = editor.Documents.Item(i);
        if (d.FullName && fso.GetAbsolutePathName(d.FullName).toLowerCase() === target) return d;
    }
    return null;
}

function saveOpenHubDocuments() {
    saveOpenTodoDocuments();
    var names = ["TASKS.md", "LOG.md"];
    for (var i = 0; i < names.length; i++) {
        var d = findDocument(HUB_DIR + "\\" + names[i]);
        if (d) d.Save(d.FullName);
    }
}

function saveOpenTodoDocuments() {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    for (var i=0;i<editor.Documents.Count;i++) {
        var d=editor.Documents.Item(i);
        if(d.FullName && fso.GetFileName(d.FullName).toLowerCase()==="todo.md" && !d.Saved) d.Save(d.FullName);
    }
}

function reloadOpenHubDocuments() {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    for (var j=0;j<editor.Documents.Count;j++) {
        var todo=editor.Documents.Item(j);
        if(todo.FullName && fso.GetFileName(todo.FullName).toLowerCase()==="todo.md") {
            if(!todo.Saved) throw new Error("TODO.md に未保存の変更があります。開き直して確認してください。");
            todo.Text=readUtf8Text(todo.FullName);todo.Saved=true;
        }
    }
    var names = ["TASKS.md", "LOG.md"];
    for (var i = 0; i < names.length; i++) {
        var path = HUB_DIR + "\\" + names[i];
        var d = findDocument(path);
        if (d) {
            if (!d.Saved) throw new Error(names[i] + " に未保存の変更があります。同期済みファイルを確認してから開き直してください。");
            d.Text = readUtf8Text(path);
            d.Saved = true;
        }
    }
}

function showReport(path) {
    var d = findDocument(path);
    if (!d) {
        editor.NewFile();
        d = editor.ActiveDocument;
    }
    d.Text = readUtf8Text(path);
    d.Save(path);
    d.Activate();
    d.selection.StartOfDocument(false);
}

function readUtf8Text(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(path)) {
        return "";
    }

    // BOM を調べ、既存の UTF-16 ファイルも正しく読む。新規保存は UTF-8。
    var stream = new ActiveXObject("ADODB.Stream");
    try {
        stream.Type = 2;
        stream.Charset = "iso-8859-1";
        stream.Open();
        stream.LoadFromFile(path);
        var prefix = stream.ReadText(3);
        stream.Position = 0;
        if (prefix.charCodeAt(0) === 255 && prefix.charCodeAt(1) === 254) {
            stream.Charset = "unicode";
        } else if (prefix.charCodeAt(0) === 254 && prefix.charCodeAt(1) === 255) {
            stream.Charset = "unicodeFFFE";
        } else {
            stream.Charset = "utf-8";
        }
        return stream.ReadText().replace(/^\uFEFF/, "");
    } finally {
        if (stream.State !== 0) stream.Close();
    }
}

