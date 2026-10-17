#title = "GPT回答をTASKS案へ取り込む"
var HUB_DIR = "C:\\Projects\\ai-work-hub";
var OUTPUT_PATH = HUB_DIR + "\\TASKS案.md";
var CLIPBOARD_PATH = HUB_DIR + "\\GPT回答_クリップボード.md";
main();
function main() {
    try {
        var shell = new ActiveXObject("WScript.Shell");
        var command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"Get-Clipboard -Raw | Set-Content -LiteralPath '" + CLIPBOARD_PATH + "' -Encoding UTF8\"";
        if (shell.Run(command, 0, true) !== 0) throw new Error("クリップボードから回答を読み取れませんでした。");
        var response = readTextFile(CLIPBOARD_PATH).replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "");
        if (!response) throw new Error("クリップボードが空です。GPTの回答全体をコピーしてください。");
        response = extractMarkdownAnswer(response);
        if (/^#\s*PRIORITY案\s*$/m.test(response)) throw new Error("これは優先度案です。PRIORITY案.mdはGPT APIマクロが自動保存します。TASKS案.mdには取り込みませんでした。");
        if (/^#\s*グループ案\s*$/m.test(response) || /\"groups\"\s*:/m.test(response)) throw new Error("これはグループ案です。グループ案.mdはGPT APIマクロが自動保存します。TASKS案.mdには取り込みませんでした。");
        var sectionCount = countTasksSections(response);
        if (sectionCount === 0) {
            if (!/^\s*[-*]\s+\[[ xX]\]\s+\S/m.test(response)) {
                throw new Error("TASKS案の見出しやチェック項目が見つかりません。GPT回答全体をコピーしてください。TASKS案.mdは変更していません。");
            }
            if (!confirmYesNo("見出しのないチェック項目が見つかりました。\n「今日やる」としてTASKS案.mdへ取り込みますか？\n\nTASKS.md本体は変更されません。")) return;
            response = "# TASKS案\n\n## 今日やる\n" + response;
        } else if (!/^#\s+TASKS案\s*$/m.test(response)) {
            response = "# TASKS案\n\n" + response;
        }
        if (!confirmYesNo("クリップボードの回答をTASKS案.mdへ保存します。\n\nTASKS.md本体はまだ変更されません。\n続けますか？")) return;
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        if (fso.FileExists(OUTPUT_PATH)) writeTextFile(HUB_DIR + "\\TASKS案_before_GPT_import_" + timestamp() + ".md", readTextFile(OUTPUT_PATH));
        writeTextFile(OUTPUT_PATH, response + "\n");
        var doc = findOpenDocumentByFullName(OUTPUT_PATH);
        if (doc) { doc.Activate(); doc.Text = response + "\n"; doc.Save(OUTPUT_PATH); }
        else { editor.NewFile(); doc = editor.ActiveDocument; doc.Text = response + "\n"; doc.Save(OUTPUT_PATH); }
        new ActiveXObject("WScript.Shell").Popup("GPT回答をTASKS案.mdへ保存しました。\n確認後、「TASKS案を今日のTASKSへ反映」を実行してください。", 0, "Mery TODO", 64);
    } catch (e) { new ActiveXObject("WScript.Shell").Popup("GPT回答の取り込みに失敗しました。\n" + e.message, 0, "Mery TODO", 48); }
}
function extractMarkdownAnswer(text) {
    var value = String(text || "").replace(/^\s+|\s+$/g, "");
    var fenced = value.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) value = fenced[1].replace(/^\s+|\s+$/g, "");
    var heading = value.search(/^#\s+(?:TASKS案|PRIORITY案|グループ案)\s*$/m);
    if (heading > 0) value = value.substring(heading);
    return value;
}
function countTasksSections(text) {
    var names = ["今日やる", "次にやる", "後で", "置く", "確認が必要", "メモ", "統合候補", "LOG候補"];
    var count = 0;
    for (var i = 0; i < names.length; i++) {
        if (new RegExp("^##\\s+" + names[i] + "\\s*$", "m").test(text)) count++;
    }
    return count;
}
function confirmYesNo(m) { return new ActiveXObject("WScript.Shell").Popup(String(m),0,"TASKS案へ取り込む",4+32)===6; }
function timestamp() { var d=new Date(); function p(n){return n<10?"0"+n:""+n;} return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+"_"+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds()); }
function readTextFile(p) { var s=new ActiveXObject("ADODB.Stream"); try{s.Type=2;s.Charset="utf-8";s.Open();s.LoadFromFile(p);return s.ReadText().replace(/^\uFEFF/,"");}finally{if(s.State!==0)s.Close();} }
function writeTextFile(p,t) { var s=new ActiveXObject("ADODB.Stream"); try{s.Type=2;s.Charset="utf-8";s.Open();s.WriteText(t);s.SaveToFile(p,2);}finally{if(s.State!==0)s.Close();} }
function normalizePath(p) { return new ActiveXObject("Scripting.FileSystemObject").GetAbsolutePathName(p).toLowerCase(); }
function findOpenDocumentByFullName(p) { var target=normalizePath(p);for(var i=0;i<editor.Documents.Count;i++){var d=editor.Documents.Item(i);if(d.FullName&&normalizePath(d.FullName)===target)return d;}return null; }
