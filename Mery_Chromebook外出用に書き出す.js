#title = "Chromebook外出用TASKSを書き出す"
var HUB_DIR = "C:\\Projects\\ai-work-hub";
runTravel();

function runTravel() {
    try {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        ensureOnline();
        var travel = getTravelFolder(fso);
        var tasksDoc = resolveTasksDocument(fso);
        if (!confirmAction("表示中のTASKS.mdと、そこから参照しているメモ・資料をGoogle Drive for desktopへコピーします。\n\nコピー元: " + tasksDoc.FullName + "\n保存先: " + travel + "\n\n続けますか？")) return;
        saveTasks(fso, tasksDoc);
        var node = new ActiveXObject("WScript.Shell").ExpandEnvironmentStrings("%ProgramFiles%\\nodejs\\node.exe");
        var worker = fso.BuildPath(fso.GetParentFolderName(ScriptFullName), "calendar-sync\\chromebook-travel.cjs");
        if (!fso.FileExists(node) || !fso.FileExists(worker)) throw new Error("Node.js またはChromebook連携スクリプトが見つかりません。");
        Status = "Chromebook用データを Google Drive へ書き出し中...";
        var shell = new ActiveXObject("WScript.Shell");
        var operationStartedAt = new Date();
        var code = shell.Run(quote(node) + " " + quote(worker) + " --hub " + quote(HUB_DIR) + " --travel " + quote(travel) + " --export", 0, true);
        var status = readStatus(fso.BuildPath(HUB_DIR, ".mery-calendar\\chromebook-travel-status.txt"));
        if (code !== 0) throw new Error(status || "書き出しに失敗しました。TASKS.md と参照資料を確認してください。");
        var timestampGuide = getExportTimestampGuide(fso, travel, operationStartedAt);
        showMessage((status || "外出用データを書き出しました。") + "\n\n" + timestampGuide + "\n\nDriveアイコンの「同期状況」で対象ファイルが完了／最新になるまで待ってから、Chromebookで使ってください。帰宅時は同じフォルダーを自動検出します。");
    } catch (e) { showMessage("外出用の書き出しに失敗しました: " + e.message + "\n\nネット接続とGoogle Drive for desktopのログイン・同期状態を確認し、オンラインに戻ってから再実行してください。ファイルの同期完了はDriveアイコンで確認してください。"); }
}

function ensureOnline() {
    try {
        var request = new ActiveXObject("WinHttp.WinHttpRequest.5.1");
        request.SetTimeouts(2000, 2000, 3000, 3000);
        request.Open("GET", "https://www.google.com/generate_204", false);
        request.Send();
        if (request.Status !== 204) throw new Error("Googleへの接続確認が完了しませんでした（HTTP " + request.Status + "）。Windowsがオフラインか、ネットワークで接続が制限されています。");
    } catch (e) {
        throw new Error("Google Driveの同期前にオンライン接続を確認できません。Windowsのネット接続とGoogle Drive for desktopのログインを確認し、オンラインに戻ってから再実行してください。詳細: " + e.message);
    }
}
function getTravelFolder(fso) {
    var drives = new Enumerator(fso.Drives);
    var roots = [];
    var existing = [];
    while (!drives.atEnd()) {
        var drive = drives.item(); drives.moveNext();
        try {
            if (drive.IsReady && String(drive.VolumeName).toLowerCase() === "google drive") {
                var myDrive = drive.DriveLetter + ":\\My Drive";
                if (fso.FolderExists(myDrive)) {
                    roots.push(myDrive);
                    var candidate = fso.BuildPath(myDrive, "Mery Chromebook");
                    if (fso.FolderExists(candidate)) existing.push(candidate);
                }
            }
        } catch (ignore) {}
    }
    if (roots.length === 0) throw new Error("Google Drive for desktop の同期ドライブが見つかりません。アプリを起動してログインし、マイドライブがエクスプローラーで開ける状態にしてから再実行してください。");
    if (existing.length === 1) return existing[0];
    if (existing.length > 1 || roots.length > 1) throw new Error("Google Driveの保存先を一つに決められません。接続を確認し、保存先を一つにしてください。");
    var travel = fso.BuildPath(roots[0], "Mery Chromebook");
    if (!fso.FolderExists(travel)) {
        try { fso.CreateFolder(travel); }
        catch (e) { throw new Error("Google Driveの保存先を作成できません: " + travel + "。Driveの接続状態を確認してください。詳細: " + e.message); }
    }
    return travel;
}
function getExportTimestampGuide(fso, travel, startedAt) {
    var taskPath = fso.BuildPath(travel, "TASKS.md");
    var metaPath = fso.BuildPath(travel, ".mery-chromebook-travel.json");
    if (!fso.FileExists(taskPath) || !fso.FileExists(metaPath)) return "タイムスタンプ確認: 出力ファイルの更新時刻を取得できません。Drive同期完了は未確認です。";
    try {
        var meta = JSON.parse(readStatus(metaPath).replace(/^\uFEFF/, ""));
        var exportedAt = new Date(meta.exportedAt);
        var taskAt = new Date(fso.GetFile(taskPath).DateLastModified);
        var metaAt = new Date(fso.GetFile(metaPath).DateLastModified);
        var fresh = taskAt.getTime() >= startedAt.getTime() - 3000 && metaAt.getTime() >= startedAt.getTime() - 3000;
        var aligned = !isNaN(exportedAt.getTime()) && Math.abs(metaAt.getTime() - exportedAt.getTime()) <= 120000;
        if (!fresh || !aligned) return "タイムスタンプ確認: 今回のローカル書き出し時刻と一致しません。Drive同期完了は未確認です。";
        return "今回のローカル更新時刻を確認しました。TASKS.md: " + formatTimestamp(taskAt) + " / 管理情報: " + formatTimestamp(metaAt) + "。この時刻はPC内のDriveフォルダーへの書き込み時刻です。クラウド同期完了を示すものではありません。";
    } catch (e) { return "タイムスタンプ確認に失敗しました: " + e.message + "。Drive同期完了は未確認です。"; }
}
function formatTimestamp(value) {
    function pad(number) { return number < 10 ? "0" + number : String(number); }
    return value.getFullYear() + "/" + pad(value.getMonth() + 1) + "/" + pad(value.getDate()) + " " + pad(value.getHours()) + ":" + pad(value.getMinutes()) + ":" + pad(value.getSeconds());
}
function resolveTasksDocument(fso) {
    var target = fso.GetAbsolutePathName(HUB_DIR + "\\TASKS.md").toLowerCase();
    var meryEditor = getMeryEditor();
    var active = meryEditor.ActiveDocument;
    if (active && active.FullName && fso.GetFileName(active.FullName).toLowerCase() === "tasks.md") {
        var activePath = fso.GetAbsolutePathName(active.FullName).toLowerCase();
        if (activePath !== target) throw new Error("表示中のTASKS.mdとマクロのコピー元が違います。表示中: " + active.FullName + " / コピー元: " + fso.GetAbsolutePathName(HUB_DIR + "\\TASKS.md") + "。正しいTASKS.mdを開いてから再実行してください。");
        return active;
    }
    for (var i = 0; i < meryEditor.Documents.Count; i++) {
        var doc = meryEditor.Documents.Item(i);
        if (doc.FullName && fso.GetAbsolutePathName(doc.FullName).toLowerCase() === target) return doc;
    }
    throw new Error("コピー元のTASKS.mdがMeryで開かれていません: " + fso.GetAbsolutePathName(HUB_DIR + "\\TASKS.md") + "。正しいファイルを開いて再実行してください。");
}
function saveTasks(fso, doc) {
    if (!doc || !doc.FullName) throw new Error("コピー元のTASKS.mdを確認できません。");
    if (!doc.Saved) doc.Save(doc.FullName);
    if (!doc.Saved) throw new Error("表示中のTASKS.mdを保存できませんでした。コピーを中止しました。");
    var diskText = readTaskFile(doc.FullName);
    if (normalizeTaskText(doc.Text) !== normalizeTaskText(diskText)) throw new Error("保存後のTASKS.mdがMeryの表示内容と一致しません。コピーを中止しました。");
}
function readTaskFile(path) {
    var stream = new ActiveXObject("ADODB.Stream");
    try { stream.Type = 2; stream.Charset = "utf-8"; stream.Open(); stream.LoadFromFile(path); return stream.ReadText().replace(/^\uFEFF/, ""); }
    finally { if (stream.State !== 0) stream.Close(); }
}
function normalizeTaskText(value) { return String(value).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"); }
function quote(value) { if (/["\r\n%]/.test(value)) throw new Error("パスに対応していない文字があります。"); return '"' + value + '"'; }
function readStatus(path) {
    if (!new ActiveXObject("Scripting.FileSystemObject").FileExists(path)) return "";
    var stream = new ActiveXObject("ADODB.Stream");
    try { stream.Type=2; stream.Charset="utf-8"; stream.Open(); stream.LoadFromFile(path); return stream.ReadText(); }
    finally { if (stream.State !== 0) stream.Close(); }
}
function getMeryEditor() {
    if (typeof Editor !== "undefined") return Editor;
    if (typeof editor !== "undefined") return editor;
    throw new Error("Meryのエディターオブジェクトを取得できません。");
}
function confirmAction(message) {
    return new ActiveXObject("WScript.Shell").Popup(String(message), 0, "Mery TODO", 4 + 32) === 6;
}
function showMessage(message) {
    new ActiveXObject("WScript.Shell").Popup(String(message), 0, "Mery TODO", 0x30);
}
