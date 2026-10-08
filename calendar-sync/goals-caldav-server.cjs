'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {URL}=require('node:url');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const core=require('./goals-caldav-core.cjs');
const {GoalCalDavStore}=require('./goals-caldav-store.cjs');

const HOST='127.0.0.1', PORT=18453;
const PREFIX='/calendars/default/MeryTODO/';
function xml(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function prop(name,value,namespace='d'){return '<'+namespace+':'+name+'>'+value+'</'+namespace+':'+name+'>';}
function canonicalPath(pathname){
  if(!pathname.startsWith(PREFIX)||pathname===PREFIX)return pathname;
  const name=pathname.slice(PREFIX.length);
  if(!name||name.includes('/'))return pathname;
  return PREFIX+encodeURIComponent(decodeURIComponent(name));
}
function calendarDocument(item){
  let calendarData=String(item).replace(/^\uFEFF/,'').trim();
  if(!/^BEGIN:VCALENDAR(?:\r?\n)/.test(calendarData))calendarData=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//MeryTODO//CalDAV//JA','CALSCALE:GREGORIAN',calendarData,'END:VCALENDAR'].join('\r\n');
  return calendarData+'\r\n';
}
function itemResponse(href,item,etag,includeData=false){
  const calendarData=calendarDocument(item);
  const data=includeData?prop('calendar-data',xml(calendarData),'c'):'';
  return '<d:response><d:href>'+xml(href)+'</d:href><d:propstat><d:prop>'+prop('getetag',xml(etag))+data+'</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>';
}
function deletedResponse(href){return '<d:response><d:href>'+xml(href)+'</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>';}
function multistatus(res,responses,extra=''){
  res.statusCode=207;res.setHeader('Content-Type','application/xml; charset=utf-8');
  res.end('<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">'+responses.join('')+extra+'</d:multistatus>');
}
function collectionProperties(href,display,token,root=false){
  let resource='<d:collection/>'+(root?'':'<c:calendar/>');
  let p='<d:resourcetype>'+resource+'</d:resourcetype>'+prop('displayname',xml(display));
  p+=prop('current-user-principal','<d:href>/principals/users/default/</d:href>');
  if(root)p+=prop('calendar-home-set','<d:href>/calendars/default/</d:href>','c');
  else {
    p+=prop('supported-calendar-component-set','<c:comp name="VEVENT"/><c:comp name="VTODO"/>','c');
    p+='<d:supported-report-set>'+
      '<d:supported-report><d:report><c:calendar-query/></d:report></d:supported-report>'+
      '<d:supported-report><d:report><c:calendar-multiget/></d:report></d:supported-report>'+
      '<d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>'+
      '</d:supported-report-set>';
    p+=prop('sync-token','http://'+HOST+':'+PORT+'/sync/'+token);
    p+='<cs:getctag>'+token+'</cs:getctag>';
    p+=prop('getetag','"'+token+'"');
    p+=prop('calendar-description',xml('MeryTODOの目標とToDo。PC内のみで同期します。'),'c');
  }
  return p;
}
function requestedHrefs(body){return [...body.matchAll(/<(?:[\w-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?href>/gi)].map(x=>x[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'"));}
function makeHref(location){return canonicalPath(location.startsWith('/')?location:new URL(location,'http://'+HOST+':'+PORT).pathname);}
function collectionResponse(pathname,store,display,root=false){
  return '<d:response><d:href>'+xml(pathname)+'</d:href><d:propstat><d:prop>'+collectionProperties(pathname,display,store.token(),root)+'</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>';
}
function writeResponse(res,status,headers={},body=''){res.writeHead(status,headers);res.end(body);}
function readBody(req){return new Promise((resolve,reject)=>{const chunks=[];let size=0;req.on('data',c=>{size+=c.length;if(size>2*1024*1024){reject(new Error('Request body is too large'));req.destroy();return;}chunks.push(c);});req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));req.on('error',reject);});}
function parseToken(value){const match=String(value||'').match(/(?:sync\/)?(\d+)\/?$/);return match?Number(match[1]):0;}
function loadStore(hub){
  const dir=path.join(hub,'.mery-calendar');fs.mkdirSync(dir,{recursive:true});
  return new GoalCalDavStore(path.join(dir,'goals-caldav.sqlite'));
}
function createServer(hub){
  const store=loadStore(hub);
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://'+HOST+':'+PORT), pathname=canonicalPath(url.pathname);
      if(pathname==='/healthz')return writeResponse(res,200,{'Content-Type':'application/json'},JSON.stringify({ok:true,host:HOST,port:PORT,token:store.token()}));
      if(pathname==='/.well-known/caldav') {res.writeHead(301,{Location:PREFIX});return res.end();}
      if(req.method==='OPTIONS')return writeResponse(res,200,{DAV:'1, 2, 3, calendar-access, sync-collection','Allow':'OPTIONS, GET, HEAD, PROPFIND, REPORT, PUT, DELETE, MKCALENDAR','MS-Author-Via':'DAV'});
      if(req.method==='GET'||req.method==='HEAD') {
        if(pathname===PREFIX||pathname===PREFIX.slice(0,-1))return writeResponse(res,200,{'Content-Type':'text/calendar; charset=utf-8','ETag':'"'+store.token()+'"'},core.bundle(store.resources().map(r=>core.parseIcs(r.ical)[0]).filter(Boolean)));
        const resource=store.get(pathname);
        if(!resource)return writeResponse(res,404);
        const headers={'Content-Type':'text/calendar; charset=utf-8','ETag':resource.etag,'Last-Modified':new Date(resource.updated_at).toUTCString()};
        if(req.headers['if-none-match']===resource.etag)return writeResponse(res,304,headers);
        return writeResponse(res,200,headers,req.method==='HEAD'?'':calendarDocument(resource.ical));
      }
      if(req.method==='PROPFIND') {
        const body=await readBody(req), depth=req.headers.depth||'0';
        if(pathname==='/')return multistatus(res,[collectionResponse('/',store,'MeryTODO',true)]);
        if(pathname==='/principals/users/default'||pathname==='/principals/users/default/') {
          const p='<d:resourcetype><d:principal/></d:resourcetype>'+prop('calendar-home-set','<d:href>/calendars/default/</d:href>','c')+prop('displayname','MeryTODO');
          return multistatus(res,['<d:response><d:href>/principals/users/default/</d:href><d:propstat><d:prop>'+p+'</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>']);
        }
        if(pathname==='/calendars/default'||pathname==='/calendars/default/') {
          const r=[collectionResponse('/calendars/default/',store,'MeryTODO',true)];
          if(depth==='1')r.push(collectionResponse(PREFIX,store,'MeryTODO'));
          return multistatus(res,r);
        }
        if(pathname===PREFIX||pathname===PREFIX.slice(0,-1)) {
          const r=[collectionResponse(PREFIX,store,'MeryTODO')];
          if(depth==='1')for(const entry of store.resources())r.push(itemResponse(entry.href,entry.ical,entry.etag));
          return multistatus(res,r);
        }
        const resource=store.get(pathname);
        if(!resource)return writeResponse(res,404);
        return multistatus(res,[itemResponse(pathname,resource.ical,resource.etag)]);
      }
      if(req.method==='REPORT') {
        const body=await readBody(req);
        if(!pathname.startsWith(PREFIX))return writeResponse(res,404);
        if(/sync-collection/i.test(body)) {
          const since=parseToken(body.match(/<[^>]*sync-token[^>]*>([\s\S]*?)<\//i)?.[1]);
          const responses=[];
          for(const change of store.changesAfter(since)) {
            if(change.status==='deleted')responses.push(deletedResponse(change.href));
            else responses.push(itemResponse(change.href,change.ical,change.etag,true));
          }
          return multistatus(res,responses,'<d:sync-token>http://'+HOST+':'+PORT+'/sync/'+store.token()+'</d:sync-token>');
        }
        const hrefs=requestedHrefs(body);
        if(/calendar-multiget/i.test(body)&&hrefs.length) {
          const responses=hrefs.map(raw=>{const href=makeHref(raw),entry=store.get(href);return entry?itemResponse(href,entry.ical,entry.etag,true):deletedResponse(href);});
          return multistatus(res,responses);
        }
        if(/calendar-query/i.test(body))return multistatus(res,store.resources().map(entry=>itemResponse(entry.href,entry.ical,entry.etag,true)));
        return writeResponse(res,501);
      }
      if(req.method==='PUT') {
        if(!pathname.startsWith(PREFIX)||pathname===PREFIX)return writeResponse(res,403);
        const body=await readBody(req),components=core.parseIcs(body);
        if(components.length!==1) return writeResponse(res,400,{'Content-Type':'text/plain'},'Expected one VEVENT or VTODO per resource.');
        const item=components[0], old=store.get(pathname);
        if(req.headers['if-match']&&(!old||req.headers['if-match']!==old.etag))return writeResponse(res,412);
        if(req.headers['if-none-match']==='*'&&old)return writeResponse(res,412);
        item.uid=item.uid||core.uidFor(item.id);
        const canonical=core.toIcs(item)+'\r\n';
        const saved=store.put(pathname,item,canonical);
        return writeResponse(res,old?204:201,{ETag:saved.etag,Location:pathname});
      }
      if(req.method==='DELETE') {
        if(!pathname.startsWith(PREFIX)||pathname===PREFIX)return writeResponse(res,403);
        const old=store.get(pathname);if(!old)return writeResponse(res,404);
        if(req.headers['if-match']&&req.headers['if-match']!==old.etag)return writeResponse(res,412);
        store.delete(pathname);return writeResponse(res,204);
      }
      if(req.method==='MKCALENDAR')return writeResponse(res,405);
      return writeResponse(res,405,{Allow:'OPTIONS, GET, HEAD, PROPFIND, REPORT, PUT, DELETE'});
    } catch(error) {
      console.error(new Date().toISOString(),req.method,req.url,error.stack||error.message);
      if(!res.headersSent)writeResponse(res,500,{'Content-Type':'text/plain; charset=utf-8'},'Local CalDAV error: '+error.message);
      else res.destroy();
    }
  });
  server.on('close',()=>store.close());
  server.listen(PORT,HOST,()=>console.log('MeryTODO CalDAV listening on http://'+HOST+':'+PORT+PREFIX));
  return server;
}

const hubArg=process.argv.indexOf('--hub');
const hub=hubArg>=0?process.argv[hubArg+1]:'C:\\Projects\\ai-work-hub';
if(require.main===module)createServer(path.resolve(hub));
module.exports={createServer,HOST,PORT,PREFIX,canonicalPath,calendarDocument,makeHref,xml,requestedHrefs,parseToken};
