'use strict';
const crypto = require('node:crypto');

const ID_MARKER = /\s*<!--\s*(?:mery-goal-id:([a-f0-9]{32})|g:([A-Za-z0-9_-]{22}|[1-9a-z][0-9a-z]{0,9}))\s*-->/i;
const DUE_MARKER = /\s*<!--\s*mery-due:(\d{4}-\d{2}-\d{2})\s*-->/i;
const uuid = () => crypto.randomBytes(16).toString('hex');
const uidFor = id => id + '@local.merytodo';
function goalIdMap(text) {
  const blocks = [...text.matchAll(/(?:^|\n)<!-- mery-goal-id-map\n([\s\S]*?)\n-->(?=\n|$)/g)];
  if (blocks.length > 1 || (text.match(/<!--\s*mery-goal-id-map\b/gi) || []).length !== blocks.length) throw new Error('目標IDの対応表が不正です。');
  const aliases = new Map(), ids = new Map();
  if (blocks.length) for (const line of blocks[0][1].split('\n')) {
    const entry = /^([1-9a-z][0-9a-z]{0,9})=([a-f0-9]{32})$/.exec(line);
    if (!entry || aliases.has(entry[1]) || ids.has(entry[2])) throw new Error('目標IDの対応表に不正または重複があります。');
    aliases.set(entry[1], entry[2]); ids.set(entry[2], entry[1]);
  }
  return {aliases, ids, block: blocks[0] || null};
}
function goalIdFromMarker(match, aliases) {
  if (match[1]) return match[1].toLowerCase();
  if (match[2].length !== 22) {
    const id = aliases.get(match[2]);
    if (!id) throw new Error('短い目標IDに対応する完全なIDがありません: ' + match[2]);
    return id;
  }
  const bytes = Buffer.from(match[2], 'base64url');
  if (bytes.length !== 16 || bytes.toString('base64url') !== match[2]) throw new Error('短縮した目標IDが不正です。');
  return bytes.toString('hex');
}
function goalIdComment(id,type) {
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error('目標IDの形式が不正です。');
  return type === 'year' || type === 'month' || type === 'week'
    ? '<!--g:' + Buffer.from(id,'hex').toString('base64url') + '-->'
    : '<!-- mery-goal-id:' + id.toLowerCase() + ' -->';
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function dateKey(value) { return value.replace(/-/g, ''); }
function keyDate(value) { return value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8); }
function nextDate(value, offset = 1) {
  const d = new Date(value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10);
}
function weekStart(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
  return jan4.toISOString().slice(0, 10);
}
function isoWeek(value) {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const y = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const w = Math.floor((date - jan4) / 604800000) + 1;
  return y + '-W' + String(w).padStart(2, '0');
}
function dateRange(type, key) {
  if (type === 'year') return {start: key + '-01-01', end: (Number(key) + 1) + '-01-01'};
  if (type === 'month') {
    const [y,m] = key.split('-').map(Number);
    return {start: key + '-01', end: nextDate((new Date(Date.UTC(y, m, 1))).toISOString().slice(0,10), 0)};
  }
  if (type === 'week') {
    const match = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!match) throw new Error('週の形式が不正です: ' + key);
    const start = weekStart(Number(match[1]), Number(match[2]));
    if (isoWeek(start) !== key) throw new Error('実在しないISO週です: ' + key);
    return {start, end: nextDate(start, 7)};
  }
  return null;
}
function cleanTitle(value, type) {
  if (type === 'year') return value.replace(/^\d{4}年(?:度)?[\s　]*/, '').trim();
  if (type === 'month') return value.replace(/^\d{4}-(?:0[1-9]|1[0-2])(?:\s*月目標[:：]?\s*)?/, '').trim();
  if (type === 'week') return value.replace(/^\d{4}-W\d{2}(?:\s*週目標[:：]?\s*)?/i, '').trim();
  return value.trim();
}
function parseGoals(input, options = {}) {
  if (options.compactPeriodIds) {
    const parsed = parseGoals(input, {...options, compactPeriodIds:false});
    const text = compactGoalIds(parsed.text, parsed.items);
    return {...parseGoals(text, {assignIds:false}), text, assignedIds:parsed.assignedIds};
  }
  const lines = String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const idMap = goalIdMap(lines.join('\n'));
  const items = [], seen = new Set(), parsedIndexes = new Set(); let assignedIds = 0;
  let active = false, sectionYear = '', annual = null, month = null, week = null, fence = '';
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const code = line.match(/^\s*(`{3,}|~{3,})/);
    if (code) { if (!fence) fence = code[1][0]; else if (fence === code[1][0]) fence = ''; continue; }
    if (fence || /^\s*>/.test(line)) continue;
    const heading = /^##\s+(\d{4})年/.exec(line);
    if (heading) { active = true; sectionYear = heading[1]; annual = null; month = null; week = null; continue; }
    if (/^##\s/.test(line)) { active = false; annual = null; month = null; week = null; continue; }
    if (!active) continue;
    const match = /^([ \t\u3000]*[-*]\s*\[([ xX\u3000])\]\s*)(.*)$/.exec(line);
    if (!match) continue;
    const prefix = match[1], checked = match[2].toLowerCase() === 'x';
    let body = match[3];
    const idMatch = body.match(ID_MARKER);
    if (!idMatch && /<!--\s*(?:mery-goal-id|g):/i.test(body)) throw new Error('目標IDの形式が不正です (' + (index + 1) + '行目)');
    let id = idMatch ? goalIdFromMarker(idMatch, idMap.aliases) : '';
    body = body.replace(ID_MARKER, '');
    if (/<!--\s*(?:mery-goal-id|g):/i.test(body)) throw new Error('目標IDが複数または不正です (' + (index + 1) + '行目)');
    let due = '';
    body = body.replace(DUE_MARKER, (all, value) => { due = value; return ''; });
    const comments = [];
    body = body.replace(/<!--([\s\S]*?)-->/g, all => { comments.push(all); return ''; });
    let time = '';
    const timeMatch = body.match(/\s+@((?:[01]\d|2[0-3]):[0-5]\d)-((?:[01]\d|2[0-3]):[0-5]\d)\s*$/);
    if (timeMatch) { time = timeMatch[1] + '-' + timeMatch[2]; body = body.slice(0, timeMatch.index); }
    body = body.trim();
    const yearMatch = /^(\d{4})年(?:度)?(?:\s|　|$)/.exec(body);
    const monthMatch = /^(\d{4}-(?:0[1-9]|1[0-2]))\b/.exec(body);
    const weekMatch = /^(\d{4}-W\d{2})\b/i.exec(body);
    let type, period = '', range = null, parentId = '';
    if (yearMatch || prefix.replace(/\s/g, '').startsWith('-[') && !prefix.match(/^[ \t\u3000]+/)) {
      type = 'year'; period = yearMatch?.[1] || sectionYear; range = dateRange(type, period);
      annual = {id, title: body, period, index}; month = null; week = null;
    } else if (monthMatch) {
      type = 'month'; period = monthMatch[1]; range = dateRange(type, period);
      parentId = annual?.id || ''; month = {id, title: body, period, index}; week = null;
    } else if (weekMatch) {
      type = 'week'; period = weekMatch[1].toUpperCase(); range = dateRange(type, period);
      parentId = month?.id || annual?.id || ''; week = {id, title: body, period, index};
    } else {
      type = 'todo'; parentId = week?.id || month?.id || annual?.id || '';
      if (due && !validDate(due)) throw new Error('不正な期限日: ' + due + ' (' + (index + 1) + '行目)');
      if (time && (!due || time.slice(0,5) >= time.slice(6))) throw new Error('TODOの時刻または期限日が不正です (' + (index + 1) + '行目)');
      if (!due && !parentId) continue;
    }
    if (!body) throw new Error('目標名が空です (' + (index + 1) + '行目)');
    if (!id && options.assignIds) {
      id = (options.idFactory || uuid)();
      if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error('ID生成に失敗しました。');
      id = id.toLowerCase();
      lines[index] = line + ' ' + goalIdComment(id,type);
      assignedIds++;
    }
    if (id && seen.has(id)) throw new Error('同じ目標IDが重複しています: ' + id + '。複製した行のIDを再発行してください。');
    if (id) seen.add(id);
    const item = {id, type, title: cleanTitle(body, type), done: checked, period, parentId, start: range?.start || '', end: range?.end || '', due, time, index, prefix, body, comments, rawLine: lines[index]};
    items.push(item);
    parsedIndexes.add(index);
    if (type === 'year') annual.id = id;
    if (type === 'month') month.id = id;
    if (type === 'week') week.id = id;
  }
  for(let index=0;index<lines.length;index++){
    if(!parsedIndexes.has(index)&&/^\s*[-*].*<!--\s*(?:mery-goal-id|g):/i.test(lines[index]))
      throw new Error('同期ID付きの目標行を解析できません ('+(index+1)+'行目)。チェック欄や書式を確認してください。');
  }
  if (items.some(item => !item.id)) throw new Error('同期用IDがありません。同期を適用してIDを割り当ててください。');
  return {items, text: lines.join('\n'), assignedIds};
}
function compactGoalIds(input, parsedItems) {
  const text = String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const items = parsedItems || parseGoals(text, {assignIds:false}).items;
  const map = goalIdMap(text), lines = text.split('\n');
  let next = Math.max(0, ...[...map.aliases.keys()].map(alias => parseInt(alias, 36)));
  let changed = false;
  for (const item of items) {
    let alias = map.ids.get(item.id);
    if (!alias) {
      alias = (++next).toString(36);
      map.aliases.set(alias, item.id); map.ids.set(item.id, alias);
    }
    const marker = ' <!--g:' + alias + '-->';
    const updated = lines[item.index].replace(ID_MARKER, marker);
    if (updated !== lines[item.index]) { lines[item.index] = updated; changed = true; }
  }
  if (!changed) return text;
  let result = lines.join('\n');
  const block = '<!-- mery-goal-id-map\n' + [...map.aliases].map(([alias,id]) => alias + '=' + id).join('\n') + '\n-->';
  if (map.block) {
    const old = map.block[0].trimStart();
    result = result.replace(old, block);
  } else result = result.replace(/\n*$/, '') + '\n\n' + block + '\n';
  return result;
}

function escapeText(value) { return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function unescapeText(value) { return value.replace(/\\[nN]/g, '\n').replace(/\\([\\,;])/g, '$1'); }
function foldLine(value) {
  const parts = []; let line = '', bytes = 0;
  for (const ch of value) {
    const size = Buffer.byteLength(ch, 'utf8');
    if (bytes + size > 75) { parts.push(line); line = ' '; bytes = 1; }
    line += ch; bytes += size;
  }
  parts.push(line); return parts.join('\r\n');
}
function formatDateTime(date, time) { return dateKey(date) + 'T' + time.replace(':', '') + '00'; }
function toIcs(item, stamp = new Date().toISOString()) {
  const type = item.type === 'todo' || item.type === 'task' ? 'VTODO' : 'VEVENT';
  const lines = ['BEGIN:' + type, 'UID:' + uidFor(item.id), 'DTSTAMP:' + stamp.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'), 'X-MERY-ID:' + item.id, 'X-MERY-TYPE:' + item.type];
  lines.push('X-MERY-SOURCE:' + (item.source || 'goals'));
  if(item.section)lines.push('X-MERY-SECTION:' + escapeText(item.section));
  if (type === 'VEVENT') {
    lines.push('DTSTART;VALUE=DATE:' + dateKey(item.start), 'DTEND;VALUE=DATE:' + dateKey(item.end));
  } else {
    if (item.due) {
      if (item.time) {
        const [start, end] = item.time.split('-');
        lines.push('DTSTART;TZID=Asia/Tokyo:' + formatDateTime(item.due, start), 'DUE;TZID=Asia/Tokyo:' + formatDateTime(item.due, end));
      } else lines.push('DUE;VALUE=DATE:' + dateKey(item.due));
    }
    lines.push('STATUS:' + (item.done ? 'COMPLETED' : 'NEEDS-ACTION'), 'PERCENT-COMPLETE:' + (item.done ? '100' : '0'));
    if (item.done) lines.push('COMPLETED:' + stamp.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'));
  }
  if(type==='VEVENT')lines.push('X-MERY-DONE:'+(item.done?'TRUE':'FALSE'));
  lines.push('SUMMARY:' + escapeText(item.title), 'CATEGORIES:' + escapeText(item.type));
  if (item.parentId) lines.push('RELATED-TO;RELTYPE=PARENT:' + uidFor(item.parentId));
  if ((item.type === 'todo' || item.type === 'task') && item.due) lines.push('X-MERY-DUE:' + item.due);
  lines.push('END:' + type);
  return lines.map(foldLine).join('\r\n');
}
function bundle(items) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MeryTODO//CalDAV//JA', 'CALSCALE:GREGORIAN', ...items.map(item => toIcs(item)), 'END:VCALENDAR'].map(foldLine).join('\r\n') + '\r\n';
}

function parseIcs(input) {
  const unfolded = String(input).replace(/^\uFEFF/, '').replace(/\r\n[ \t]|\n[ \t]/g, '').replace(/\r/g, '\n').split('\n');
  const items = []; let current = null;
  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT' || line === 'BEGIN:VTODO') { if (current) throw new Error('ICSの入れ子コンポーネントは未対応です。'); current = {type: line.slice(6) === 'VTODO' ? 'todo' : 'event', props: Object.create(null)}; continue; }
    if (line === 'END:VEVENT' || line === 'END:VTODO') { if (!current) throw new Error('ICSコンポーネントの終端が不正です。'); items.push(readIcsItem(current)); current = null; continue; }
    if (!current || !line || line.startsWith('BEGIN:') || line.startsWith('END:')) continue;
    const colon = line.indexOf(':'); if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(';');
    (current.props[name.toUpperCase()] ||= []).push({params: params.join(';'), value: line.slice(colon + 1)});
  }
  if (current) throw new Error('ICSの終端がありません。');
  return items;
}
function prop(item, name) { return item.props[name]?.[0] || null; }
function parseIcsDate(property) {
  if (!property) return '';
  const value = property.value;
  if (/^\d{8}$/.test(value)) return keyDate(value);
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
  if (!match) return '';
  if (match[7]) {
    const utc = new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),Number(match[4]),Number(match[5]),Number(match[6]||0)));
    utc.setUTCHours(utc.getUTCHours()+9);
    return {date:utc.toISOString().slice(0,10),time:utc.toISOString().slice(11,16)};
  }
  return {date: match[1]+'-'+match[2]+'-'+match[3], time: match[4]+':'+match[5]};
}
function readIcsItem(component) {
  const p = component.props;
  const uid = prop(component, 'UID')?.value || '';
  const idProperty = prop(component, 'X-MERY-ID')?.value;
  const id = idProperty && /^[a-f0-9]{32}$/i.test(idProperty) ? idProperty.toLowerCase() : (uid.match(/^([a-f0-9]{32})@local\.merytodo$/i)?.[1]?.toLowerCase() || crypto.createHash('sha256').update(uid).digest('hex').slice(0,32));
  const typeProperty = prop(component, 'X-MERY-TYPE')?.value;
  const type = typeProperty || (component.type === 'todo' ? 'todo' : (prop(component, 'CATEGORIES')?.value || 'year'));
  const summary = prop(component, 'SUMMARY');
  if (!summary) throw new Error('ICSに件名がありません: ' + uid);
  const item = {id, uid: uid || uidFor(id), type, source:prop(component,'X-MERY-SOURCE')?.value||'tasks',section:unescapeText(prop(component,'X-MERY-SECTION')?.value||''),title: unescapeText(summary.value), done: prop(component,'STATUS')?.value?.toUpperCase() === 'COMPLETED' || prop(component,'PERCENT-COMPLETE')?.value === '100' || prop(component,'X-MERY-DONE')?.value?.toUpperCase()==='TRUE', parentId: '', due: '', time: '', start: '', end: ''};
  const parentUid = p['RELATED-TO']?.find(x => /RELTYPE=PARENT/i.test(x.params))?.value;
  if (parentUid) item.parentId = parentUid.replace(/@local\.merytodo$/i, '');
  if (type === 'todo' || type === 'task') {
    const due = parseIcsDate(prop(component, 'DUE') || prop(component, 'X-MERY-DUE'));
    if (typeof due === 'string') item.due = due;
    else if (due) item.due = due.date;
    const start = parseIcsDate(prop(component,'DTSTART'));
    if (start && typeof start === 'object' && item.due) {
      const end = typeof due === 'object' ? due : null;
      if (end) item.time = start.time + '-' + end.time;
    }
  } else {
    const start = parseIcsDate(prop(component,'DTSTART')), end = parseIcsDate(prop(component,'DTEND'));
    if (typeof start !== 'string' || typeof end !== 'string') throw new Error('目標期間の日付が不正です: ' + uid);
    item.start = start; item.end = end;
  }
  return item;
}

function equal(a, b) {
  const pick = x => ({id:x.id,type:x.type,source:x.source||'goals',section:x.section||'',date:x.date||'',title:x.title,done:!!x.done,start:x.start||'',end:x.end||'',due:x.due||'',time:x.time||'',parentId:x.parentId||''});
  return JSON.stringify(pick(a)) === JSON.stringify(pick(b));
}
function planSync(localItems, remoteItems, entries = {}) {
  const local = new Map(localItems.map(x => [x.id, x])), remote = new Map();
  for (const item of remoteItems) { if (remote.has(item.id)) throw new Error('CalDAV内で同期IDが重複しています: ' + item.id); remote.set(item.id, item); }
  const operations = [];
  for (const id of new Set([...local.keys(),...remote.keys(),...Object.keys(entries)])) {
    const l=local.get(id), r=remote.get(id), base=entries[id]; let action;
    if (!base) action = l && r ? (equal(l,r)?'adopt':'conflict') : l?'push':r?'pull':'forget';
    else if (!l && !r) action='forget';
    else if (!l) action=equal(r,base.remote)?'deleteRemote':'conflict';
    else if (!r) action=equal(l,base.local)?'deleteLocal':'conflict';
    else {
      const lc=!equal(l,base.local), rc=!equal(r,base.remote);
      if(lc&&rc){
        const fields=['type','source','section','date','title','done','period','start','end','due','time','parentId'],merged={...l},conflicts=[];
        for(const field of fields){
          const localChanged=(l[field]??'')!==(base.local[field]??''),remoteChanged=(r[field]??'')!==(base.remote[field]??'');
          if(localChanged&&remoteChanged&&(l[field]??'')!==(r[field]??''))conflicts.push(field);
          else if(remoteChanged)merged[field]=r[field];
        }
        action=conflicts.length?'conflict':'merge';operations.push({id,action,local:l,remote:r,base,merged,conflictFields:conflicts});continue;
      }
      action=lc?'push':rc?'pull':'adopt';
    }
    operations.push({id,action,local:l,remote:r,base});
  }
  return operations;
}

module.exports = {ID_MARKER,DUE_MARKER,uuid,uidFor,goalIdComment,compactGoalIds,validDate,dateKey,keyDate,nextDate,weekStart,isoWeek,dateRange,cleanTitle,parseGoals,escapeText,unescapeText,foldLine,toIcs,bundle,parseIcs,equal,planSync};
