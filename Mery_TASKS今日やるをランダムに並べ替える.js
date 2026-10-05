#title = "今日やるをランダムに並べ替える"
var HUB_DIR="C:\\Projects\\ai-work-hub";
var TASKS_PATH=HUB_DIR+"\\TASKS.md";
main();
function main(){
    try{
        var menu=CreatePopupMenu();menu.Add("今日やるの順番をランダムにする",1);if(menu.Track(0)!==1)return;
        var fso=new ActiveXObject("Scripting.FileSystemObject");
        if(fso.FileExists(HUB_DIR+"\\.mery-calendar\\sync.lock"))throw new Error("同期中です。同期が完了してから実行してください。");
        var source=getDocumentOrFileText(TASKS_PATH),today=getTodayLabel().substring(0,10);
        var result=randomizeThreeTimes(source,today);
        if(result===source){alert("並べ替えできる項目がないか、同じ並びになりました。必要ならもう一度実行してください。");return;}
        writeTextFile(HUB_DIR+"\\TASKS_random_backup_"+new Date().getTime()+".md",source);
        showTextInSingleTab(TASKS_PATH,result);
    }catch(e){alert("並べ替え: "+e.message);}
}
// Node.js の OS 由来の乱数をまとめて取得する。整数の抽選は剰余の偏りを除く。
function randomizeThreeTimes(source,date){
    var result=source,random;
    for(var round=0;round<3;round++){
        random=createSecureRandom(true);
        result=randomizeToday(result,date,random);
    }
    // 3回目の乱数を再利用し、元と同じ並びなら再抽選する。
    for(var attempt=0;attempt<64&&result===source;attempt++)result=randomizeToday(result,date,random);
    return result;
}
function createSecureRandom(randomizedTiming){
    var shell=new ActiveXObject("WScript.Shell"),hex="",offset=0,first=true;
    function nextUint32(){
        if(offset>=hex.length){
            var delay=first&&randomizedTiming?"Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,require('node:crypto').randomInt(100,601));":"";
            var process=shell.Exec("node -e \""+delay+"process.stdout.write(require('node:crypto').randomBytes(16384).toString('hex'))\"");
            hex=process.StdOut.ReadAll();
            var error=process.StdErr.ReadAll();
            if(error||!/^([0-9a-f]{8})+$/.test(hex))throw new Error("乱数を取得できません。Node.js を確認してください。 "+error);
            offset=0;first=false;
        }
        var value=parseInt(hex.substr(offset,8),16);offset+=8;return value;
    }
    var random=function(){return nextUint32()/4294967296;};
    random.integer=function(size){
        if(size<1||size>4294967296||Math.floor(size)!==size)throw new Error("抽選範囲が不正です。");
        var limit=4294967296-(4294967296%size),value;
        do{value=nextUint32();}while(value>=limit);
        return value%size;
    };
    if(randomizedTiming)nextUint32();
    return random;
}
function shuffled(items,random){var result=items.slice(0);for(var i=result.length-1;i>0;i--){var j=random.integer?random.integer(i+1):Math.floor(random()*(i+1)),value=result[i];result[i]=result[j];result[j]=value;}return result;}
function shuffleTaskRuns(lines,random){
    var tokens=[],blocks=[],i=0;
    while(i<lines.length){
        if(/^[-*]\s+\[[ xX]\]\s+\S/.test(lines[i])){
            var block=[lines[i++]];
            while(i<lines.length&&/^\s+\S/.test(lines[i]))block.push(lines[i++]);
            tokens.push({task:true});blocks.push(block);
        }else tokens.push({line:lines[i++]});
    }
    var mixed=shuffled(blocks,random),out=[],next=0;
    for(i=0;i<tokens.length;i++)out=tokens[i].task?out.concat(mixed[next++]):out.concat([tokens[i].line]);
    return out;
}
function randomizeToday(source,date,random){
    var newline=source.indexOf("\r\n")>=0?"\r\n":"\n",lines=source.replace(/\r\n?/g,"\n").split("\n"),day=-1,end=lines.length,start=-1,stop,i;
    for(i=0;i<lines.length;i++)if(new RegExp("^##\\s+"+date+"(?:\\s|$)").test(lines[i])){if(day>=0)throw new Error("今日の見出しが重複しています。先に統合してください。");day=i;}
    if(day<0)throw new Error("今日の日付のTASKS見出しがありません。");
    for(i=day+1;i<lines.length;i++)if(/^##\s/.test(lines[i])){end=i;break;}
    for(i=day+1;i<end;i++)if(/^###\s+今日やる\s*$/.test(lines[i])){if(start>=0)throw new Error("今日やる欄が重複しています。");start=i+1;}
    if(start<0)throw new Error("今日やる欄がありません。");stop=end;
    for(i=start;i<end;i++)if(/^###\s/.test(lines[i])||/^---+\s*$/.test(lines[i])){stop=i;break;}
    var body=lines.slice(start,stop),seen={},fence=false;
    for(i=0;i<body.length;i++){
        if(/^\s*(`{3,}|~{3,})/.test(body[i]))fence=true;
        var task=body[i].match(/^[-*]\s+\[[ xX]\]\s+(.+)$/);
        if(task){var key=task[1].replace(/\s*<!-- mery-calendar:[a-f0-9]{32} -->/g,"");if(seen[key])throw new Error("同期IDを保つため、同名のタスクは名前を区別してから並べ替えてください。");seen[key]=true;}
    }
    if(fence)throw new Error("今日やる内にコードブロックがあります。コードを別の欄へ移してから実行してください。");
    var prefix=[],groups=[],group=null;
    for(i=0;i<body.length;i++){if(/^####\s/.test(body[i])){group=[];groups.push(group);}if(group)group.push(body[i]);else prefix.push(body[i]);}
    var movable=[],slots=[];
    for(i=0;i<groups.length;i++)if(groups[i].some(function(line){return /^[-*]\s+\[[ xX]\]\s+\S/.test(line);})){slots.push(i);movable.push(shuffleTaskRuns(groups[i],random));}
    movable=shuffled(movable,random);for(i=0;i<slots.length;i++)groups[slots[i]]=movable[i];
    var output=shuffleTaskRuns(prefix,random);for(i=0;i<groups.length;i++)output=output.concat(groups[i]);
    return lines.slice(0,start).concat(output,lines.slice(stop)).join(newline);
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
