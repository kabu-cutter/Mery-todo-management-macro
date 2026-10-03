'use strict';
const crypto = require('node:crypto');
const MARKER = /\s*<!-- mery-calendar:([a-f0-9]{32}) -->/;
const STANDARD = {TASKS:['今日やる','次にやる','後で','置く','確認が必要','メモ'],LOG:['やったこと','試したこと','うまくいったこと','詰まったこと','次回メモ','メモ']};
const uuid = () => crypto.randomBytes(16).toString('hex');
function validDate(date) { const timestamp=Date.parse(date+'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10)===date; }
function nextDate(date) { return new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10); }
function fields(item) { const {kind,date,section,text,done,start,end} = item; return {kind,date,section,text,done:!!done,start:start||'',end:end||''}; }
function equal(a,b) { return JSON.stringify(fields(a)) === JSON.stringify(fields(b)); }
function parseDocument(input, kind, makeId = uuid) {
  const lines = input.replace(/\r\n?/g,'\n').split('\n');
  const items=[]; const seen=new Set(); let date='',section='メモ',fence='';
  for(let index=0;index<lines.length;index++) {
    const line=lines[index];
    const f=line.match(/^\s*(`{3,}|~{3,})/);
    if(f) { if(!fence) fence=f[1][0]; else if(fence===f[1][0]) fence=''; continue; }
    if(fence) continue;
    const day=line.match(/^##\s+(\d{4}-\d{2}-\d{2})(?:\s+\([^)]*\))?(?:\s+(今日の作業|作業ログ))?\s*$/);
    if(day) { date=validDate(day[1]) ? day[1] : ''; section='メモ'; continue; }
    const sub=line.match(/^###\s+(.+?)\s*$/);
    if(sub) {section=sub[1];continue;}
    if(/^##\s/.test(line)) {date='';continue;}
    if(!date) continue;
    const match=kind==='TASKS' ? line.match(/^[-*]\s+\[([ xX])\]\s*(.*)$/) : line.match(/^[-*]\s+(.*)$/);
    if(!match) continue;
    let body=kind==='TASKS' ? match[2] : match[1];
    const marker=body.match(MARKER);
    body=body.replace(MARKER,'').trim();
    const time=body.match(/\s+@(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    let start='',end='';
    if(time) {
      [start,end]=[time[1],time[2]];
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end) throw new Error(kind+' の時刻が不正です（同日内の開始 < 終了）: '+(index+1)+'行目');
      body=body.slice(0,time.index).trim();
    }
    if(!body) continue;
    const id=marker ? marker[1] : makeId();
    if(seen.has(id)) throw new Error(kind+' に同じ同期IDが複数あります: '+id);
    seen.add(id);
    if(!marker) lines[index]=line.replace(/\s+$/,'')+' <!-- mery-calendar:'+id+' -->';
    items.push({id,kind,date,section,text:body,done:kind==='TASKS' && match[1].toLowerCase()==='x',start,end,index});
  }
  for(const line of lines) {const id=line.match(MARKER)?.[1];if(id&&!seen.has(id)) throw new Error(kind+' の同期済み項目を解析できません。日付・チェックボックス・時刻を確認してください。');}
  return {items,text:lines.join('\n')};
}
function toEvent(item) {
  const prefix=item.kind==='LOG' ? '[LOG] ' : item.done ? '[TASKS ✓] ' : '[TASKS] ';
  return {
    summary:prefix+item.text,
    start:item.start ? {dateTime:item.date+'T'+item.start+':00+09:00',timeZone:'Asia/Tokyo'} : {date:item.date},
    end:item.end ? {dateTime:item.date+'T'+item.end+':00+09:00',timeZone:'Asia/Tokyo'} : {date:nextDate(item.date)},
    extendedProperties:{private:{meryId:item.id,meryKind:item.kind,merySection:item.section}},
  };
}
function localTime(value) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return {date:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute};
}
function fromEvent(event, calendarId, base) {
  const meta=event.extendedProperties?.private||{};
  const id=meta.meryId || base?.id || crypto.createHash('sha256').update(calendarId+'\n'+event.id).digest('hex').slice(0,32);
  if(!/^[a-f0-9]{32}$/.test(id)) throw new Error('不正な同期ID: '+event.id);
  const result={id,eventId:event.id,etag:event.etag,deleted:event.status==='cancelled'};
  if(result.deleted) return result;
  try {
    if(event.recurrence || event.recurringEventId) throw new Error('繰り返し予定は同期対象外です');
    let date,start='',end='';
    if(event.start?.date) {
      date=event.start.date;
      if(!validDate(date)||event.end?.date!==nextDate(date)) throw new Error('複数日の終日予定は同期対象外です');
    } else {
      const s=localTime(event.start?.dateTime),e=localTime(event.end?.dateTime);
      if(s.date!==e.date || s.time>=e.time) throw new Error('日をまたぐ予定は同期対象外です');
      date=s.date;start=s.time;end=e.time;
    }
    const summary=event.summary||'';
    const kind=summary.startsWith('[LOG]') ? 'LOG' : summary.startsWith('[TASKS') ? 'TASKS' : meta.meryKind||base?.kind||'TASKS';
    const done=kind==='TASKS' && summary.startsWith('[TASKS ✓]');
    const text=summary.replace(/^\[(?:LOG|TASKS(?: ✓)?)\]\s*/,'').trim();
    if(!text||/[\r\n]/.test(text)) throw new Error('空または複数行の件名は同期対象外です');
    const section=meta.merySection||base?.section||(kind==='LOG'?'やったこと':'今日やる');
    return {...result,kind,date,start,end,done,text,section};
  } catch(error) {return {...result,unsupported:error.message};}
}
function planSync(localItems,remoteItems,entries={}) {
  const local=new Map(localItems.map(x=>[x.id,x]));
  const remote=new Map();
  for(const r of remoteItems) {if(remote.has(r.id)) throw new Error('カレンダーに同じ同期IDが複数あります: '+r.id);remote.set(r.id,r);}
  const ids=new Set([...local.keys(),...remote.keys(),...Object.keys(entries)]);
  const operations=[];
  for(const id of ids) {
    const l=local.get(id),r=remote.get(id),base=entries[id];
    let action;
    if(r?.unsupported) action='conflict';
    else if(!base) {
      if(l && r && !r.deleted) action=equal(l,r)?'adopt':'conflict';
      else if(l && r?.deleted) action='conflict';
      else if(l) action='createRemote';
      else if(r && !r.deleted) action='pull';
      else action='forget';
    } else if(!l && (!r||r.deleted)) action='forget';
    else if(!l) action=equal(r,base.remote)?'deleteRemote':'conflict';
    else if(!r||r.deleted) action=equal(l,base.local)?'deleteLocal':'conflict';
    else {
      const lc=!equal(l,base.local),rc=!equal(r,base.remote);
      action=lc && rc ? (equal(l,r)?'adopt':'conflict') : lc?'push':rc?'pull':'adopt';
    }
    operations.push({id,action,local:l,remote:r,base});
  }
  return operations;
}
function lineFor(item) {return (item.kind==='TASKS' ? '- ['+(item.done?'x':' ')+'] ' : '- ')+item.text+(item.start?' @'+item.start+'-'+item.end:'')+' <!-- mery-calendar:'+item.id+' -->';}
function dayHeading(item) {
  const day=['日','月','火','水','木','金','土'][new Date(item.date+'T00:00:00Z').getUTCDay()];
  return '## '+item.date+' ('+day+') '+(item.kind==='TASKS'?'今日の作業':'作業ログ');
}
function applyItems(documents, updates, removals=[]) {
  const docs={...documents};
  for(const id of new Set([...removals,...updates.map(x=>x.id)])) {
    for(const kind of ['TASKS','LOG']) {
      docs[kind]=docs[kind].split('\n').filter(line=>line.match(MARKER)?.[1]!==id).join('\n');
    }
  }
  for(const item of updates) {
    const lines=docs[item.kind].split('\n');
    // IDs are removed above; locate the destination by date, without rebuilding unrelated content.
    let day=lines.findIndex(line=>new RegExp('^##\\s+'+item.date+'(?:\\s|$)').test(line));
    if(day<0) {
      if(!lines[0]?.startsWith('# '+item.kind)) lines.unshift('# '+item.kind,'');
      lines.splice(1,0,'',dayHeading(item),'','### '+item.section,lineFor(item),'','---','');
    } else {
      let dayEnd=lines.findIndex((line,i)=>i>day && /^##\s/.test(line));
      if(dayEnd<0) dayEnd=lines.length;
      let section=lines.findIndex((line,i)=>i>day && i<dayEnd && line.trim()==='### '+item.section);
      if(section<0) {
        let end=dayEnd;while(end>day+1 && (!lines[end-1].trim()||/^---+$/.test(lines[end-1].trim()))) end--;
        lines.splice(end,0,'','### '+item.section,lineFor(item),'');
      } else {
        let end=section+1;while(end<dayEnd && !/^###\s/.test(lines[end])&&!/^---+$/.test(lines[end].trim())) end++;
        while(end>section+1 && !lines[end-1].trim()) end--;
        lines.splice(end,0,lineFor(item));
      }
    }
    docs[item.kind]=lines.join('\n');
  }
  return docs;
}
module.exports={MARKER,STANDARD,uuid,fields,equal,parseDocument,toEvent,fromEvent,planSync,applyItems};
