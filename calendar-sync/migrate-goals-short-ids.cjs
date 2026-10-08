'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const core=require('./goals-caldav-core.cjs');

function migrate(file){
  const original=fs.readFileSync(file);
  const source=original.toString('utf8');
  const before=core.parseGoals(source,{assignIds:false});
  const updated=core.compactGoalIds(before.text,before.items);
  const after=core.parseGoals(updated,{assignIds:false});
  const identity=items=>items.map(({id,type,title,period,parentId,done,due,time})=>({id,type,title,period,parentId,done,due,time}));
  if(JSON.stringify(identity(before.items))!==JSON.stringify(identity(after.items)))throw new Error('移行前後で目標の内容またはIDが変化しました。');
  if(updated===before.text)return {changed:false,items:after.items.length};
  const stamp=new Date().toISOString().replace(/[-:.TZ]/g,'')+'_'+crypto.randomBytes(3).toString('hex');
  const backup=file.replace(/\.md$/i,'_backup_short_ids_'+stamp+'.md');
  fs.writeFileSync(backup,original,{flag:'wx'});
  if(!fs.readFileSync(file).equals(original))throw new Error('バックアップ後にGOALS.mdが変更されました。再実行してください。');
  const temp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
  try{
    const eol=source.includes('\r\n')?'\r\n':'\n';
    fs.writeFileSync(temp,(source.startsWith('\uFEFF')?'\uFEFF':'')+updated.replace(/\n/g,eol),'utf8');
    fs.renameSync(temp,file);
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  return {changed:true,items:after.items.length,periods:after.items.filter(item=>item.type!=='todo').length,backup};
}
if(require.main===module){
  try{console.log(JSON.stringify(migrate(path.resolve(process.argv[2]||'C:\\Projects\\ai-work-hub\\GOALS.md'))));}
  catch(error){console.error(error.stack||error.message);process.exitCode=1;}
}
module.exports={migrate};
