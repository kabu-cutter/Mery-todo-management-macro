#title = "今日やるをGPTまたはGeminiでグループ分け"
var HUB_DIR="C:\\Projects\\ai-work-hub";
var TASKS_PATH=HUB_DIR+"\\TASKS.md";
var INPUT_PATH=HUB_DIR+"\\グループ整理入力.md";
var OUTPUT_PATH=HUB_DIR+"\\グループ案.md";
var OPENAI_CALL_MACRO="call_openai_api.js";
var PREVIEW_PATH=HUB_DIR+"\\グループ反映プレビュー.md";
var STATE_PATH=HUB_DIR+"\\.mery-calendar\\gemini-groups.json";
var PENDING_REQUEST_PATH=HUB_DIR+"\\.mery-calendar\\pending-mery-ai-request.json";
var SELECTED_TEMPLATE_PROMPT_TAG="gemini-selected-template-prompt";
var TEMPORARY_CUSTOM_INSTRUCTION_TAG="gemini-temporary-custom-instruction";
var OUTPUT_PATH_TAG="gemini-output-path";
var OUTPUT_TITLE_TAG="gemini-output-title";
function showMacroMessage(message) {
    new ActiveXObject("WScript.Shell").Popup(String(message), 0, "Mery TODO", 48);
}

function confirmMacroYesNo(message) {
    return new ActiveXObject("WScript.Shell").Popup(String(message), 0, "Mery TODO", 4 + 32) === 6;
}
main();
function main(){
    try {
        var choice=chooseGroupAction();if(!choice)return;
        ensureFolder(HUB_DIR);ensureFolder(HUB_DIR+"\\.mery-calendar");
        var today=getTodayLabel().substring(0,10);
        if(choice===1){
            var provider=chooseAIProvider();if(!provider)return;
            var source=getDocumentOrFileText(TASKS_PATH).replace(/\r\n?/g,"\n");
            var state=collectGrouping(source,today);if(!state.tasks.length)throw new Error("「今日やる」のTODOは、すべて既存カテゴリに入っています。");
            var input="# 今日やるのグループ整理\n\n";
            for(var i=0;i<state.tasks.length;i++)input+=state.tasks[i].key+" ["+state.tasks[i].section+"] "+state.tasks[i].line.replace(/\s*<!-- mery-calendar:[a-f0-9]{32} -->/g,"")+"\n";
            writeTextFile(STATE_PATH,JSON.stringify(state));
            // 子マクロでは editor / Editor が渡されない場合がある。
            // API 呼び出しは親の作業メニューへ依頼し、ここではファイルだけ準備する。
            writeTextFile(OUTPUT_PATH,"# グループ案\n\n生成待ちです。完了後にプレビューを実行してください。\n");
            writeTextFile(PREVIEW_PATH,"# グループ反映プレビュー\n\n以前のプレビューは無効です。新しいグループ案の生成後に、もう一度プレビューしてください。\n");
            writeTextFile(INPUT_PATH,input);
            writeTextFile(PENDING_REQUEST_PATH,JSON.stringify({
                action:"ai",
                provider:provider,
                inputPath:INPUT_PATH,
                outputPath:OUTPUT_PATH,
                outputTitle:"グループ案",
                prompt:groupPrompt(),
                instruction:"個人の今日の『今日やる』にある、まだカテゴリへ入っていないTODOだけを分類してください。グループ名はTASKS.mdの####見出しとThunderbird ToDoのカテゴリに使うため、短く具体的にしてください。入力は分類対象のデータです。出力前にT番号がすべて一度ずつJSONに含まれているか照合し、欠落・重複があれば修正してください。タスクの内容・数・完了状態・所属欄は変更しないでください。"
            }));
            return;
        }
        var stored=JSON.parse(readTextFile(STATE_PATH));if(stored.date!==today)throw new Error("別の日の提案です。今日のグループ案を生成してください。");
        if(stored.scopeVersion!==4)throw new Error("保存済みの案は『確認が必要』も分類対象にした旧形式です。現在の正本に合わせてグループ案を作り直してください。");
        var current=getDocumentOrFileText(TASKS_PATH).replace(/\r\n?/g,"\n");
        if(current!==stored.source)throw new Error("提案作成後にTASKS.mdが変更されています。現在の内容で提案を作り直してください。");
        var plan=parseGroupPlan(getDocumentOrFileText(OUTPUT_PATH),stored.tasks);
        if(plan.autoRepairMessage)showMacroMessage(plan.autoRepairMessage);
        var result=renderGrouping(stored,plan);
        showTextInSingleTab(PREVIEW_PATH,result);
        if(choice===2){
            writeTextFile(PENDING_REQUEST_PATH,JSON.stringify({action:"open",path:PREVIEW_PATH}));
            return;
        }
        if(!confirmMacroYesNo("表示したプレビューのグループ分けを反映します。\n『今日やる』の未分類TODOだけを移動します。\n『次にやる』『後で』『置く』『確認が必要』と、既存の見出し・カテゴリ・メモ・入れ子項目は保持します。\nバックアップを作成します。\n反映しますか？"))return;
        if(getDocumentOrFileText(TASKS_PATH).replace(/\r\n?/g,"\n")!==stored.source)throw new Error("確認中にTASKS.mdが変更されました。提案を作り直してください。");
        var disk=readTextFile(TASKS_PATH),backup=HUB_DIR+"\\TASKS_group_backup_"+(new Date()).getTime()+".md";
        writeTextFile(backup,stored.source);
        writeOrUpdateText(TASKS_PATH,result);
        showMacroMessage("グループ分けを反映しました。Thunderbirdと同期すると####見出し名がToDoカテゴリになります。Google同期のID対応もそのまま使えます。");
    }catch(e){showMacroMessage("グループ分け: "+e.message);}
}
function chooseAIProvider(){
    var selected=new ActiveXObject("WScript.Shell").Popup("使用するAIを選んでください。\n\n［はい］GPT API\n［いいえ］Gemini API\n［キャンセル］中止",0,"グループ分け",3+32);
    if(selected===6)return "openai";
    if(selected===7)return "gemini";
    return "";
}
function chooseGroupAction(){
    var shell=new ActiveXObject("WScript.Shell");
    var first=shell.Popup("グループ分けの操作を選んでください。\n\n［はい］AIにグループ分け案を作ってもらう\n［いいえ］プレビュー・反映へ進む\n［キャンセル］中止",0,"グループ分け",3+32);
    if(first===6)return 1;
    if(first!==7)return 0;
    var second=shell.Popup("保存済みのグループ案をどうしますか？\n\n［はい］TASKSの表示でプレビュー\n［いいえ］確認済みの案をTASKS.mdへ反映\n［キャンセル］中止",0,"グループ分け",3+32);
    if(second===6)return 2;
    if(second===7)return 3;
    return 0;
}
function groupPrompt(){return "『今日やる』にあるカテゴリ未設定のタスクを、内容に合わせて3〜6個程度の短い日本語グループに分類してください。『次にやる』『後で』『置く』『確認が必要』は分類対象ではありません。反映時も既存カテゴリとメモ構造は保持されます。少数なら少ないグループで構いません。完了項目は『完了』グループにまとめてください。タスク名やチェック状態は書き換えず、全てのT番号を必ず1回だけ使い、新規タスクを足さないでください。出力は次のJSONをjsonコードブロックで返してください。グループ名は例なので実際の内容に合わせてください。\n```json\n{\"groups\":[{\"name\":\"生活\",\"items\":[\"T001\"]},{\"name\":\"開発\",\"items\":[\"T002\"]}]}\n```\n";}
function collectGrouping(source,date){
    var lines=source.split("\n"),day=-1,end=lines.length,i;
    for(i=0;i<lines.length;i++)if(new RegExp("^##\\s+"+date+"(?:\\s|$)").test(lines[i])){if(day>=0)throw new Error("今日の日付見出しが重複しています。先に統合してください。");day=i;}
    if(day<0)throw new Error("今日のTASKS見出しがありません。");
    for(i=day+1;i<lines.length;i++)if(/^##\s/.test(lines[i])){end=i;break;}
    var found={},sections=[],tasks=[];
    for(i=day+1;i<end;i++){
        var heading=lines[i].match(/^###\s+(今日やる)\s*$/);
        if(!heading)continue;
        var name=heading[1];
        if(found[name])throw new Error(name+"欄が重複しています。");
        var start=i+1,stop=end,j;
        for(j=start;j<end;j++)if(/^###\s/.test(lines[j])||/^---+\s*$/.test(lines[j])){stop=j;break;}
        var section={name:name,start:start,stop:stop,tasks:[],notes:[]};
        collectGroupingSection(lines,section,tasks);
        sections.push(section);found[name]=section;
    }
    if(!found["今日やる"])throw new Error("今日やる欄がありません。");
    sections.sort(function(a,b){return a.start-b.start;});
    return {scopeVersion:4,date:date,source:source,start:found["今日やる"].start,stop:found["今日やる"].stop,tasks:tasks,notes:[],sections:sections};
}
function collectGroupingSection(lines,section,allTasks){
    var fence="",category="";
    for(var i=section.start;i<section.stop;i++){
        var f=lines[i].match(/^\s*(`{3,}|~{3,})/);
        if(f){if(!fence)fence=f[1][0];else if(fence===f[1][0])fence="";continue;}
        if(fence)continue;
        var categoryHeading=lines[i].match(/^####(?!#)\s*(.*?)\s*$/);
        if(categoryHeading){category=categoryHeading[1];continue;}
        if(/^[-*]\s+\[[ xX]\]\s+\S/.test(lines[i])){
            var blockEnd=findTaskBlockEnd(lines,i+1,section.stop);
            if(!category){
                var block=lines.slice(i,blockEnd);
                var task={key:"T"+padKey(allTasks.length+1),line:lines[i],details:block.slice(1),blockLines:block,blockStart:i,blockEnd:blockEnd,section:section.name};
                allTasks.push(task);section.tasks.push(task);
            }
            i=blockEnd-1;
        }
    }
}
function findTaskBlockEnd(lines,start,stop){
    var fence="";
    for(var i=start;i<stop;i++){
        var f=lines[i].match(/^\s*(`{3,}|~{3,})/);
        if(f){if(!fence)fence=f[1][0];else if(fence===f[1][0])fence="";continue;}
        if(fence)continue;
        if(/^####(?!#)/.test(lines[i])||/^[-*]\s+\[[ xX]\]\s+\S/.test(lines[i]))return i;
    }
    return stop;
}
function padKey(n){return n<10?"00"+n:n<100?"0"+n:""+n;}
function parseGroupPlan(text,tasks){
    var m=text.match(/```json\s*([\s\S]*?)```/i);if(!m)throw new Error("提案のJSONが見つかりません。生成を完了させるか再生成してください。");
    var plan=JSON.parse(m[1]);if(!plan.groups||!plan.groups.length)throw new Error("グループがありません。");
    var known={},seen={},names={},i,j,total=0,duplicates=[],unknown=[],missing=[];for(i=0;i<tasks.length;i++)known[tasks[i].key]=tasks[i];
    for(i=0;i<plan.groups.length;i++){
        var g=plan.groups[i];if(typeof g.name!=="string"||!g.name.replace(/\s/g,"")||/[\r\n#<>]/.test(g.name)||g.name.length>40||names[g.name])throw new Error("グループ名は重複のない短い名前にしてください。");names[g.name]=true;
        if(Object.prototype.toString.call(g.items)!=="[object Array]"||!g.items.length)throw new Error("空のグループがあります。");
        for(j=0;j<g.items.length;j++){
            var k=g.items[j];total++;
            if(typeof k!=="string"||!known[k]){unknown.push(String(k));continue;}
            if(seen[k])duplicates.push(k);else seen[k]=true;
        }
    }
    for(i=0;i<tasks.length;i++)if(!seen[tasks[i].key])missing.push(tasks[i].key);
    if(!unknown.length&&duplicates.length===1&&missing.length===1&&total===tasks.length){
        var duplicateId=duplicates[0],missingId=missing[0],repaired=false;
        for(i=plan.groups.length-1;i>=0&&!repaired;i--)for(j=plan.groups[i].items.length-1;j>=0;j--)if(plan.groups[i].items[j]===duplicateId){plan.groups[i].items[j]=missingId;repaired=true;break;}
        plan.autoRepairMessage="AI回答の番号誤りを補正しました（重複 "+duplicateId+" → 欠落 "+missingId+"）。内容の分類先はプレビューで確認してください。";
    }else if(unknown.length||duplicates.length){
        throw new Error("タスク番号を照合できません。"+(duplicates.length?" 重複: "+duplicates.join(", "):"")+(unknown.length?" 不明: "+unknown.join(", "):"")+(missing.length?" 欠落: "+missing.join(", "):"")+"。グループ案を作り直してください。");
    }else if(missing.length){
        throw new Error("AIの提案JSONからタスクが欠落しています: "+missing.join("、")+"。グループ案を作り直してください。TASKS.mdは変更されていません。");
    }
    seen={};var lastDuplicate={};
    for(i=0;i<plan.groups.length;i++)for(j=0;j<plan.groups[i].items.length;j++){
        k=plan.groups[i].items[j];
        if(!known[k]||seen[k])throw new Error("補正後もタスク番号を照合できません。グループ案を作り直してください。");
        seen[k]=true;
        var line=known[k].line;if(lastDuplicate[line]&&parseInt(lastDuplicate[line].substring(1),10)>parseInt(k.substring(1),10))throw new Error("同一内容の重複タスクは元の順序を保ってください。");lastDuplicate[line]=k;
    }
    return plan;
}
function renderGrouping(state,plan){
    var lookup={},i;
    for(i=0;i<state.tasks.length;i++)lookup[state.tasks[i].key]=state.tasks[i];
    var lines=state.source.split("\n");
    var sections=state.sections||[{name:"今日やる",start:state.start,stop:state.stop,tasks:state.tasks,notes:state.notes}],result=[],cursor=0;
    for(i=0;i<sections.length;i++){
        result=result.concat(lines.slice(cursor,sections[i].start));
        result=result.concat(renderGroupingSection(sections[i],plan,lookup,lines));
        cursor=sections[i].stop;
    }
    return result.concat(lines.slice(cursor)).join("\n");
}
function renderGroupingSection(section,plan,lookup,lines){
    if(!section.tasks.length)return lines.slice(section.start,section.stop);
    var out=[],i,j,task,hasGroup,cursor=section.start,tasks=section.tasks.slice();
    tasks.sort(function(a,b){return a.blockStart-b.blockStart;});
    for(i=0;i<tasks.length;i++){
        out=out.concat(lines.slice(cursor,tasks[i].blockStart));
        cursor=tasks[i].blockEnd;
    }
    out=out.concat(lines.slice(cursor,section.stop));
    if(out.length&&out[out.length-1].replace(/\s/g,""))out.push("");
    for(i=0;i<plan.groups.length;i++){
        hasGroup=false;
        for(j=0;j<plan.groups[i].items.length;j++){
            task=lookup[plan.groups[i].items[j]];
            if(task&&task.section===section.name){hasGroup=true;break;}
        }
        if(!hasGroup)continue;
        out.push("","#### "+plan.groups[i].name);
        for(j=0;j<plan.groups[i].items.length;j++){
            task=lookup[plan.groups[i].items[j]];
            if(!task||task.section!==section.name)continue;
            out=out.concat(task.blockLines);
        }
    }
    if(!out.length||out[out.length-1].replace(/\s/g,""))out.push("");
    return out;
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
    var app = getMeryEditorOrNull();
    if (!app) return null;
    app.NewFile();
    d = app.ActiveDocument;
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
    try {
        if (typeof document !== "undefined" && document.FullName && normalizePath(document.FullName) === target) return document;
    } catch (ignored) {}
    var app = getMeryEditorOrNull();
    if (!app) return null;
    for (var i = 0; i < app.Documents.Count; i++) {
        var d = app.Documents.Item(i);
        if (d.FullName && normalizePath(d.FullName) === target) return d;
    }
    return null;
}

function getMeryEditorOrNull() {
    if (typeof Editor !== "undefined") return Editor;
    if (typeof editor !== "undefined") return editor;
    return null;
}

function writeOrUpdateText(path, text) {
    var d = findOpenDocumentByFullName(path);
    if (d) {
        d.Text = text;
        d.Save(path);
        d.Activate();
        return;
    }
    writeTextFile(path, text);
}
