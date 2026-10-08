#title = "関連メモを開く"

function main() {
    try {
        var doc=getMeryEditor().ActiveDocument;
        if(!doc.FullName) throw new Error("TODOの文書を先に保存してください。");
        var selected=memoSelection(doc), original=doc.Text, context=memoContext(original,selected.top,selected.bottom);
        var restored=memoRestoreMissingLabels(original,context);
        if(restored!==original) context=memoContext(restored,selected.top,selected.bottom);
        var links=memoLinks(context);
        if(!links.length) { macroMessage("このTODOには関連メモがありません。「このTODOにメモを作る」で追加できます。"); return; }
        var index=0;
        if(links.length > 1) {
            var menu=CreatePopupMenu();
            for(var i=0;i<links.length;i++) menu.Add("メモ"+(i+1)+"を開く", i+1);
            var choice=menu.Track(0); if(!choice) return; index=choice-1;
        }
        var fso=new ActiveXObject("Scripting.FileSystemObject"), path=memoResolveTarget(doc.FullName,links[index].target,fso);
        if(!fso.FileExists(path)) throw new Error("関連メモが見つかりません: " + path);
        memoOpen(path);
    } catch(e) { macroMessage("関連メモ: " + e.message); }
}

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
    return {lines:lines, task:task, end:end, label:label, memoEnd:memoEnd, fenced:fenced, prefix:parsed[1], title:memoTrim(parsed[2].replace(/\s*<!--[^>]*-->/g,"")), newline:text.indexOf("\r\n") >= 0 ? "\r\n" : "\n"};
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
function memoRestoreMissingLabels(text, context) {
    var lines=memoLines(text), changed=false;
    for(var i=context.task+1;i<context.end;i++) {
        if(context.fenced[i]) continue;
        var body=memoTrim(lines[i]);
        if(/^\[(?:\uD83D\uDCC4\s*)?メモ\d+\]\[memo-\d+\]$/.test(body)) {
            lines[i]=context.prefix+"   関連メモ: "+body;
            changed=true;
        }
    }
    return changed ? lines.join(context.newline) : text;
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
function memoOpen(path) {
    getMeryEditor().OpenFile(path, 0, meOpenAllowNewWindow);
}

function getMeryEditor() {
    if (typeof editor !== "undefined") return editor;
    if (typeof Editor !== "undefined") return Editor;
    throw new Error("Meryのエディターオブジェクトを取得できません。");
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

main();

function macroMessage(message) {
    new ActiveXObject("WScript.Shell").Popup(String(message), 0, "Mery TODO", 0x30);
}
