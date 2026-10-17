'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const core=require('./calendar-sync-core.cjs');
const strip=text=>text.replace(/\s*<!-- mery-calendar:[a-f0-9]{32} -->/g,'').replace(/\r\n?/g,'\n');
function load(file){if(!fs.existsSync(file))return [];const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.version!==1||!Array.isArray(data.snapshots)||data.snapshots.some(x=>typeof x!=='string'))throw Error('TASKS のIDファイルが不正です。バックアップから復元してください。');return data.snapshots;}
function similarity(left,right){
  const a=[...left.normalize('NFKC').trim()],b=[...right.normalize('NFKC').trim()];
  if(!a.length||!b.length||Math.max(a.length,b.length)>2048)return 0;
  let previous=Array.from({length:b.length+1},(_,i)=>i),current=new Array(b.length+1);
  for(let i=1;i<=a.length;i++){
    current[0]=i;
    for(let j=1;j<=b.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
    [previous,current]=[current,previous];
  }
  let longest=Array(b.length+1).fill(0),common=0;
  for(let i=1;i<=a.length;i++)for(let j=b.length;j>=1;j--){longest[j]=a[i-1]===b[j-1]?longest[j-1]+1:0;common=Math.max(common,longest[j]);}
  return Math.max(1-previous[b.length]/Math.max(a.length,b.length),common/Math.min(a.length,b.length));
}
function pairEdited(old,fresh,ids,textOf,options={}){
  const threshold=options.threshold??.55,margin=options.margin??.1,minLength=options.minLength??0;let matched=0,ambiguous=false;
  while(old.length&&fresh.length){
    const scores=old.map(a=>fresh.map(b=>{
      const left=textOf(a),right=textOf(b);
      if(Math.min([...left.normalize('NFKC').trim()].length,[...right.normalize('NFKC').trim()].length)<minLength)return 0;
      return similarity(left,right);
    }));
    const best=(values)=>{
      const sorted=values.map((score,index)=>({score,index})).sort((a,b)=>b.score-a.score);
      return sorted[0]&&sorted[0].score>=threshold&&(sorted.length===1||sorted[0].score-sorted[1].score>=margin)?sorted[0].index:-1;
    };
    let pair=null;
    for(let i=0;i<old.length;i++){
      const j=best(scores[i]);if(j<0)continue;
      const reverse=best(scores.map(row=>row[j]));
      if(reverse===i){pair=[i,j];break;}
    }
    if(!pair){ambiguous=scores.some(row=>row.some(score=>score>=threshold));break;}
    const [i,j]=pair;ids.set(fresh[j].index,old[i].id);old.splice(i,1);fresh.splice(j,1);matched++;
  }
  return {matched,ambiguous};
}
function restore(text,snapshots,makeId=core.uuid){
  const parsed=core.parseDocument(text,'TASKS',makeId);if(!snapshots.length)return parsed.text;
  const explicit=new Set(text.match(/<!-- mery-calendar:([a-f0-9]{32}) -->/g)?.map(x=>x.match(/[a-f0-9]{32}/)[0])||[]);
  const context=x=>x.date+'\0'+x.section;
  const identityText=x=>x.text.replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M(?:\s+[-–—]\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)?$/i,'').trim();
  const key=x=>context(x)+'\0'+identityText(x);
  const newKeys=new Set(parsed.items.map(key));
  const candidates=snapshots.map(s=>({text:s,items:core.parseDocument(s,'TASKS',makeId).items}));
  const chosen=candidates.find(x=>strip(x.text)===strip(text))||candidates.sort((a,b)=>b.items.filter(x=>newKeys.has(key(x))).length-a.items.filter(x=>newKeys.has(key(x))).length)[0];
  let old=chosen.items.filter(x=>!explicit.has(x.id)),fresh=parsed.items.filter(x=>!explicit.has(x.id));const ids=new Map(),anchoredContexts=new Set();
  function match(group,duplicates){
    for(const k of new Set(fresh.map(group))){const a=old.filter(x=>group(x)===k),b=fresh.filter(x=>group(x)===k);if(!a.length)continue;if(a.length===1&&b.length===1||duplicates&&a.length===b.length){for(let i=0;i<a.length;i++){ids.set(b[i].index,a[i].id);anchoredContexts.add(context(a[i]));anchoredContexts.add(context(b[i]));}old=old.filter(x=>!a.includes(x));fresh=fresh.filter(x=>!b.includes(x));}else if(duplicates)throw Error('同名の重複項目のIDを特定できません。削除前の状態に戻して項目名を区別してから同期してください。');}
  }
  match(key,true);match(x=>x.text,false);
  // Pair likely edits by text similarity. Unmatched old/new rows are deletions/additions;
  // when their relationship is ambiguous, stop rather than assigning the wrong sync ID.
  for(const k of new Set(fresh.map(context))){
    const a=old.filter(x=>context(x)===k),b=fresh.filter(x=>context(x)===k);if(!a.length)continue;
    let result={matched:0,ambiguous:false};
    if(a.length===1&&b.length===1){ids.set(b[0].index,a[0].id);result.matched=1;a.length=0;b.length=0;}
    else result=pairEdited(a,b,ids,identityText);
    if(a.length&&b.length&&(result.ambiguous||!result.matched&&!anchoredContexts.has(k)))throw Error('TASKS の編集・追加・削除の対応が曖昧で、IDを安全に特定できません。同期IDを残すか、変更を分けて同期してください。');
    old=old.filter(x=>!a.includes(x));fresh=fresh.filter(x=>!b.includes(x));
  }
  // A task can be both renamed and moved to another date/section. After the
  // context-local pass, pair only globally distinctive, high-confidence edits.
  // Keep the existing fail-safe below for anything that remains ambiguous.
  const onlyOneUnmatchedPair=old.length===1&&fresh.length===1;
  if(old.length&&fresh.length&&!onlyOneUnmatchedPair)pairEdited(old,fresh,ids,identityText,{threshold:.72,margin:.18,minLength:8});
  if(old.length&&fresh.length){
    if(onlyOneUnmatchedPair)ids.set(fresh[0].index,old[0].id);
    else if(old.some(a=>fresh.some(b=>similarity(identityText(a),identityText(b))>=.55)))throw Error('TASKS の移動と編集が重なり、IDを特定できません。移動と編集を分けて同期してください。');
    // With no plausible text relationship, keep fresh IDs as additions and let
    // unmatched historical IDs represent deletions; do not confuse these with edits.
  }
  const parsedLines=new Set(parsed.items.map(x=>x.index));
  const loose=text.replace(/\r\n?/g,'\n').split('\n').filter((line,index)=>!parsedLines.has(index)).map(line=>line.match(/^[-*]\s+\[[ xX]\]\s*(.*)$/)?.[1]?.replace(/\s*<!-- mery-calendar:[a-f0-9]{32} -->/g,'').trim()).filter(Boolean);
  if(old.some(x=>loose.includes(x.text)))throw Error('同期済み項目が日付見出しの外にあります。日付見出しを確認してください。');
  const lines=parsed.text.split('\n');for(const item of parsed.items)if(ids.has(item.index))lines[item.index]=lines[item.index].replace(item.id,ids.get(item.index));
  const result=lines.join('\n');core.parseDocument(result,'TASKS');return result;
}
function checkpoint(file,marked,snapshots){
  const next=[marked,...snapshots.filter(x=>x!==marked)].slice(0,3),tmp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify({version:1,snapshots:next},null,2),'utf8');fs.renameSync(tmp,file);return next;
}
module.exports={strip,load,restore,checkpoint};
