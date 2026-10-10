'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const core=require('./calendar-sync-core.cjs');
const strip=text=>text.replace(/\s*<!-- mery-calendar:[a-f0-9]{32} -->/g,'').replace(/\r\n?/g,'\n');
function load(file){if(!fs.existsSync(file))return [];const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.version!==1||!Array.isArray(data.snapshots)||data.snapshots.some(x=>typeof x!=='string'))throw Error('TASKS のIDファイルが不正です。バックアップから復元してください。');return data.snapshots;}
function restore(text,snapshots,makeId=core.uuid){
  const parsed=core.parseDocument(text,'TASKS',makeId);if(!snapshots.length)return parsed.text;
  const explicit=new Set(text.match(/<!-- mery-calendar:([a-f0-9]{32}) -->/g)?.map(x=>x.match(/[a-f0-9]{32}/)[0])||[]);
  const context=x=>x.date+'\0'+x.section;
  const identityText=x=>x.text.replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M(?:\s+[-–—]\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)?$/i,'').trim();
  const key=x=>context(x)+'\0'+identityText(x);
  const newKeys=new Set(parsed.items.map(key));
  const candidates=snapshots.map(s=>({text:s,items:core.parseDocument(s,'TASKS',makeId).items}));
  const chosen=candidates.find(x=>strip(x.text)===strip(text))||candidates.sort((a,b)=>b.items.filter(x=>newKeys.has(key(x))).length-a.items.filter(x=>newKeys.has(key(x))).length)[0];
  let old=chosen.items.filter(x=>!explicit.has(x.id)),fresh=parsed.items.filter(x=>!explicit.has(x.id));const ids=new Map();
  function match(group,duplicates){
    for(const k of new Set(fresh.map(group))){const a=old.filter(x=>group(x)===k),b=fresh.filter(x=>group(x)===k);if(!a.length)continue;if(a.length===1&&b.length===1||duplicates&&a.length===b.length){for(let i=0;i<a.length;i++)ids.set(b[i].index,a[i].id);old=old.filter(x=>!a.includes(x));fresh=fresh.filter(x=>!b.includes(x));}else if(duplicates)throw Error('同名の重複項目のIDを特定できません。削除前の状態に戻して項目名を区別してから同期してください。');}
  }
  match(key,true);match(x=>x.text,false);
  // Remaining edits can be paired within a date/subsection only when their count agrees.
  for(const k of new Set(fresh.map(context))){const a=old.filter(x=>context(x)===k),b=fresh.filter(x=>context(x)===k);if(!a.length)continue;if(a.length!==b.length)throw Error('TASKS の編集・追加・削除が同じ欄で重なり、IDを特定できません。編集を分けて同期してください。');for(let i=0;i<a.length;i++)ids.set(b[i].index,a[i].id);old=old.filter(x=>!a.includes(x));fresh=fresh.filter(x=>!b.includes(x));}
  if(old.length&&fresh.length){if(old.length===1&&fresh.length===1)ids.set(fresh[0].index,old[0].id);else throw Error('TASKS の移動と編集が重なり、IDを特定できません。移動と編集を分けて同期してください。');}
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
