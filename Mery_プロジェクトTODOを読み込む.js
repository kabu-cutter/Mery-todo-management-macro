#title = "プロジェクトTODO.mdを読み込む"

// Mery タスク管理 v0.6.0
// 開発中プロジェクトの TODO.md を読み込み、C:\Projects\ai-work-hub\PROJECT_TODO.md に表示します。
// 元の TODO.md は書き換えません。
// アクティブ文書の場所から上位フォルダを探し、TODO.md がなければフォルダ選択します。

var HUB_DIR = "C:\\Projects\\ai-work-hub";
var PROJECT_TODO_VIEW_PATH = HUB_DIR + "\\PROJECT_TODO.md";

main();

function main() {
    try {
        ensureFolder(HUB_DIR);

        var todoPath = findTodoFromActiveDocument();

        if (!todoPath) {
            if (!Confirm("アクティブ文書の場所から TODO.md が見つかりませんでした。\nプロジェクトフォルダを選択しますか？")) {
                return;
            }

            todoPath = browseProjectTodo();
        }

        if (!todoPath) {
            return;
        }

        var todoText = readTextFile(todoPath);

        if (!todoText || todoText.replace(/\s/g, "").length === 0) {
            alert("TODO.md は見つかりましたが、中身が空でした。\n\n" + todoPath);
            return;
        }

        var viewText = buildProjectTodoView(todoPath, todoText);
        var viewDoc = showTextInSingleTab(PROJECT_TODO_VIEW_PATH, viewText);
        viewDoc.Activate();

        alert("プロジェクト TODO.md を読み込みました。\n\n" + todoPath);

    } catch (e) {
        alert("エラー: " + e.message);
    }
}

function findTodoFromActiveDocument() {
    var fso = new ActiveXObject("Scripting.FileSystemObject");

    var activePath = "";

    try {
        activePath = document.FullName;
    } catch (e) {
        activePath = "";
    }

    if (!activePath) {
        return "";
    }

    var fileName = "";
    try {
        fileName = fso.GetFileName(activePath).toLowerCase();
    } catch (e2) {
        fileName = "";
    }

    if (fileName === "todo.md") {
        return activePath;
    }

    var dir = "";
    try {
        dir = fso.GetParentFolderName(activePath);
    } catch (e3) {
        dir = "";
    }

    if (!dir) {
        return "";
    }

    return findTodoUpwards(dir);
}

function findTodoUpwards(startDir) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var dir = startDir;

    for (var i = 0; i < 20; i++) {
        if (!dir || !fso.FolderExists(dir)) {
            break;
        }

        var candidate = fso.BuildPath(dir, "TODO.md");
        if (fso.FileExists(candidate)) {
            return candidate;
        }

        var parent = fso.GetParentFolderName(dir);

        if (!parent || parent === dir) {
            break;
        }

        dir = parent;
    }

    return "";
}

function browseProjectTodo() {
    var shell = new ActiveXObject("Shell.Application");
    var folder = shell.BrowseForFolder(0, "TODO.md があるプロジェクトフォルダを選択してください", 0, "C:\\Projects");

    if (!folder) {
        return "";
    }

    var folderPath = folder.Self.Path;
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var todoPath = fso.BuildPath(folderPath, "TODO.md");

    if (fso.FileExists(todoPath)) {
        return todoPath;
    }

    alert("選択したフォルダに TODO.md がありませんでした。\n\n" + folderPath);
    return "";
}

function buildProjectTodoView(todoPath, todoText) {
    return ""
        + "# PROJECT_TODO\n\n"
        + "Source: `" + todoPath + "`\n\n"
        + "使い方:\n"
        + "- 今日のTASKSに入れたい行を選択\n"
        + "- 作業メニュー → 選択範囲を今日のTASKS欄へ追加\n"
        + "- 追加先を選ぶ\n\n"
        + "注意:\n"
        + "- この画面は読み込み表示用です\n"
        + "- 元のプロジェクトTODO.mdは自動では書き換えません\n\n"
        + "---\n\n"
        + normalizeTodoText(todoText)
        + "\n";
}

function normalizeTodoText(text) {
    var normalized = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    return normalized.replace(/\s+$/g, "");
}

function showTextInSingleTab(path, text) {
    var d = findOpenDocumentByFullName(path);

    if (d) {
        d.Activate();
        d.Text = text;
        d.Save(path);

        try {
            d.selection.StartOfDocument(false);
        } catch (e) {
        }

        return d;
    }

    writeTextFile(path, text);
    editor.NewFile();
    d = editor.ActiveDocument;
    d.Text = text;
    d.Save(path);

    try {
        d.selection.StartOfDocument(false);
    } catch (e2) {
    }

    return d;
}

function ensureFolder(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FolderExists(path)) {
        fso.CreateFolder(path);
    }
}

function readTextFile(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    if (!fso.FileExists(path)) {
        return "";
    }

    try {
        var stream = new ActiveXObject("ADODB.Stream");
        stream.Type = 2;
        stream.Charset = "utf-8";
        stream.Open();
        stream.LoadFromFile(path);
        var text = stream.ReadText();
        stream.Close();
        return text;
    } catch (e) {
        var file = fso.OpenTextFile(path, 1, false, -1);
        var fallback = file.ReadAll();
        file.Close();
        return fallback;
    }
}

function writeTextFile(path, text) {
    try {
        var stream = new ActiveXObject("ADODB.Stream");
        stream.Type = 2;
        stream.Charset = "utf-8";
        stream.Open();
        stream.WriteText(text);
        stream.SaveToFile(path, 2);
        stream.Close();
    } catch (e) {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var file = fso.CreateTextFile(path, true, true);
        file.Write(text);
        file.Close();
    }
}

function normalizePath(path) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    return fso.GetAbsolutePathName(path).toLowerCase();
}

function findOpenDocumentByFullName(fullPath) {
    var target = normalizePath(fullPath);

    for (var i = 0; i < editor.Documents.Count; i++) {
        var d = editor.Documents.Item(i);

        if (!d.FullName) {
            continue;
        }

        if (normalizePath(d.FullName) === target) {
            return d;
        }
    }

    return null;
}
