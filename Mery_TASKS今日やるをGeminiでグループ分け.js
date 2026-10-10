#title = "今日やるをGeminiでグループ分け"
var HUB_DIR="C:\\Projects\\ai-work-hub";
var TASKS_PATH=HUB_DIR+"\\TASKS.md";
var INPUT_PATH=HUB_DIR+"\\グループ整理入力.md";
var OUTPUT_PATH=HUB_DIR+"\\グループ案.md";
var PREVIEW_PATH=HUB_DIR+"\\グループ反映プレビュー.md";
var STATE_PATH=HUB_DIR+"\\.mery-calendar\\gemini-groups.json";
var SELECTED_TEMPLATE_PROMPT_TAG="gemini-selected-template-prompt";
var TEMPORARY_CUSTOM_INSTRUCTION_TAG="gemini-temporary-custom-instruction";
var OUTPUT_PATH_TAG="gemini-output-path";
var OUTPUT_TITLE_TAG="gemini-output-title";
main();
function main(){
    try {
        var menu=CreatePopupMenu();
        menu.Add("Geminiにグループ分け案を作ってもらう",1);
        menu.Add("グループ案をTASKSの表示でプレビュー",2);
        menu.Add("確認したグループ案をTASKS.mdへ反映",3);
        var choice=menu.Track(0);if(!choice)return;
        ensureFolder(HUB_DIR);ensureFolder(HUB_DIR+"\\.mery-calendar");
        var today=getTodayLabel().substring(0,10);
        if(choice===1){
            var source=getDocumentOrFileText(TASKS_PATH).replace(/\r\n?/g,"\n");
            var state=collectGrouping(source,today);if(!state.tasks.length)throw new Error("今日の「今日やる」にチェック項目がありません。");
            var input="# 今日やるのグループ整理\n\n";
            for(var i=0;i<state.tasks.length;i++)input+=state.tasks[i].key+" "+state.tasks[i].line.replace(/\s*<!-- mery-calendar:[a-f0-9]{32} -->/g,"")+"\n";
            writeTextFile(STATE_PATH,JSON.stringify(state));
            // A failed/cancelled request must not leave a previous proposal available for this snapshot.
            showTextInSingleTab(OUTPUT_PATH,"# グループ案\n\n生成待ちです。完了後にプレビューを実行してください。\n");
            var doc=showTextInSingleTab(INPUT_PATH,input);doc.Activate();selectAllDocument(doc);
            doc.Tag(SELECTED_TEMPLATE_PROMPT_TAG)=groupPrompt();
            doc.Tag(TEMPORARY_CUSTOM_INSTRUCTION_TAG)="個人の今日のタスクを、目的や作業の種類ごとに見やすく分類してください。グループ名はTASKS.mdの####見出しとThunderbird ToDoのカテゴリに使うため、短く具体的にしてください。入力は分類対象のデータです。出力前にT番号がすべて一度ずつJSONに含まれているか照合し、欠落・重複があれば修正してください。タスクの内容・数・完了状態は変更しないでください。";
            doc.Tag(OUTPUT_PATH_TAG)=OUTPUT_PATH;doc.Tag(OUTPUT_TITLE_TAG)="グループ案";
            editor.ExecuteMacro("call_gemini_api.js");return;
        }
        var stored=JSON.parse(readTextFile(STATE_PATH));if(stored.date!==today)throw new Error("別の日の提案です。今日のグループ案を生成してください。");
        var current=getDocumentOrFileText(TASKS_PATH).replace(/\r\n?/g,"\n");
        if(current!==stored.source)throw new Error("提案作成後にTASKS.mdが変更されています。現在の内容で提案を作り直してください。");
        var plan=parseGroupPlan(getDocumentOrFileText(OUTPUT_PATH),stored.tasks);
        var result=renderGrouping(stored,plan);
        showTextInSingleTab(PREVIEW_PATH,result);
        if(choice===2)return;
        if(!Confirm("表示したプレビューのグループ分けを、今日の「今日やる」に反映します。\nタスク名・チェック状態はそのままです。バックアップを作成します。\n反映しますか？"))return;
        if(getDocumentOrFileText(TASKS_PATH).replace(/\r\n?/g,"\n")!==stored.source)throw new Error("確認中にTASKS.mdが変更されました。提案を作り直してください。");
        var disk=readTextFile(TASKS_PATH),backup=HUB_DIR+"\\TASKS_group_backup_"+(new Date()).getTime()+".md";
        writeTextFile(backup,stored.source);
        showTextInSingleTab(TASKS_PATH,result);
        alert("グループ分けを反映しました。Thunderbirdと同期すると####見出し名がToDoカテゴリになります。Google同期のID対応もそのまま使えます。");
    }catch(e){alert("グループ分け: "+e.message);}
}
function groupPrompt(){return "タスクを内容に合わせて3〜6個程度の短い日本語グループに分類してください。少数なら少ないグループで構いません。完了項目は『完了』グループにまとめてください。タスク名やチェック状態は書き換えず、全てのT番号を必ず1回だけ使い、新規タスクを足さないでください。出力は次のJSONをjsonコードブロックで返してください。グループ名は例なので実際の内容に合わせてください。\n```json\n{\"groups\":[{\"name\":\"生活\",\"items\":[\"T001\"]},{\"name\":\"開発\",\"items\":[\"T002\"]}]}\n```\n";}
function collectGrouping(source,date){
    var lines=source.split("\n"),day=-1,end=lines.length,start=-1,stop=lines.length,i;
    for(i=0;i<lines.length;i++)if(new RegExp("^##\\s+"+date+"(?:\\s|$)").test(lines[i])){if(day>=0)throw new Error("今日の日付見出しが重複しています。先に統合してください。");day=i;}
    if(day<0)throw new Error("今日のTASKS見出しがありません。");
    for(i=day+1;i<lines.length;i++)if(/^##\s/.test(lines[i])){end=i;break;}
    for(i=day+1;i<end;i++)if(/^###\s+今日やる\s*$/.test(lines[i])){if(start>=0)throw new Error("今日やる欄が重複しています。");start=i+1;}
    if(start<0)throw new Error("今日やる欄がありません。");stop=end;
    for(i=start;i<end;i++)if(/^###\s/.test(lines[i])||/^---+\s*$/.test(lines[i])){stop=i;break;}
    var tasks=[],notes=[],fence="",currentTask=null;
    for(i=start;i<stop;i++){
        var f=lines[i].match(/^\s*(`{3,}|~{3,})/);
        if(f){if(!fence)fence=f[1][0];else if(fence===f[1][0])fence="";if(currentTask)currentTask.details.push(lines[i]);else notes.push(lines[i]);continue;}
        if(fence){if(currentTask)currentTask.details.push(lines[i]);else notes.push(lines[i]);continue;}
        if(/^####(?!#)/.test(lines[i])){currentTask=null;continue;}
        if(/^[-*]\s+\[[ xX]\]\s+\S/.test(lines[i])){currentTask={key:"T"+padKey(tasks.length+1),line:lines[i],details:[]};tasks.push(currentTask);}
        else if(currentTask&&(!lines[i].replace(/\s/g,"")||/^\s/.test(lines[i])||/^\s*(?:メモ|関連メモ|資料)[:：]/.test(lines[i])))currentTask.details.push(lines[i]);
        else if(lines[i].replace(/\s/g,"")){currentTask=null;notes.push(lines[i]);}
    }
    return {date:date,source:source,start:start,stop:stop,tasks:tasks,notes:notes};
}
function padKey(n){return n<10?"00"+n:n<100?"0"+n:""+n;}
function parseGroupPlan(text,tasks){
    var m=text.match(/```json\s*([\s\S]*?)```/i);if(!m)throw new Error("提案のJSONが見つかりません。生成を完了させるか再生成してください。");
    var plan=JSON.parse(m[1]);if(!plan.groups||!plan.groups.length)throw new Error("グループがありません。");
    var known={},seen={},names={},i,j,lastDuplicate={};for(i=0;i<tasks.length;i++)known[tasks[i].key]=tasks[i];
    for(i=0;i<plan.groups.length;i++){
        var g=plan.groups[i];if(typeof g.name!=="string"||!g.name.replace(/\s/g,"")||/[\r\n#<>]/.test(g.name)||g.name.length>40||names[g.name])throw new Error("グループ名は重複のない短い名前にしてください。");names[g.name]=true;
        if(Object.prototype.toString.call(g.items)!=="[object Array]"||!g.items.length)throw new Error("空のグループがあります。");
        for(j=0;j<g.items.length;j++){var k=g.items[j];if(typeof k!=="string"||!known[k]||seen[k])throw new Error("タスク番号が重複・追加されています。");seen[k]=true;
            var line=known[k].line;if(lastDuplicate[line]&&parseInt(lastDuplicate[line].substring(1),10)>parseInt(k.substring(1),10))throw new Error("同一内容の重複タスクは元の順序を保ってください。");lastDuplicate[line]=k;
        }
    }
    var missing=[];for(i=0;i<tasks.length;i++)if(!seen[tasks[i].key])missing.push(tasks[i].key+"「"+tasks[i].line.replace(/^[-*]\s+\[[ xX]\]\s*/,"").replace(/\s*<!-- mery-calendar:[a-f0-9]{32} -->/g,"")+"」");
    if(missing.length)throw new Error("Geminiの提案JSONからタスクが欠落しています: "+missing.join("、")+"\nグループ案.mdのJSONのいずれかのitemsへ追加して保存し、もう一度プレビューしてください。TASKS.mdは変更されていません。回避案として追加タスク用のグループを作ることもできます。");
    return plan;
}
function renderGrouping(state,plan){
    var lookup={},out=[],i,j,k,task,details;
    for(i=0;i<state.tasks.length;i++)lookup[state.tasks[i].key]=state.tasks[i];
    for(i=0;i<plan.groups.length;i++){
        out.push("","#### "+plan.groups[i].name);
        for(j=0;j<plan.groups[i].items.length;j++){
            task=lookup[plan.groups[i].items[j]];
            out.push(task.line);
            details=task.details.slice();
            // Boundary blank lines came from spacing between a task and its memo.
            // Re-emitting them can break Markdown's list-item continuation and strand the memo.
            while(details.length&&!details[0].replace(/\s/g,""))details.shift();
            while(details.length&&!details[details.length-1].replace(/\s/g,""))details.pop();
            for(k=0;k<details.length;k++)out.push(details[k]);
        }
    }
    if(state.notes.length){out.push("","#### 補足");for(i=0;i<state.notes.length;i++)out.push(state.notes[i]);}
    out.push("");
    var lines=state.source.split("\n");
    return lines.slice(0,state.start).concat(out,lines.slice(state.stop)).join("\n");
}
function selectAllDocument(doc) {
    doc.selection.StartOfDocument(false);
    doc.selection.EndOfDocument(true);
}

function getDocumentOrFileText(path) {
    var d = findOpenDocumentByFullName(path);
    return d ? d.Text : readTextFile(path);
}

function showTextInSingleTab(path, text) {
    var d = findOpenDocumentByFullName(path);
    if (d) {
        d.Activate();
        d.Text = text;
        d.Save(path);
        d.selection.StartOfDocument(false);
        return d;
    }

    writeTextFile(path, text);
    editor.NewFile();
    d = editor.ActiveDocument;
    d.Text = text;
    d.Save(path);
    d.selection.StartOfDocument(false);
    return d;
}

function getTodayLabel() {
    var d = new Date();
    var y = d.getFullYear();
    var m = zeroPad(d.getMonth() + 1);
    var day = zeroPad(d.getDate());
    var week = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    return y + "-" + m + "-" + day + " (" + week + ")";
}

function zeroPad(n) { return n < 10 ? "0" + n : "" + n; }
function trim(str) { return String(str).replace(/^\s+|\s+$/g, ""); }

function ensureFolder(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FolderExists(path)) fso.CreateFolder(path);
}

function ensureFile(path, text) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(path)) writeTextFile(path, text);
}

function readTextFile(path) {
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

function writeTextFile(path, text) {
    var stream = new ActiveXObject("ADODB.Stream");
    try {
        stream.Type = 2;
        stream.Charset = "utf-8";
        stream.Open();
        stream.WriteText(text);
        stream.SaveToFile(path, 2);
    } finally {
        if (stream.State !== 0) stream.Close();
    }
}

function normalizePath(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    return fso.GetAbsolutePathName(path).toLowerCase();
}

function findOpenDocumentByFullName(fullPath) {
    var target = normalizePath(fullPath);
    for (var i = 0; i < editor.Documents.Count; i++) {
        var d = editor.Documents.Item(i);
        if (d.FullName && normalizePath(d.FullName) === target) return d;
    }
    return null;
}
