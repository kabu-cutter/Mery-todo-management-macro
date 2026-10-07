'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=path.resolve(__dirname,'../Mery_作業メニュー.js');
const source=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').replace(/^#.*$/gm,'').replace(/^main\s*\(\s*\)\s*;\s*$/m,'');
const context=vm.createContext({ScriptFullName:'C:\\Mery\\Macros\\Mery_作業メニュー.js'});
let present=true;
let alertMessage='';
context.alert=message=>{alertMessage=message;};
context.ActiveXObject=function(){return {
 GetParentFolderName:fullPath=>fullPath.substring(0,fullPath.lastIndexOf('\\')),
 BuildPath:(folder,fileName)=>folder+'\\'+fileName,
 FileExists:filePath=>present&&filePath==='C:\\Mery\\Macros\\Mery_目標管理.js'
};};
vm.runInContext(source,context,{filename:file});

test('parent macro resolves the goals macro beside itself and checks its presence',()=>{
 assert.equal(context.macroPathBesideLauncher('Mery_目標管理.js'),'C:\\Mery\\Macros\\Mery_目標管理.js');
 assert.equal(context.macroFileExistsBesideLauncher('Mery_目標管理.js'),true);
 present=false;
 assert.equal(context.macroFileExistsBesideLauncher('Mery_目標管理.js'),false);
});

test('button guide explains how to launch the parent macro from the macro bar',()=>{
 context.showMacroButtonGuide();
 assert.match(alertMessage,/マクロ.*カスタマイズ/);
 assert.match(alertMessage,/新規作成/);
 assert.match(alertMessage,/マクロバー/);
 assert.match(alertMessage,/C:\\Mery\\Macros\\Mery_作業メニュー\.js/);
 assert.match(alertMessage,/ボタンを押したときに実行します/);
 assert.match(alertMessage,/起動時の自動実行は設定しません/);
});
