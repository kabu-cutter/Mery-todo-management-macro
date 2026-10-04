'use strict';
const fs=require('node:fs');
const path=require('node:path');
const dir=__dirname;
const names=['progress.cjs','task-identities.cjs','tasks-sync.cjs','calendar-sync-core.cjs','calendar-google.cjs','calendar-store.cjs','calendar-sync.cjs'];
const definitions=names.map(name=>JSON.stringify(name)+': function(require, module, exports, __filename, __dirname) {\n'+fs.readFileSync(path.join(dir,name),'utf8')+'\n}').join(',\n');
const runtime=`'use strict';
const __path = require('node:path');
const __definitions = {${definitions}};
const __modules = Object.create(null);
for (const name of Object.keys(__definitions)) __modules[name] = {exports:{}};
const __loaded = new Set();
const __run = require.main === module;
function __load(name) {
  if (__loaded.has(name)) return __modules[name].exports;
  if (!__definitions[name]) throw new Error('Missing embedded module: ' + name);
  __loaded.add(name);
  const localRequire = spec => spec.startsWith('./') ? __load(spec.slice(2)) : require(spec);
  localRequire.main = __run ? __modules['calendar-sync.cjs'] : null;
  __definitions[name](localRequire, __modules[name], __modules[name].exports, __path.join(__dirname,name), __dirname);
  return __modules[name].exports;
}
module.exports = __load('calendar-sync.cjs');
`;
let macro=fs.readFileSync(path.join(dir,'mery-launcher.template.js'),'utf8').replace(/\r\n/g,'\n');
const begin=macro.indexOf('        var helper = ');
const end=macro.indexOf('        var menu = ',begin);
if(begin<0 || end<0) throw new Error('Launcher template is invalid');
macro=macro.slice(0,begin)+`        ensureRuntimeFolder(HUB_DIR, fso);
        var runtimeDir = fso.BuildPath(HUB_DIR, ".mery-calendar");
        ensureRuntimeFolder(runtimeDir, fso);
        var helper = fso.BuildPath(runtimeDir, "calendar-runtime.cjs");
        writeRuntime(helper, EMBEDDED_CALENDAR_RUNTIME);
`+macro.slice(end);
macro=macro.replace('main();','// 埋め込まれた処理を準備してから、ファイル末尾で実行します。');
macro=macro.replace('// Node.js 24 以上が必要です。Google 認証と初期設定は README_Google_Calendar.md を参照。','// このファイルだけを Mery に登録して実行できます。Node.js 24 以上が必要です。\n// SQLite・Google 認証・同期処理は下部に埋め込まれています。\n// 初回のみ HUB_DIR + "\\\\.mery-calendar\\\\oauth-client.json" に Google の認証 JSON を置いてください。');
macro+=`
function ensureRuntimeFolder(path, fso) {
    if (fso.FolderExists(path)) return;
    var parent = fso.GetParentFolderName(path);
    if (parent && !fso.FolderExists(parent)) ensureRuntimeFolder(parent, fso);
    fso.CreateFolder(path);
}

function writeRuntime(path, text) {
    var stream = new ActiveXObject("ADODB.Stream");
    try {
        stream.Type = 2;
        stream.Charset = "utf-8";
        stream.Open();
        stream.WriteText(text);
        stream.SaveToFile(path, 2);
    } finally {
        if (stream.State !== 0) stream.Close();
    }
}

// 以下は自動生成部分です。変更後は calendar-sync/build-single-file.cjs で再生成します。
var EMBEDDED_CALENDAR_RUNTIME = [
`;
const chunks=[];
for(let index=0;index<runtime.length;index+=160) chunks.push(JSON.stringify(runtime.slice(index,index+160)));
macro+=chunks.map(chunk=>'    '+chunk).join(',\n')+'\n].join("");\n\nmain();\n';
fs.writeFileSync(path.join(dir,'..','Mery_Googleカレンダーと同期.js'),'\uFEFF'+macro.replace(/^\uFEFF/,''),'utf8');
console.log('Built single-file Mery calendar macro.');
