#title = "資料を追加"
var HUB_DIR = "C:\\Projects\\ai-work-hub";
var NOTES_DIR = HUB_DIR + "\\notes";

function memoLines(text) { return String(text).replace(/\r\n?/g, "\n").split("\n"); }
function memoTrim(text) { return String(text).replace(/^\s+|\s+$/g, ""); }
function memoTask(line) { return /^([ \t]*)[-*]\s+\[[ xX]\]\s+(.+)$/.exec(line); }
function memoIndent(line) { return (line.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ").length; }
function memoContext(text, top, bottom) {
    var lines = memoLines(text), task = -1, end = lines.length, i, match;
    if(top < 0 || top >= lines.length || bottom < top) throw new Error("カーソル位置を確認してください。");
    var fence = "", fenced = [];
    for(i = 0; i < lines.length; i++) {
        match = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
        if(match) { fenced[i] = true; if(!fence) fence = match[1].charAt(0); else if(fence === match[1].charAt(0)) fence = ""; }
        else fenced[i] = !!fence;
    }
    if(fenced[top]) throw new Error("コードブロック内では実行できません。");
    for(i = top; i >= 0; i--) {
        if(!fenced[i] && memoTask(lines[i])) { task = i; break; }
        if(!fenced[i] && /^\s*#{1,6}\s/.test(lines[i])) break;
    }
    if(task < 0) throw new Error("TODOの行、またはその直下のメモにカーソルを置いてください。");
    var parsed = memoTask(lines[task]), indent = memoIndent(lines[task]);
    for(i = task + 1; i < lines.length; i++) {
        if(!fenced[i] && memoTask(lines[i])) { end = i; break; }
        if(!fenced[i] && memoTrim(lines[i]) && memoIndent(lines[i]) <= indent) { end = i; break; }
    }
    if(top >= end || bottom >= end) throw new Error("選択範囲は1つのTODOのメモ内に収めてください。");
    var label = -1, memoEnd = end;
    for(i = task + 1; i < end; i++) if(!fenced[i] && /^\s+メモ[:：]\s*$/.test(lines[i])) {
        if(label >= 0) throw new Error("メモ欄が複数あります。1つにまとめてください。");
        label = i;
    }
    if(label >= 0) for(i = label + 1; i < end; i++) if(memoTrim(lines[i]) && memoIndent(lines[i]) <= memoIndent(lines[label])) { memoEnd = i; break; }
    return {lines:lines, task:task, end:end, label:label, memoEnd:memoEnd, prefix:parsed[1], title:memoTrim(parsed[2].replace(/\s*<!--[^>]*-->/g,"")), newline:text.indexOf("\r\n") >= 0 ? "\r\n" : "\n"};
}
function memoSelectedBody(context, selected, top, bottom) {
    if(!selected) return "";
    if(context.label < 0 || top <= context.label || bottom >= context.memoEnd) throw new Error("「メモ：」の下の、字下げした本文だけを選択してください。");
    var lines = memoLines(selected), min = null, i;
    for(i = 0; i < lines.length; i++) if(memoTrim(lines[i])) {
        if(memoIndent(context.lines[top + i]) <= memoIndent(context.lines[context.label])) throw new Error("メモ本文は「メモ：」より深く字下げしてください。");
        var amount = (lines[i].match(/^[ \t]*/) || [""])[0].length;
        if(min === null || amount < min) min = amount;
    }
    if(min === null) throw new Error("メモ本文を選択してください。");
    // 1行目を途中から選択した場合は、他の行だけの字下げも残して内容を保つ。
    for(i = 0; i < lines.length; i++) lines[i] = lines[i].substring(Math.min(min, (lines[i].match(/^[ \t]*/) || [""])[0].length));
    return lines.join("\r\n").replace(/(?:\r\n)+$/, "");
}
function memoWholeBody(context) {
    if(context.label < 0) throw new Error("このTODOには「メモ：」欄がありません。");
    var start=context.label+1, stop=context.memoEnd;
    while(start<stop && !memoTrim(context.lines[start])) start++;
    while(stop>start && !memoTrim(context.lines[stop-1])) stop--;
    if(start===stop) throw new Error("メモ欄に本文を書いてから実行してください。");
    return memoSelectedBody(context,context.lines.slice(start,stop).join("\n"),start,stop-1);
}
function memoReferences(lines) {
    var refs={}, fence="", i, match;
    for(i=0;i<lines.length;i++) {
        match=/^\s*(`{3,}|~{3,})/.exec(lines[i]);
        if(match) { if(!fence) fence=match[1].charAt(0); else if(fence===match[1].charAt(0)) fence=""; continue; }
        if(fence) continue;
        match=/^\[([^\]]+)\]:\s*(\S+)\s*$/.exec(lines[i]);
        if(match) {
            var id="$"+match[1].toLowerCase();
            if(refs[id] && refs[id]!==match[2]) throw new Error("関連メモの参照名が重複しています: "+match[1]);
            refs[id]=match[2];
        }
    }
    return refs;
}
function memoCompactLinks(text, context) {
    var lines=memoLines(text), refs=memoReferences(lines), definitions=[], i, next=1, memoNumber=0;
    for(i=context.task+1;i<context.end;i++) {
        if(!/^\s+関連メモ[:：]\s*/.test(lines[i])) continue;
        lines[i]=lines[i].replace(/\[([^\]]+)\](?:\(([^)]+)\)|\[([^\]]+)\])/g,function(all,label,target,ref){
            memoNumber++;
            if(ref) return "[メモ"+memoNumber+"]["+ref+"]";
            var name="";
            for(var key in refs) if(refs.hasOwnProperty(key) && refs[key]===target && /^\$memo-\d+$/.test(key)) { name=key.substring(1); break; }
            if(!name) {
                while(refs["$memo-"+next]) next++;
                name="memo-"+(next++); refs["$"+name]=target; definitions.push("["+name+"]: "+target);
            }
            return "[メモ"+memoNumber+"]["+name+"]";
        });
    }
    var result=lines.join(context.newline);
    if(definitions.length) result=result.replace(/(?:\r?\n)*$/,"")+context.newline+context.newline+definitions.join(context.newline)+context.newline;
    return result;
}
function memoHasSavedBody(text) {
    var value=String(text).replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");
    // マクロが付ける管理用ヘッダーだけのTXTは「本文あり」と数えない。
    value=value.replace(/^タイトル:[^\n]*\n作成日時:[^\n]*\n元の文書:[^\n]*\n\n/,"");
    return memoTrim(value).length>0;
}
function memoFileUri(path) {
    var forward=path.replace(/\\/g,"/");
    return (forward.indexOf("//")===0 ? "file:" : "file:///")+encodeURI(forward).replace(/[()#?]/g,function(value){return "%"+value.charCodeAt(0).toString(16).toUpperCase();});
}
function memoClickableLinks(text, context, sourcePath, fso) {
    var lines=memoLines(text), refs=memoReferences(lines), number=0;
    for(var i=context.task+1;i<context.end;i++) {
        if(!/^\s+関連メモ[:：]\s*/.test(lines[i])) continue;
        lines[i]=lines[i].replace(/\[([^\]]+)\](?:\(([^)]+)\)|\[([^\]]+)\])/g,function(all,label,target,ref){
            target=target || refs["$"+ref.toLowerCase()];
            if(!target) throw new Error("関連メモの保存先が見つかりません: "+ref);
            number++;
            var icon=/^\uD83D\uDCC4/.test(label) ? "\uD83D\uDCC4 " : "";
            return "["+icon+"メモ"+number+"]("+memoFileUri(memoResolveTarget(sourcePath,target,fso))+")";
        });
    }
    return lines.join(context.newline);
}
function memoMarkSaved(text, context, sourcePath, fso) {
    var lines=memoLines(text), refs=memoReferences(lines), cache={}, i;
    for(i=context.task+1;i<context.end;i++) {
        if(!/^\s+関連メモ[:：]\s*/.test(lines[i])) continue;
        lines[i]=lines[i].replace(/\[([^\]]+)\](?:\(([^)]+)\)|\[([^\]]+)\])/g,function(all,label,target,ref){
            target=target || refs["$"+ref.toLowerCase()];
            if(!target) return all;
            var hasBody;
            try {
                var path=memoResolveTarget(sourcePath,target,fso), key="$"+path.toLowerCase();
                if(!cache.hasOwnProperty(key)) cache[key]=fso.FileExists(path) && memoHasSavedBody(memoReadText(path));
                hasBody=cache[key];
            } catch(e) { return all; }
            var title=label.replace(/^\uD83D\uDCC4\s*/,"");
            return "["+(hasBody ? "\uD83D\uDCC4 " : "")+title+"]"+(ref ? "["+ref+"]" : "("+target+")");
        });
    }
    return lines.join(context.newline);
}
function memoInsertLink(text, context, target, label) {
    var lines = context.lines.slice(0), prefix = context.prefix + "  ", at = context.memoEnd;
    while(at > context.task + 1 && !memoTrim(lines[at - 1])) at--;
    var addition = [];
    if(context.label < 0) addition = [prefix + "メモ：", prefix + "  "];
    addition.push(prefix + "関連メモ: [" + label.replace(/[\[\]\\]/g, "_") + "](" + target + ")");
    for(var i = addition.length - 1; i >= 0; i--) lines.splice(at, 0, addition[i]);
    return lines.join(context.newline);
}
function memoInsertLabel(context) {
    var lines=context.lines.slice(0), prefix=context.prefix+"  ";
    if(context.label >= 0) {
        if(context.label+1>=context.memoEnd) lines.splice(context.label+1,0,context.lines[context.label].match(/^[ \t]*/)[0]+"  ");
        return {text:lines.join(context.newline), line:context.label+1, column:context.lines[context.label].match(/^[ \t]*/)[0].length+3};
    }
    lines.splice(context.task+1,0,prefix+"メモ：",prefix+"  ");
    return {text:lines.join(context.newline), line:context.task+2, column:prefix.length+3};
}
function memoSaveTodo(doc, original, updated, stamp, fso) {
    if(original===updated) return;
    var n=1, backup;
    do { backup=doc.FullName+".memo_backup_"+stamp+"_"+(n++)+".md"; } while(fso.FileExists(backup));
    memoWriteNew(backup,original); memoCheckSync(fso);
    if(doc.Text!==original) throw new Error("TODOが変更されたため、保存を止めました。");
    doc.Text=updated;
    try { doc.Save(doc.FullName); } catch(e) { doc.Text=original; throw e; }
}
function memoLinks(context) {
    var links = [], seen = {}, refs=memoReferences(context.lines), i, match;
    for(i = context.task + 1; i < context.end; i++) {
        if(!/^\s+関連メモ[:：]\s*/.test(context.lines[i])) continue;
        var re = /\[([^\]]+)\](?:\(([^)]+)\)|\[([^\]]+)\])/g;
        while((match = re.exec(context.lines[i])) !== null) {
            var target=match[2] || refs["$"+match[3].toLowerCase()];
            if(!target) throw new Error("関連メモの保存先が見つかりません: "+match[3]);
            if(!seen["$" + target]) { seen["$" + target] = true; links.push({label:match[1], target:target}); }
        }
    }
    return links;
}
function memoStamp(date) {
    function pad(value, width) { var s = String(value); while(s.length < width) s = "0" + s; return s; }
    return date.getFullYear() + pad(date.getMonth()+1,2) + pad(date.getDate(),2) + "_" + pad(date.getHours(),2) + pad(date.getMinutes(),2) + pad(date.getSeconds(),2) + "_" + pad(date.getMilliseconds(),3);
}
function memoFileName(title, stamp, count) {
    var number=String(count); while(number.length<3) number="0"+number;
    return stamp.substring(0,8)+"_"+number+".txt";
}
function memoLinkTarget(sourcePath, fileName, fso) {
    var base = fso.GetParentFolderName(sourcePath);
    var path = fso.GetAbsolutePathName(base).toLowerCase() === fso.GetAbsolutePathName(HUB_DIR).toLowerCase() ? "notes/" : NOTES_DIR.replace(/\\/g,"/") + "/";
    return path + encodeURIComponent(fileName);
}
function memoResolveTarget(sourcePath, target, fso) {
    var decoded;
    try { decoded = decodeURIComponent(target); } catch(e) { throw new Error("関連メモのリンクが不正です。"); }
    if(/^file:\/\//i.test(decoded)) {
        decoded=decoded.substring(7);
        if(/^\/[a-z]:\//i.test(decoded)) decoded=decoded.substring(1);
        else if(!/^[a-z]:\//i.test(decoded)) decoded="//"+decoded;
    }
    if(!/\.txt$/i.test(decoded) || /[\r\n\x00]/.test(decoded) || /^(?:https?|file):/i.test(decoded)) throw new Error("関連メモにはローカルのTXTファイルを指定してください。");
    decoded = decoded.replace(/\//g,"\\");
    if(!/^[a-z]:\\/i.test(decoded) && !/^\\\\/.test(decoded)) decoded = fso.BuildPath(fso.GetParentFolderName(sourcePath), decoded);
    return fso.GetAbsolutePathName(decoded);
}
function memoReadText(path) {
    var stream = new ActiveXObject("ADODB.Stream");
    try {
        stream.Type=2; stream.Charset="iso-8859-1"; stream.Open(); stream.LoadFromFile(path);
        var prefix=stream.ReadText(3); stream.Position=0;
        stream.Charset=prefix.charCodeAt(0)===255 && prefix.charCodeAt(1)===254 ? "unicode" : prefix.charCodeAt(0)===254 && prefix.charCodeAt(1)===255 ? "unicodeFFFE" : "utf-8";
        return stream.ReadText().replace(/^\uFEFF/, "");
    } finally { if(stream.State !== 0) stream.Close(); }
}
function memoWriteNew(path, text) {
    var stream = new ActiveXObject("ADODB.Stream");
    try { stream.Type=2; stream.Charset="utf-8"; stream.Open(); stream.WriteText(text); stream.SaveToFile(path,1); }
    finally { if(stream.State !== 0) stream.Close(); }
}
function memoOpen(path, fso) {
    var target=fso.GetAbsolutePathName(path).toLowerCase();
    for(var i=0;i<editor.Documents.Count;i++) { var doc=editor.Documents.Item(i); if(doc.FullName && fso.GetAbsolutePathName(doc.FullName).toLowerCase()===target) { doc.Activate(); memoVertical(); return doc; } }
    var text=memoReadText(path); editor.NewFile(); var opened=editor.ActiveDocument;
    opened.Text=text; opened.Save(path); memoVertical(); opened.selection.StartOfDocument(false); return opened;
}
function memoVertical() {
    // 縦書きはトグル式なので、現在のチェック状態を確認してから切り替える。
    var status=editor.QueryStatusByID(2238);
    if((status & 2)!==0) return;
    if((status & 1)===0) throw new Error("TXTは開きました。［表示］→［縦書き］で切り替えてください。");
    editor.ExecuteCommandByID(2238);
}
function memoSelection(doc) {
    var sel=doc.selection;
    if(sel.Count > 0 || (typeof meModeStream !== "undefined" && sel.Mode !== undefined && sel.Mode !== meModeStream)) throw new Error("通常のテキスト選択で実行してください。");
    var top=sel.GetTopPointY(mePosLogical)-1, bottom=sel.GetBottomPointY(mePosLogical)-1;
    if(bottom > top && sel.GetBottomPointX(mePosLogical)===1) bottom--;
    return {top:top, bottom:bottom, text:sel.Text || ""};
}
function memoCheckSync(fso) {
    if(fso.FileExists(HUB_DIR + "\\.mery-calendar\\sync.lock")) throw new Error("同期が完了してから実行してください。");
}

var IMG_DIR = HUB_DIR + "\\img";
function assetExtension(path, fso) {
    var ext=fso.GetExtensionName(path).toLowerCase();
    if(!/^(png|jpg|jpeg|gif|bmp|webp|tif|tiff|pdf)$/.test(ext)) throw new Error("画像またはPDFを選んでください。");
    return ext;
}
function assetResolve(docPath,target,fso) {
    var decoded;
    try { decoded=decodeURIComponent(target).replace(/\//g,"\\"); } catch(e) { throw new Error("資料の参照が不正です。"); }
    if(/[\x00-\x1f"]/.test(decoded) || /^(?:https?|file):/i.test(decoded)) throw new Error("img内の画像・PDFを指定してください。");
    if(!/^[a-z]:\\/i.test(decoded) && !/^\\\\/.test(decoded)) decoded=fso.BuildPath(fso.GetParentFolderName(docPath),decoded);
    var path=fso.GetAbsolutePathName(decoded), root=fso.GetAbsolutePathName(IMG_DIR).toLowerCase()+"\\";
    if(path.toLowerCase().indexOf(root)!==0) throw new Error("資料は作業ハブのimg内に置いてください。");
    assetExtension(path,fso); return path;
}
function assetLinks(context) {
    var refs=memoReferences(context.lines),links=[],seen={};
    for(var i=context.task+1;i<context.end;i++) {
        if(!/^\s+資料[:：]\s*/.test(context.lines[i])) continue;
        var re=/\[([^\]]+)\](?:\(([^)]+)\)|\[([^\]]+)\])/g, m;
        while((m=re.exec(context.lines[i]))!==null) {
            var target=m[2] || refs["$"+m[3].toLowerCase()];
            if(!target) throw new Error("資料の参照先が見つかりません: "+m[3]);
            if(!seen["$"+target]) { links.push({label:m[1],target:target});seen["$"+target]=true; }
        }
    }
    return links;
}
function assetInsert(context,target,label) {
    var lines=context.lines.slice(0),refs=memoReferences(lines),id=1;
    while(refs["$img-"+id]) id++;
    var name="img-"+id, at=context.end;
    while(at>context.task+1 && !memoTrim(lines[at-1])) at--;
    lines.splice(at,0,context.prefix+"  資料: ["+label+"]["+name+"]");
    return lines.join(context.newline).replace(/(?:\r?\n)*$/,"")+context.newline+context.newline+"["+name+"]: "+target+context.newline;
}
function assetPick(fso) {
    var shell=new ActiveXObject("WScript.Shell"),script=HUB_DIR+"\\pick-asset.ps1";
    if(!fso.FileExists(script)) throw new Error("pick-asset.ps1がありません。");
    var result=fso.BuildPath(String(fso.GetSpecialFolder(2)),fso.GetTempName());
    if(/["%\r\n]/.test(result)) throw new Error("一時保存先を確認してください。");
    if(fso.FileExists(result)) throw new Error("一時ファイル名が重複したため中止しました。");
    try {
        var command="\""+shell.ExpandEnvironmentStrings("%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")+"\" -NoProfile -STA -ExecutionPolicy Bypass -File \""+script+"\" -ResultPath \""+result+"\"";
        if(shell.Run(command,0,true)!==0 || !fso.FileExists(result)) throw new Error("ファイル選択を開けませんでした。");
        return JSON.parse(memoReadText(result)).Path || "";
    } finally { if(fso.FileExists(result)) fso.DeleteFile(result); }
}
function assetMain(mode) {
    var copied="";
    try {
        var doc=editor.ActiveDocument, fso=new ActiveXObject("Scripting.FileSystemObject");
        if(!doc.FullName) throw new Error("TODOの文書を先に保存してください。");
        memoCheckSync(fso);
        var selected=memoSelection(doc),original=doc.Text,context=memoContext(original,selected.top,selected.bottom);
        if(mode==="open") {
            var links=assetLinks(context);
            if(!links.length) throw new Error("このTODOには資料がありません。");
            var choice=1;
            if(links.length>1) {
                var menu=CreatePopupMenu();
                for(var i=0;i<links.length;i++) menu.Add(links[i].label,i+1);
                choice=menu.Track(0);if(!choice)return;
            }
            var openPath=assetResolve(doc.FullName,links[choice-1].target,fso);
            if(!fso.FileExists(openPath)) throw new Error("資料が見つかりません: "+openPath);
            (new ActiveXObject("Shell.Application")).ShellExecute(openPath,"",IMG_DIR,"open",1);
            return;
        }
        var source=assetPick(fso);if(!source)return;
        var ext=assetExtension(source,fso);
        if(!fso.FileExists(source)) throw new Error("選んだファイルが見つかりません。");
        var kind=ext==="pdf" ? "PDF" : "画像";
        var label=prompt("短い表示名",fso.GetBaseName(source));if(label===null)return;
        label=memoTrim(label).replace(/[\[\]\\\r\n]/g,"_");if(!label)label="資料";
        label=kind+": "+label;
        if(!fso.FolderExists(HUB_DIR)) throw new Error("作業ハブがありません。");
        if(!fso.FolderExists(IMG_DIR))fso.CreateFolder(IMG_DIR);
        var sourcePath=fso.GetAbsolutePathName(source), path=sourcePath;
        if(fso.GetAbsolutePathName(fso.GetParentFolderName(sourcePath)).toLowerCase()!==fso.GetAbsolutePathName(IMG_DIR).toLowerCase()) {
            var stamp=memoStamp(new Date()),count=1,name;
            do { var number=String(count++);while(number.length<3)number="0"+number;name=stamp.substring(0,8)+"_"+number+"."+ext; path=fso.BuildPath(IMG_DIR,name); } while(fso.FileExists(path));
            fso.CopyFile(sourcePath,path,false);copied=path;
        }
        var base=fso.GetAbsolutePathName(fso.GetParentFolderName(doc.FullName)).toLowerCase();
        var target=(base===fso.GetAbsolutePathName(HUB_DIR).toLowerCase()?"img/":IMG_DIR.replace(/\\/g,"/")+"/")+encodeURIComponent(fso.GetFileName(path));
        var existing=assetLinks(context);
        for(var j=0;j<existing.length;j++) if(assetResolve(doc.FullName,existing[j].target,fso).toLowerCase()===path.toLowerCase()) { alert("この資料はすでに付いています。");return; }
        memoSaveTodo(doc,original,assetInsert(context,target,label),memoStamp(new Date()),fso);
    } catch(e) { alert("資料: "+e.message+(copied ? "\n\nコピー済みの資料: "+copied : "")); }
}

assetMain("add");