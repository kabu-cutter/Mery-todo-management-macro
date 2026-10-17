# GPT APIでTASKS案を作る

作業メニューの「TASKS.md今日分をGPT / Geminiで整理」を選び、表示される選択肢から「GPT API」を選ぶと、OpenAI Responses APIで整理案を生成します。TASKS.md本体は変更せず、結果は既存の「TASKS案.md」に保存されます。確認後、「TASKS案を今日のTASKSへ反映」を実行してください。

## APIキーの設定

1. OpenAI API PlatformでAPIキーを作成します。
2. Windowsの「環境変数を編集」で、ユーザー環境変数を追加します。
   - 変数名: OPENAI_API_KEY
   - 変数値: API Platformで作成したAPIキー
3. Meryを終了して再起動します。
4. 作業メニューでGPT APIを選びます。

APIキーはマクロファイルに書き込みません。チャットや文書に貼り付けないでください。ChatGPTの月額プランとはAPI請求が別です。APIクレジット残高と利用上限はAPI PlatformのBillingで確認してください。

## 使用モデルと費用

初期モデルは gpt-5.6-sol です。TASKSの整理のような定型作業向けの低コストモデルとして選び、応答上限を4,000トークンに設定しています。入力・出力トークン数はTASKS案の先頭に記録します。利用ごとにAPIクレジットが消費されます。

## GPT API / Gemini API / ChatGPTブラウザー

- GPT API: OPENAI_API_KEY を使ってOpenAI APIへ直接送信します。
- Gemini API: 既存の GEMINI_API_KEY とGeminiマクロを使います。
- ChatGPTブラウザー: 整理用プロンプトをコピーし、ブラウザーで手動実行します。APIキーは不要です。

どの方法も、生成結果はTASKS案.mdで確認してからTASKS.mdへ反映します。