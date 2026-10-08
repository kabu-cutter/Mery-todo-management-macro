'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../Mery_作業ハブを開く.js'), 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/^#.*$/gm, '')
    .replace(/^main\(\);$/m, '');

test('work hub opens files without saving over existing contents', () => {
    const calls = [];
    const taskPath = 'C:\\Projects\\ai-work-hub\\TASKS.md';
    const openDocument = { FullName: taskPath, Activate() { calls.push('activate'); } };
    const documents = [];
    const editor = {
        Documents: { get Count() { return documents.length; }, Item(index) { return documents[index]; } },
        OpenFile(fileName, encoding, flags) { calls.push([fileName, encoding, flags]); documents.push(openDocument); },
        NewFile() { throw new Error('must not create a document'); }
    };
    const context = vm.createContext({
        editor,
        meOpenAllowNewWindow: 1,
        ActiveXObject: function () { return { GetAbsolutePathName: fileName => fileName }; }
    });
    vm.runInContext(source, context);

    context.showFileInSingleTab(taskPath);
    context.showFileInSingleTab(taskPath);

    assert.deepEqual(calls, [[taskPath, 0, 1], 'activate']);
});

test('work hub reports the original error through Windows popup', () => {
    let message = '';
    const context = vm.createContext({ editor: {}, ActiveXObject: function () { return { Popup(value) { message = value; } }; } });
    vm.runInContext(source, context);
    context.ensureFolder = () => { throw new Error('folder failed'); };
    context.main();
    assert.match(message, /作業ハブを開けませんでした: folder failed/);
});
