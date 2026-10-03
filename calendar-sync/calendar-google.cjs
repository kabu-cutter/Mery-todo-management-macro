'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const http=require('node:http');
const {execFileSync,spawn}=require('node:child_process');
const SCOPES=['https://www.googleapis.com/auth/tasks','https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
function protect(text, decrypt=false) {
  if(process.platform!=='win32') throw new Error('認証情報の保存は Windows の暗号化機能を使用します。');
  const method=decrypt?'Unprotect':'Protect';
  const script='Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::'+method+'($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))';
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:Buffer.from(text).toString('base64'),encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
  return Buffer.from(output.trim(),'base64');
}
function loadToken(file) { return fs.existsSync(file) ? JSON.parse(protect(fs.readFileSync(file),true).toString('utf8')) : null; }
function saveToken(file,token) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.tmp';
  fs.writeFileSync(tmp,protect(JSON.stringify(token)));
  fs.renameSync(tmp,file);
}
async function tokenRequest(parameters) {
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams(parameters),signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error('Google 認証に失敗しました（HTTP '+response.status+'）。「Google カレンダーの接続設定」で再接続してください。');
  return response.json();
}
async function authorize(client, tokenFile) {
  const state=crypto.randomBytes(24).toString('hex');
  const verifier=crypto.randomBytes(48).toString('base64url');
  const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  const server=http.createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const redirect='http://127.0.0.1:'+server.address().port+'/oauth2callback';
  const authorization=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [k,v] of Object.entries({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:SCOPES.join(' '),state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent'})) authorization.searchParams.set(k,v);
  let timer;
  try {
    const code=await new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(new Error('Google ログインが5分以内に完了しませんでした。')),300000);
      server.on('request',(req,res)=>{
        const url=new URL(req.url,redirect);
        if(url.pathname!=='/oauth2callback') {res.writeHead(404);res.end();return;}
        if(url.searchParams.get('state')!==state) {res.writeHead(400);res.end('Invalid request');return;}
        if(url.searchParams.has('error')||!url.searchParams.get('code')) {res.end('Authorization was cancelled.');reject(new Error('Google 接続がキャンセルされました。'));return;}
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.end('<p>Google カレンダーに接続しました。この画面を閉じて Mery に戻ってください。</p>');
        resolve(url.searchParams.get('code'));
      });
      const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',authorization.toString()],{windowsHide:true,stdio:'ignore'});
      browser.once('error',reject);
    });
    const result=await tokenRequest({client_id:client.client_id,client_secret:client.client_secret||'',code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'});
    if(!result.refresh_token) throw new Error('継続接続用の認証情報を取得できませんでした。再接続してください。');
    const token={...result,clientId:client.client_id,expiresAt:Date.now()+result.expires_in*1000};
    saveToken(tokenFile,token);
    return token;
  } finally {clearTimeout(timer);server.close();}
}
async function connect(config, auth=false) {
  if(!fs.existsSync(config.credentialsPath)) throw new Error('Google の OAuth 設定ファイルがありません。README_Google_Calendar.md の初期設定を行ってください: '+config.credentialsPath);
  const data=JSON.parse(fs.readFileSync(config.credentialsPath,'utf8').replace(/^\uFEFF/,''));
  const client=data.installed;
  if(!client?.client_id) throw new Error('「デスクトップアプリ」用の OAuth 認証 JSON を指定してください。');
  let token=auth?await authorize(client,config.tokenPath):loadToken(config.tokenPath);
  if(!token||token.clientId!==client.client_id) throw new Error('Google に未接続です。作業メニューの「Google カレンダーの接続設定」を実行してください。');
  if(token.expiresAt<Date.now()+60000) {
    const refreshed=await tokenRequest({client_id:client.client_id,client_secret:client.client_secret||'',refresh_token:token.refresh_token,grant_type:'refresh_token'});
    token={...token,...refreshed,expiresAt:Date.now()+refreshed.expires_in*1000};
    saveToken(config.tokenPath,token);
  }
  const tasksRequest=async(method,resource,body,etag)=>{
    if(!token.scope?.split(' ').includes('https://www.googleapis.com/auth/tasks'))throw new Error('Google Tasks の権限がありません。接続設定を再実行してください。');
    const response=await fetch('https://tasks.googleapis.com/tasks/v1/'+resource,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Google Tasks 通信エラー（HTTP '+response.status+'）。Google Tasks API の有効化と再接続を確認してください。');
    return response.status===204?null:response.json();
  };
  return {tasksRequest,request:async(method,resource,body,etag)=>{
    const response=await fetch('https://www.googleapis.com/calendar/v3/'+resource,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    if(!response.ok) {const error=new Error(response.status===412?'カレンダーが同期中に変更されました。再度プレビューしてください。':'Google カレンダー通信エラー（HTTP '+response.status+'）');error.status=response.status;throw error;}
    return response.status===204 ? null : response.json();
  }};
}
async function listAll(api,calendarId) {
  const result=[];let page='';
  do {
    const query=new URLSearchParams({maxResults:'2500',showDeleted:'true',singleEvents:'false',...(page?{pageToken:page}:{})});
    const response=await api.request('GET','calendars/'+encodeURIComponent(calendarId)+'/events?'+query);
    result.push(...(response.items||[]));page=response.nextPageToken||'';
  } while(page);
  return result;
}
async function listCalendars(api) {
  const result=[];let page='';
  do {
    const response=await api.request('GET','users/me/calendarList?'+new URLSearchParams({maxResults:'250',...(page?{pageToken:page}:{})}));
    result.push(...(response.items||[]));page=response.nextPageToken||'';
  } while(page);
  return result;
}
module.exports={connect,listAll,listCalendars};
