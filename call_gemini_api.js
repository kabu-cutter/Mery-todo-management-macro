#language = "V8"
#title = "Gemini に相談 (API 呼び出し部品) - レート制限対応版 v0.4.1"

// 生成AIの回答の言語設定
const LANGUAGE = "Japanese" ;
// 入力プロンプトの最大トークン数
const MAX_PROMPT_TOKEN = 8000 ;
// 会話の履歴を保持する数。タスク管理用途では 0 推奨。
const HISTORY_SIZE = 0 ;
// 会話履歴に保持する最大トークン数
const MAX_HISTORY_TOKEN = 270000 ;
// 生成AI応答の入力毎の遅延時間 (ミリ秒)
const INPUT_DELAY = 10 ;
// 利用する生成AIのモデル
// タスク管理用途では軽量モデルを標準にする。
// 品質優先に戻す場合は "models/gemini-2.5-flash" に変更してください。
const AI_MODEL = "models/gemini-2.5-flash-lite" ;

// 生成AIのリクエストパラメータ
const GENERATION_CONFIG = {
    max_output_tokens : 4000 ,
    temperature : 0.65 ,
    thinkingConfig : { includeThoughts : false , thinkingBudget : 1000 }
};
const TEMPERATURE_TEMPLATE = 0.25 ;

// タグ名の定義
const HISTORY_TAG = "gemini-history" ;
const TEMPORARY_CUSTOM_INSTRUCTION_TAG = "gemini-temporary-custom-instruction" ;
const SELECTED_TEMPLATE_PROMPT_TAG = "gemini-selected-template-prompt" ;
const API_KEY_ENV = "GEMINI_API_KEY" ;

// 専用マクロから指定する出力先タグ
// これが設定されていると、API応答を指定ファイルへ保存し、Mery上では同じファイルを1タブだけ表示します。
const OUTPUT_PATH_TAG = "gemini-output-path" ;
const OUTPUT_TITLE_TAG = "gemini-output-title" ;
const OUTPUT_KIND_TAG = "gemini-output-kind" ;

const doc = document ;
const sel = document . selection ;
let abortRequestFlg = false ;
let requestCompletedFlg = false ;
let activeRequestController = null ;

main ();

async function main () {
    let promptText = sel . Text . trim ();
    if ( roughTokenize ( promptText ) > MAX_PROMPT_TOKEN ) {
        alert ( "プロンプトの文字数が多すぎます。文字数を少なくしてください。" );
        return ;
    }

    const isTemplate = doc . Tag . exists ( SELECTED_TEMPLATE_PROMPT_TAG );
    if ( isTemplate ) {
        promptText = "# **指示**:\n\n" + doc . Tag [ SELECTED_TEMPLATE_PROMPT_TAG ] + "\n\n# **入力テキスト**:\n\n" + promptText ;
    }

    try {
        shell . KeepRunning = true ;

        outputBar.Visible = true;
        outputBar.Writeln("\n--- Gemini に相談開始 ---");

        const apiKey = shell . getEnv ( API_KEY_ENV );
        if ( ! apiKey ) {
            alert ( `${ API_KEY_ENV } が設定されていません` );
            return ;
        }

        const result = await Promise . all ([ callGeminiAPI ( apiKey , promptText , isTemplate ), abortRequest () ]);
        const responseData = result [ 0 ];

        if ( responseData && ! responseData.aborted && ! abortRequestFlg && responseData.responseAll && hasOutputPath ()) {
            const outputPath = getTagText ( OUTPUT_PATH_TAG );
            const outputTitle = getTagText ( OUTPUT_TITLE_TAG ) || "Gemini 出力";
            const outputText = buildOutputFileText ( outputTitle , responseData.responseAll , responseData.usageText );
            showTextInSingleTab ( outputPath , outputText );
            outputBar.Writeln("\n--- 出力ファイルを更新: " + outputPath + " ---");
        }

        outputBar.Writeln("\n--- 相談終了 ---\n");
    }
    catch ( e ) {
        outputBar.Writeln( "エラーが発生しました: " + e . message + "\n" + e . stack );
    }
    finally {
        shell . KeepRunning = false ;
    }
}

async function abortRequest () {
    const VIRTUAL_KEY_CODE_SHIFT = 0x10 ;
    let pressCount = 0 ;
    while ( ! requestCompletedFlg ) {
        await new Promise ( resolve => setTimeout ( resolve , 300 ));
        if ( shell . GetKeyState ( VIRTUAL_KEY_CODE_SHIFT ) < 0 ) {
            pressCount ++ ;
            if ( pressCount > 2 ) {
                abortRequestFlg = true ;
                if ( activeRequestController ) activeRequestController.abort ();
                return ;
            }
        }
    }
}

async function callGeminiAPI ( apiKey , promptText , isTemplate ) {
    const controller = new AbortController ();
    activeRequestController = controller;
    const signal = controller . signal ;
    try {
        const requestBody = {
            contents : createGeminiRequest ( promptText , isTemplate ),
            system_instruction : buildSystemInstruction (),
            generationConfig : GENERATION_CONFIG ,
        };
        if ( isTemplate ) {
            requestBody . generationConfig . temperature = TEMPERATURE_TEMPLATE ;
        }
        const response = await fetch ( `https://generativelanguage.googleapis.com/v1beta/${ AI_MODEL }:streamGenerateContent?alt=sse&key=${ apiKey }` , {
            signal : signal ,
            method : 'POST' ,
            headers : { 'Content-Type' : 'application/json' , },
            body : JSON . stringify ( requestBody ),
        });

        if ( ! response . ok ) {
            const errorText = await response . text ();
            throw new Error ( buildGeminiApiErrorMessage ( response . status , response . statusText , errorText ));
        }

        let buffer = "" ;
        let responseAll = "" ;
        let usageText = "" ;
        const reader = response . body . getReader ();
        const decoder = new TextDecoder ( 'utf-8' );

        while ( true ) {
            if ( abortRequestFlg ) {
                controller . abort ();
                outputBar.Writeln("\n<ユーザーにより処理が中止されました>");
                return { responseAll : responseAll , usageText : usageText , aborted : true } ;
            }
            const { done , value } = await reader . read ();
            if ( done ) {
                buffer += decoder.decode ();
                if ( buffer . trim (). length > 0 ) {
                    try {
                        const lastLine = buffer . trim (). replace ( /^data:\s*/ , '' );
                        if ( lastLine ) {
                            const processedData = processLine ( lastLine , responseAll );
                            if ( processedData ) {
                                if ( processedData . inputText ) {
                                    outputBar.Write ( processedData . inputText );
                                }
                                usageText = processedData . usageText || usageText ;
                                responseAll = processedData . responseAll || responseAll ;
                            }
                        }
                    } catch ( e ) {
                        outputBar.Writeln ( "不完全なJSONの処理でエラー: " + e . message );
                    }
                }
                break ;
            }

            const text = decoder . decode ( value , { stream : true } );
            const combinedText = buffer + text ;
            const lastNewlineIndex = combinedText . lastIndexOf ( '\n' );
            if ( lastNewlineIndex === - 1 ) {
                buffer = combinedText ;
                continue ;
            }

            const completeText = combinedText . substring ( 0 , lastNewlineIndex );
            buffer = combinedText . substring ( lastNewlineIndex + 1 );
            const lines = completeText . trim (). split ( /\n+/ );
            let inputText = "" ;

            for ( const line of lines ) {
                const json_text = line . trim (). replace ( /^data:\s*/ , '' );
                if ( ! json_text ) {
                    continue ;
                }
                const processedData = processLine ( json_text , responseAll );
                if ( processedData ) {
                    inputText += processedData . inputText || "" ;
                    usageText = processedData . usageText || usageText ;
                    responseAll = processedData . responseAll || responseAll ;
                }
                else if ( processedData === null ) {
                    buffer = "" ;
                    outputBar.Writeln("\nJSONパースに失敗\n" + completeText);
                    break ;
                }
            }

            if ( inputText . length > 0 ) {
                outputBar.Write ( inputText );
            }
            await new Promise ( resolve => setTimeout ( resolve , INPUT_DELAY ));
        }

        if ( usageText ) {
            outputBar.Writeln(`\n\n(${ usageText })`);
        }

        if ( HISTORY_SIZE > 0 && ! isTemplate && responseAll . length > 0 ) {
            appendReturnTextToTag ( promptText , responseAll );
        }

        return { responseAll : responseAll , usageText : usageText , aborted : false } ;
    }
    catch ( e ) {
        controller . abort ();
        if ( abortRequestFlg ) {
            outputBar.Writeln("\n<ユーザーにより処理が中止されました>");
            return { responseAll : "" , usageText : "" , aborted : true };
        }
        throw e ;
    }
    finally {
        requestCompletedFlg = true ;
        activeRequestController = null;
    }
}


function buildGeminiApiErrorMessage ( status , statusText , errorText ) {
    let message = "Gemini API エラー: " + status + " " + statusText + "\n";

    if ( status === 429 ) {
        message += "\n【原因】\n";
        message += "Gemini API のレート制限/無料枠の上限に当たりました。マクロの故障ではありません。\n";
        message += "短時間に何度も実行した場合や、そのモデルの無料枠上限に当たった場合に出ます。\n";

        const retryMatch = String ( errorText ) . match ( /Please retry in ([0-9.]+)s/i );
        if ( retryMatch && retryMatch [ 1 ] ) {
            message += "\n【次にすること】\n";
            message += "約 " + Math . ceil ( Number ( retryMatch [ 1 ] )) + " 秒待ってから再実行してください。\n";
        }
        else {
            message += "\n【次にすること】\n";
            message += "少し時間を置いてから再実行してください。\n";
        }

        message += "\n【節約メモ】\n";
        message += "- 連打しない\n";
        message += "- 必要な範囲だけ選択して送る\n";
        message += "- タスク整理は軽量モデル gemini-2.5-flash-lite を使う\n";
        message += "- 制限が頻発するなら、AI Studioで利用状況と課金設定を確認する\n";
    }
    else {
        message += "\nAPIからエラーが返されました。\n";
    }

    message += "\n--- 元のエラー ---\n" + errorText;
    return message;
}

function processLine ( json_text , responseAll ) {
    try {
        const data = JSON . parse ( json_text );
        if ( ! data . candidates || ! data . candidates [ 0 ] ) {
            return { inputText : "" , usageText : "" , responseAll : responseAll };
        }
        const candidate = data . candidates [ 0 ];
        let updatedResponseAll = responseAll ;
        let response = "";
        if ( candidate . content && candidate . content . parts && candidate . content . parts [ 0 ] ) {
            response = candidate . content . parts [ 0 ]. text || "";
        }
        let inputText = formatGeminiResponse ( response , responseAll . slice ( - 5 ));
        if ( inputText ) {
            updatedResponseAll += inputText ;
        }
        let usageText = "" ;
        if ( candidate . finishReason === "STOP" && data . usageMetadata ) {
            const usage = data . usageMetadata ;
            usageText = "利用トークン数: プロンプト=" + usage . promptTokenCount + ", 応答=" + usage . candidatesTokenCount + ", 思考=" + usage . thoughtsTokenCount + ", 合計=" + usage . totalTokenCount ;
        }
        return { inputText , usageText , responseAll : updatedResponseAll };
    }
    catch ( e ) {
        outputBar.Writeln ( "JSONパースエラー: " + e . message + ", データ: " + json_text );
        return null ;
    }
}

function formatGeminiResponse ( response , lastFiveChars ) {
    if ( ! response ) return "";
    let formattedResponse = response . replace ( /([。！？]) +/g , "$1" ) . replace ( /([*:.]) {2,}/g , "$1 " );
    const joinedLastFiveChars = lastFiveChars + formattedResponse ;
    if ( joinedLastFiveChars . match ( /([。！？]) +/ )) {
        formattedResponse = formattedResponse . replace ( /^ +/ , "" );
    }
    if ( joinedLastFiveChars . match ( /([*:.]) {2,}/ )) {
        if ( lastFiveChars . slice ( - 1 ) === " " ) {
            formattedResponse = formattedResponse . replace ( /^ +/ , "" );
        }
        else {
            formattedResponse = formattedResponse . replace ( /^ +/ , " " );
        }
    }
    return formattedResponse ;
}

function roughTokenize ( text ) {
    return text . split ( /[\s\-_]+/ ) . map ( w => /^[a-zA-Z]+$|^[0-9]+$/.test(w) ? Math.ceil(w.length / 4 ) : w . length ) . reduce (( a , b ) => a + b , 0 );
}

function createGeminiRequest ( promptText , isTemplate ) {
    if ( isTemplate ) {
        return [ createRoleAndParts ( "user" , promptText )];
    }
    const tag = doc . Tag ;
    if ( ! tag . exists ( HISTORY_TAG )) {
        return [ createRoleAndParts ( "user" , promptText )];
    }
    const roleAndParts = JSON . parse ( tag [ HISTORY_TAG ]);
    roleAndParts . push ( createRoleAndParts ( "user" , promptText ));
    return roleAndParts ;
}

function createRoleAndParts ( role , text ) {
    return { "role" : role , "parts" : [ { "text" : text } ] };
}

function appendReturnTextToTag ( userText , modelText ) {
    const tag = doc . Tag ;
    if ( ! tag . exists ( HISTORY_TAG )) {
        tag [ HISTORY_TAG ] = JSON . stringify ([ createRoleAndParts ( "user" , userText ), createRoleAndParts ( "model" , modelText ) ]);
    }
    else {
        const geminiText = JSON . parse ( tag [ HISTORY_TAG ]);
        geminiText . push ( createRoleAndParts ( "user" , userText ));
        geminiText . push ( createRoleAndParts ( "model" , modelText ));
        if ( geminiText . length > HISTORY_SIZE * 2 ) {
            geminiText . splice ( 0 , 2 );
        }
        let joinedText = geminiText . map ( e => e . parts [ 0 ]. text ). join ( "\n" );
        while ( roughTokenize ( joinedText ) > MAX_HISTORY_TOKEN ) {
            geminiText . splice ( 0 , 2 );
            joinedText = geminiText . map ( e => e . parts [ 0 ]. text ). join ( "\n" );
        }
        tag [ HISTORY_TAG ] = JSON . stringify ( geminiText );
    }
}

function buildSystemInstruction () {
    let customInstruction = getTemporaryCustomInstruction ();
    const language = LANGUAGE . trim ();
    customInstruction = customInstruction . replace ( /^[\s ]+|[\s ]+$/g , "" );
    return { parts : { text : "Do not hallucinate. If you are unsure or don't have enough information to answer with confidence, say \"I don't know\" or \"I'm not sure.\"\n" + ( customInstruction ? `${ customInstruction }\n` : "" ) + ( language ? `Respond in ${ language }.\n` : "" ) } }
}

function getTemporaryCustomInstruction () {
    const tag = doc . Tag ;
    if ( tag . exists ( TEMPORARY_CUSTOM_INSTRUCTION_TAG )) {
        return tag [ TEMPORARY_CUSTOM_INSTRUCTION_TAG ];
    }
    return "" ;
}

function getTagText ( tagName ) {
    if ( doc . Tag . exists ( tagName )) {
        return String ( doc . Tag [ tagName ] );
    }
    return "";
}

function hasOutputPath () {
    return getTagText ( OUTPUT_PATH_TAG ) . length > 0 ;
}

function buildOutputFileText ( title , responseAll , usageText ) {
    const now = formatDateTime ( new Date () );
    let header = "# " + title + "\n\n";
    header += "- 生成日時: " + now + "\n";
    header += "- モデル: " + AI_MODEL + "\n";
    if ( usageText ) {
        header += "- " + usageText + "\n";
    }
    const kind = getTagText ( OUTPUT_KIND_TAG );
    if ( kind ) {
        header += "- 種別: " + kind + "\n";
    }
    header += "\n---\n\n";
    return header + responseAll . trim () + "\n";
}

function formatDateTime ( date ) {
    function pad ( n ) { return ( "0" + n ). slice ( - 2 ); }
    return date . getFullYear () + "-" + pad ( date . getMonth () + 1 ) + "-" + pad ( date . getDate () )
        + " " + pad ( date . getHours () ) + ":" + pad ( date . getMinutes () ) + ":" + pad ( date . getSeconds () );
}

function showTextInSingleTab ( fullPath , text ) {
    // v0.2.3 安定化方針:
    // Mery の editor.OpenFile(fullPath) は、環境によって現在のタブを「閉じて開く」動作になる。
    // そのため、ここでは OpenFile を使わない。
    //
    // 1) まずファイルへ保存する
    // 2) 既に同じ出力ファイルのタブがあれば、そのタブだけを更新する
    // 3) 出力タブがまだなければ、NewFile() で新しいタブを作り、本文を入れて fullPath に保存する
    //
    // これにより、元の入力タブを閉じたり置換したりしない。
    ensureParentFolder ( fullPath );
    writeTextFile ( fullPath , text );

    const existingDoc = findOpenDocumentByFullName ( fullPath );
    if ( existingDoc ) {
        try {
            existingDoc . Activate ();
            const outSel = existingDoc . selection;
            outSel . SelectAll ();
            outSel . Text = text;
            existingDoc . Save ( fullPath );
            existingDoc . Saved = true;
            return;
        }
        catch ( e ) {
            outputBar.Writeln ( "既存の出力タブ更新に失敗しました。ファイルは保存済みです: " + e . message );
            return;
        }
    }

    try {
        // OpenFile は元タブを閉じる可能性があるので使わない。
        editor . NewFile ();
        const outDoc = editor . ActiveDocument;
        const outSel = outDoc . selection;
        outSel . SelectAll ();
        outSel . Text = text;
        outDoc . Save ( fullPath );
        outDoc . Saved = true;
    }
    catch ( e ) {
        outputBar.Writeln ( "新規出力タブの作成に失敗しました。ファイルは保存済みです: " + fullPath + " / " + e . message );
    }
}

function writeTextFile(path, text) {
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

function findOpenDocumentByFullName ( fullPath ) {
    const target = normalizePath ( fullPath );
    const docs = editor . Documents ;

    for ( let i = 0 ; i < docs . Count ; i ++ ) {
        const d = docs . Item ( i );
        if ( ! d . FullName ) {
            continue ;
        }
        if ( normalizePath ( d . FullName ) === target ) {
            return d ;
        }
    }
    return null ;
}

function normalizePath ( path ) {
    const s = String ( path ) . replace ( /\//g , "\\" );
    try {
        const fso = new ActiveXObject ( "Scripting.FileSystemObject" );
        return fso . GetAbsolutePathName ( s ) . replace ( /\//g , "\\" ) . toLowerCase ();
    }
    catch ( e ) {
        return s . toLowerCase ();
    }
}

function fileExists ( fullPath ) {
    try {
        const fso = new ActiveXObject ( "Scripting.FileSystemObject" );
        return fso . FileExists ( fullPath );
    }
    catch ( e ) {
        return false ;
    }
}

function ensureParentFolder ( fullPath ) {
    try {
        const fso = new ActiveXObject ( "Scripting.FileSystemObject" );
        const folder = fso . GetParentFolderName ( fullPath );
        if ( ! folder ) return ;
        if ( fso . FolderExists ( folder )) return ;
        createFolderRecursive ( fso , folder );
    }
    catch ( e ) {
        outputBar.Writeln ( "出力先フォルダーの確認に失敗しました: " + e . message );
    }
}

function createFolderRecursive ( fso , folder ) {
    if ( ! folder || fso . FolderExists ( folder )) return ;
    const parent = fso . GetParentFolderName ( folder );
    if ( parent && ! fso . FolderExists ( parent )) {
        createFolderRecursive ( fso , parent );
    }
    if ( ! fso . FolderExists ( folder )) {
        fso . CreateFolder ( folder );
    }
}
