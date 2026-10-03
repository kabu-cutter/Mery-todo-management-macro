更新: 単一ファイル版は TODO を My Tasks、LOG をカレンダーに同期します。設定は [README_Google_Tasks.md](README_Google_Tasks.md) を参照してください。

# Mery と Google カレンダーの双方向同期

TASKS.md と LOG.md を、既存の Google メインカレンダーと同期します。
Mery の編集画面は Markdown のままです。同期状態はローカルの SQLite に保存します。

## 同期できる内容

- 日付セクション内の TASKS チェックボックスと LOG の箇条書き
- 件名、日付、同日内の開始・終了時刻、TASKS の完了状態
- 項目の追加・変更・削除の双方向反映
- カレンダーで新しく作成した、件名が `[TASKS] ` または `[LOG] ` で始まる予定の取り込み

時刻がない項目は終日予定です。時刻がある項目は日本時間で登録します。
繰り返し予定、複数日の予定、日をまたぐ予定は自動反映せず、レポートに記載します。
Google 予定の説明欄、出席者、通知設定は Markdown への同期対象外です。
同期対象外の通常の予定は読み取り結果から除外し、変更しません。

自動常駐は行いません。Mery の作業メニューから実行するたびに同期します。

## 必要なもの

- Windows と Mery
- Node.js 24 以上（この環境では v24.18.0 で確認済み）
- Google アカウント
- Google Calendar API を有効にした Google Cloud プロジェクト
- 「デスクトップアプリ」用の OAuth 認証 JSON

追加の SQL サーバーや npm パッケージは不要です。

## 1. Google の接続設定を作る

1. [Google Cloud コンソール](https://console.cloud.google.com/)でプロジェクトを作るか、既存のプロジェクトを選びます。
2. 「API とサービス」→「ライブラリ」で **Google Calendar API** を有効にします。
3. 「Google Auth Platform」でアプリ名、連絡先、対象ユーザーを設定します。
4. 個人用なら External / Testing を選び、使う Google アカウントをテストユーザーに追加します。
5. 「データアクセス」に次の権限を追加します。
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
6. 「クライアント」から OAuth クライアントを作成し、種類は **デスクトップアプリ** にします。
7. 認証 JSON をダウンロードします。

参考: [Google の OAuth 設定](https://developers.google.com/workspace/guides/configure-oauth-consent)、[デスクトップアプリの認証](https://developers.google.com/identity/protocols/oauth2/native-app)、[Calendar API の権限](https://developers.google.com/workspace/calendar/api/auth)。

設定画面の名称は Google 側の変更で異なる場合があります。
Testing の認証には再接続が必要になる場合があります。接続エラー時は接続設定を再実行してください。

## 2. 認証 JSON を置く

作業ハブに `.mery-calendar` フォルダーを作り、認証 JSON を `oauth-client.json` という名前で保存します。

標準の場所:

```text
C:\Projects\ai-work-hub\.mery-calendar\oauth-client.json
```

マクロを置いたリポジトリのフォルダーと、TASKS / LOG の作業ハブは別の場所です。
作業ハブを変更済みなら `Mery_Googleカレンダーと同期.js` の `HUB_DIR` も同じ場所にします。

`calendar-sync/config.example.json` は設定例です。必要なら作業ハブの `.mery-calendar/config.json` にコピーしてください。
メインカレンダーの指定は `primary` です。設定ファイルがない場合もメインカレンダーを使用します。

```json
{
  "calendarId": "primary",
  "credentialsPath": ".mery-calendar/oauth-client.json"
}
```

認証 JSON やトークンは GitHub に登録しないでください。対象ファイルは `.gitignore` でも除外しています。
取得した接続トークンは Windows のユーザー単位の暗号化機能で保護して保存します。
SQLite に認証トークンは入れません。

## 3. Mery から接続する

1. `Mery_Googleカレンダーと同期.js` を Mery に登録します。この1ファイルに SQLite・Google 認証・同期処理が含まれており、補助フォルダーの手動配置は不要です。
2. `Mery_作業メニュー.js` → **Google カレンダーと双方向同期** を選びます。
3. **Google カレンダーの接続設定** を選びます。
4. ブラウザーで Google にログインし、アクセスを許可します。
5. Mery に戻って接続レポートを確認します。

Google アカウントの同意操作はユーザー自身で行います。
このチャットの Google Calendar 接続とは別に、Mery 用の認証を行う必要があります。

## 4. プレビューして同期する

まず **同期内容をプレビュー** を選びます。開いている TASKS.md / LOG.md を保存し、変更予定をレポートに出します。
プレビューではカレンダーの予定や Markdown 本文を書き換えません。

内容を確認したら **TASKS / LOG とカレンダーを双方向同期** を選びます。
初回は、日付セクション内の対象項目をすべて登録します。過去の日付の項目も対象です。

### TASKS の例

```markdown
## 2026-10-03 (土) 今日の作業

### 今日やる
- [ ] 資料を確認 @09:30-10:30
- [x] メールを確認
```

カレンダーでは `[TASKS] 資料を確認` と `[TASKS ✓] メールを確認` になります。
完了状態をカレンダー側で変える場合は `[TASKS]` と `[TASKS ✓]` を切り替えます。

### LOG の例

```markdown
## 2026-10-03 (土) 作業ログ

### やったこと
- 打ち合わせ @14:00-15:00
```

カレンダーでは `[LOG] 打ち合わせ` になります。
独自の LOG 小見出しも保持します。

### カレンダー側から新しい項目を追加する

- 件名を `[TASKS] 電話する` にすると、TASKS の該当日付の「今日やる」へ取り込みます。
- 件名を `[LOG] 資料を提出した` にすると、LOG の該当日付の「やったこと」へ取り込みます。
- 終日予定、または同日内の時刻付き予定にしてください。

同期済み項目には、Markdown の非表示コメント `<!-- mery-calendar:... -->` が付きます。
この印は行を移動・編集しても残してください。新しい独立した項目としてコピーする場合は、コピー側の印を削除します。
「TASKS選択項目をLOGへ記録」では、新しい LOG 記録に元の TASKS の印を引き継がないよう対応しています。

## 競合と削除

前回同期した内容と、現在の Mery / Google の内容を比較します。

- 片方だけを編集した場合: もう片方へ反映
- 両方を同じ内容へ変更した場合: 同期済みとして扱う
- 両方を異なる内容へ変更した場合: 上書きせず「競合・要確認」に記載
- 片方で削除し、もう片方が前回のままの場合: 削除を反映
- 片方で削除し、もう片方で編集した場合: 競合として保留

競合は、残したい件名・日付・時刻・完了状態を両側で揃えてから再同期してください。
Google 上で同期中に変更された予定は ETag で検出し、上書きを止めます。
件数の表示は処理対象数です。通信エラー欄がある場合は、成功しなかった項目を確認してください。

Markdown を書き換える前には `TASKS_backup_*.md` / `LOG_backup_*.md` を作成します。
復元後に同期すると Google にも変更が伝わるため、復元後は先にプレビューしてください。

## SQLite の構造

作業ハブの `.mery-calendar/sync.sqlite` に以下を保存します。

| テーブル | 内容 |
|---|---|
| `sync_items` | 項目ID、Google予定ID、前回のローカル／Google内容 |
| `conflicts` | 自動反映を保留した競合 |
| `sync_runs` | 同期日時、操作件数、エラー件数 |
| `metadata` | 接続先カレンダーID |

SQL の更新はトランザクションで保存し、ID の一意性を制約で保証します。
Google 通信と Markdown 保存は SQL と同じトランザクションにはできないため、固定の予定ID、項目印、前回内容の比較で再実行時の重複や上書きを防ぎます。
`.mery-calendar` の状態を別PCと同時に書き換えないでください。最初の実装はこのPCから実行する前提です。

## テストと制限

リポジトリのフォルダーから:

```text
node tests/run.cjs
node --test tests/calendar.cjs tests/standalone.cjs
```

既存マクロの11項目と、カレンダー同期の18項目、単一ファイル版の2項目を検証します。
認証・Google の実通信と Mery の実操作は、初期設定後に確認してください。

Google に接続せず、新規対象の解析だけ確認する場合:

```text
node calendar-sync/calendar-sync.cjs --hub "C:\Projects\ai-work-hub" --offline-preview
```

この確認は未同期の作業ハブ用です。同期済みの状態で Google の情報がないと削除を誤判定するため、その場合は接続ありのプレビューを使用します。

異常終了で `.mery-calendar/sync.lock` が残った場合は、同期プロセスが動いていないことを確認してからそのファイルだけを削除し、プレビューから再実行します。

API の仕様参考: [予定の作成と固定ID](https://developers.google.com/workspace/calendar/api/guides/create-events)、[予定データ形式](https://developers.google.com/workspace/calendar/api/v3/reference/events)、[Node.js SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)。

## 単一ファイル版について

配布・実行に必要なスクリプトは `Mery_Googleカレンダーと同期.js` の1ファイルです。Node.js 24 以上と Google の認証 JSON は必要です。初回実行時に、埋め込まれた処理を作業ハブの `.mery-calendar/calendar-runtime.cjs` へ自動展開します。SQLite と認証トークンも同じフォルダーで管理します。

開発用の分割ソースを変更した場合は `node calendar-sync/build-single-file.cjs` で単一ファイルを再生成してください。
