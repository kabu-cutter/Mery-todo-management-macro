#language = "V8"
#title = "OpenAI API 呼び出し部品"

// Mery TODO TASKS案生成用 OpenAI Responses API 呼び出し
// APIキーは OPENAI_API_KEY 環境変数から読み、ファイルには保存しません。
// TASKS.mdは変更せず、指定された出力先へ回答を保存します。

const OPENAI_MODEL = "gpt-5.6-sol";
const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
const MAX_PROMPT_TOKEN = 8000;
const MAX_OUTPUT_TOKENS = 4000;
const REQUEST_TIMEOUT_MS = 180000;
const SELECTED_TEMPLATE_PROMPT_TAG = "gemini-selected-template-prompt";
const TEMPORARY_CUSTOM_INSTRUCTION_TAG = "gemini-temporary-custom-instruction";
const OUTPUT_PATH_TAG = "gemini-output-path";
const OUTPUT_TITLE_TAG = "gemini-output-title";
const OUTPUT_KIND_TAG = "gemini-output-kind";

const doc = document;
const sel = document.selection;
let abortRequestFlg = false;
let requestCompletedFlg = false;
let activeRequestController = null;

main();

async function main() {
    let promptText = sel.Text.trim();
    const isTemplate = doc.Tag.exists(SELECTED_TEMPLATE_PROMPT_TAG);
    const instruction = isTemplate ? String(doc.Tag[SELECTED_TEMPLATE_PROMPT_TAG] || "") : "";
    const customInstruction = getTagText(TEMPORARY_CUSTOM_INSTRUCTION_TAG);
    if (instruction) promptText = instruction + "\n\n# 入力テキスト\n\n" + promptText;
    if (roughTokenize(promptText) > MAX_PROMPT_TOKEN) {
        shell.Popup("プロンプトが上限を超えています。対象を短くしてください。", 0, "GPT API", 48);
        return;
    }

    const apiKey = shell.getEnv(OPENAI_API_KEY_ENV);
    if (!apiKey) {
        shell.Popup("環境変数 OPENAI_API_KEY が見つかりません。\nAPIキーをユーザー環境変数に設定し、Meryを再起動してください。", 0, "GPT API", 48);
        return;
    }

    try {
        shell.KeepRunning = true;
        outputBar.Visible = true;
        outputBar.Writeln("\n--- OpenAI API に相談開始 (" + OPENAI_MODEL + ") ---");
        const request = callOpenAI(apiKey, promptText, customInstruction);
        const result = await Promise.all([request, waitForAbort()]);
        const response = result[0];
        if (!response || response.aborted || abortRequestFlg) {
            outputBar.Writeln("\n<ユーザーにより処理が中止されました>");
            return;
        }

        const outputPath = getTagText(OUTPUT_PATH_TAG);
        if (outputPath) {
            const title = getTagText(OUTPUT_TITLE_TAG) || "GPT 出力";
            const outputText = buildOutputFileText(title, response.text, response.usageText);
            showTextInSingleTab(outputPath, outputText);
            outputBar.Writeln("\n--- 出力ファイルを更新: " + outputPath + " ---");
        } else {
            outputBar.Writeln("\n" + response.text);
        }
        outputBar.Writeln("\n--- 相談終了 ---\n");
    } catch (e) {
        if (abortRequestFlg) {
            outputBar.Writeln("\n<ユーザーにより処理が中止されました>");
        } else {
            outputBar.Writeln("OpenAI API エラー: " + e.message);
            shell.Popup("GPT APIの呼び出しに失敗しました。\n\n" + e.message, 0, "GPT API", 48);
        }
    } finally {
        requestCompletedFlg = true;
        shell.KeepRunning = false;
    }
}

async function callOpenAI(apiKey, promptText, customInstruction) {
    const controller = new AbortController();
    activeRequestController = controller;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
        const body = {
            model: OPENAI_MODEL,
            input: promptText,
            max_output_tokens: MAX_OUTPUT_TOKENS,
            reasoning: { effort: "low" },
            store: false,
            stream: true
        };
        if (customInstruction) body.instructions = customInstruction;

        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + apiKey
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const responseText = await response.text();
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                throw new Error("API応答を読み取れませんでした (HTTP " + response.status + ")。");
            }
            throw new Error(buildApiErrorMessage(response.status, data));
        }

        outputBar.Writeln("送信完了。GPTの応答を受信中です…\n");
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let responseAll = "";
        let usageText = "";

        while (true) {
            if (abortRequestFlg) {
                controller.abort();
                return { text: responseAll, usageText: usageText, aborted: true };
            }
            const chunk = await reader.read();
            if (chunk.done) {
                buffer += decoder.decode();
                break;
            }
            buffer += decoder.decode(chunk.value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.indexOf("data:") !== 0) continue;
                const eventData = line.substring(5).trim();
                if (!eventData || eventData === "[DONE]") continue;
                const processed = processOpenAIStreamEvent(eventData);
                if (processed.delta) {
                    responseAll += processed.delta;
                    outputBar.Write(processed.delta);
                }
                if (processed.usageText) usageText = processed.usageText;
                if (processed.error) throw new Error(processed.error);
            }
        }

        if (!responseAll) throw new Error("GPTからテキスト回答がありませんでした。");
        outputBar.Writeln("\n\nGPTの応答を受信しました。");
        return { text: responseAll, usageText: usageText, aborted: false };
    } catch (e) {
        if (timedOut) {
            throw new Error("3分以内に応答が完了しなかったため停止しました。TASKSの対象を短くして再実行してください。");
        }
        if (abortRequestFlg || (e && e.name === "AbortError")) {
            return { text: "", usageText: "", aborted: true };
        }
        throw e;
    } finally {
        clearTimeout(timeoutId);
        requestCompletedFlg = true;
        activeRequestController = null;
    }
}

function processOpenAIStreamEvent(jsonText) {
    let data;
    try {
        data = JSON.parse(jsonText);
    } catch (e) {
        return { delta: "", usageText: "", error: "" };
    }
    if (data.type === "response.output_text.delta") {
        return { delta: data.delta || "", usageText: "", error: "" };
    }
    if (data.type === "response.completed" && data.response) {
        const usage = data.response.usage || {};
        const usageText = usage.input_tokens !== undefined
            ? "利用トークン数: 入力=" + usage.input_tokens + ", 出力=" + (usage.output_tokens || 0)
                + ", 合計=" + (usage.total_tokens || 0)
            : "";
        return { delta: "", usageText: usageText, error: "" };
    }
    if (data.type === "error") {
        return { delta: "", usageText: "", error: data.message || "OpenAI APIでエラーが発生しました。" };
    }
    if (data.type === "response.failed" && data.response && data.response.error) {
        return { delta: "", usageText: "", error: data.response.error.message || "GPTの応答生成に失敗しました。" };
    }
    return { delta: "", usageText: "", error: "" };
}

async function waitForAbort() {
    let held = 0;
    while (!requestCompletedFlg) {
        await new Promise(resolve => setTimeout(resolve, 300));
        if (shell.GetKeyState(0x10) < 0) {
            held++;
            if (held >= 3) {
                abortRequestFlg = true;
                if (activeRequestController) activeRequestController.abort();
                return;
            }
        } else {
            held = 0;
        }
    }
}

function extractResponseText(data) {
    if (typeof data.output_text === "string" && data.output_text) return data.output_text;
    const texts = [];
    const output = data.output || [];
    for (let i = 0; i < output.length; i++) {
        const item = output[i];
        if (!item || item.type !== "message" || !item.content) continue;
        for (let j = 0; j < item.content.length; j++) {
            const part = item.content[j];
            if (part.type === "output_text" && part.text) texts.push(part.text);
            else if (part.type === "refusal" && part.refusal) texts.push(part.refusal);
        }
    }
    return texts.join("\n").trim();
}

function buildApiErrorMessage(status, data) {
    const detail = data && data.error && data.error.message ? data.error.message : "詳細なし";
    if (status === 401) return "APIキーが無効か、認証されていません。OPENAI_API_KEYを確認してください。\n" + detail;
    if (status === 403) return "APIキーまたはプロジェクトにこのモデルの利用権限がありません。\n" + detail;
    if (status === 429) return "APIの利用上限、レート制限、またはクレジット残高を確認してください。\n" + detail;
    return "HTTP " + status + "\n" + detail;
}

function getTagText(tagName) {
    return doc.Tag.exists(tagName) ? String(doc.Tag[tagName] || "") : "";
}

function roughTokenize(text) {
    return Math.ceil(String(text).length / 3);
}

function buildOutputFileText(title, responseText, usageText) {
    const now = new Date();
    const stamp = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate())
        + " " + pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
    let header = "# " + title + "\n\n";
    header += "- 生成日時: " + stamp + "\n";
    header += "- モデル: " + OPENAI_MODEL + "\n";
    if (usageText) header += "- " + usageText + "\n";
    const kind = getTagText(OUTPUT_KIND_TAG);
    if (kind) header += "- 種別: " + kind + "\n";
    return header + "\n---\n\n" + responseText.trim() + "\n";
}

function pad(n) {
    return ("0" + n).slice(-2);
}

function showTextInSingleTab(fullPath, text) {
    ensureParentFolder(fullPath);
    writeTextFile(fullPath, text);
    const existing = findOpenDocumentByFullName(fullPath);
    if (existing) {
        try {
            existing.Activate();
            const outSel = existing.selection;
            outSel.SelectAll();
            outSel.Text = text;
            existing.Save(fullPath);
            existing.Saved = true;
            return;
        } catch (e) {
            outputBar.Writeln("既存の出力タブ更新に失敗しました。ファイルは保存済みです: " + e.message);
            return;
        }
    }
    try {
        editor.NewFile();
        const outDoc = editor.ActiveDocument;
        const outSel = outDoc.selection;
        outSel.SelectAll();
        outSel.Text = text;
        outDoc.Save(fullPath);
        outDoc.Saved = true;
    } catch (e) {
        outputBar.Writeln("出力タブを開けませんでした。ファイルは保存済みです: " + fullPath + " / " + e.message);
    }
}

function findOpenDocumentByFullName(fullPath) {
    const fso = new ActiveXObject("Scripting.FileSystemObject");
    const target = fso.GetAbsolutePathName(String(fullPath)).toLowerCase();
    const docs = editor.Documents;
    for (let i = 0; i < docs.Count; i++) {
        const d = docs.Item(i);
        if (d.FullName && fso.GetAbsolutePathName(String(d.FullName)).toLowerCase() === target) return d;
    }
    return null;
}

function ensureParentFolder(fullPath) {
    const fso = new ActiveXObject("Scripting.FileSystemObject");
    const folder = fso.GetParentFolderName(fullPath);
    if (folder && !fso.FolderExists(folder)) fso.CreateFolder(folder);
}

function writeTextFile(fullPath, text) {
    const stream = new ActiveXObject("ADODB.Stream");
    try {
        stream.Type = 2;
        stream.Charset = "utf-8";
        stream.Open();
        stream.WriteText(text);
        stream.SaveToFile(fullPath, 2);
    } finally {
        if (stream.State !== 0) stream.Close();
    }
}
