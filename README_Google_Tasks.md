# TODO → My Tasks / LOG → Google カレンダー

更新した `Mery_Googleカレンダーと同期.js` を Mery に登録してください。この1ファイルに同期処理が入っています。Node.js 24 以上が必要です。

## 初回設定

1. 以前 OAuth を設定した Google Cloud プロジェクトで **Google Tasks API** を有効にします。Google Calendar API も引き続き使用します。
2. OAuth の同意画面でスコープを手動設定している場合は `https://www.googleapis.com/auth/tasks` を追加します。
3. 認証 JSON は従来の `.mery-calendar/oauth-client.json` をそのまま使います。
4. 更新したマクロを起動し「Google カレンダー / Tasks の接続設定」を実行し、Google Tasks へのアクセスも許可します。
5. プレビューで対象を確認してから同期を実行します。

## 対象プロジェクト

`C:\Projects\ai-work-hub\.mery-calendar\config.json` の既存設定に `todoPaths` を追加します。既存の設定項目は残してください。パスの `\` は JSON 内では `\\` と書きます。

```json
{
  "calendarId": "primary",
  "todoPaths": [
    "C:\\Projects\\binance_local_watcher\\TODO.md"
  ]
}
```

複数の TODO.md は配列へ追加します。`todoPaths` 未設定の場合は `PROJECT_TODO.md` にある `Source:` の1ファイルを使用します。全プロジェクトを自動検索する処理はありません。登録済みのファイルを配列から外すと、削除の誤判定を防ぐため処理を停止します。

My Tasks という名前のリストを探します。見つからない場合、レポートに表示された対象リストの ID を `taskListId` に設定してください。

## 同期する内容

- TASKS.md: 従来の形式の日付見出しの下にあるチェック項目。見出しの日付を Google Tasks の日付として使います。
- プロジェクト TODO.md: チェック項目。字下げしたチェック項目も対象です。Google 上では独立したタスクとして登録します。
- 項目名、完了・未完了、日付、登録済み項目の削除を双方向に反映します。両方で異なる変更があれば競合として保留します。
- TODO の日付は `<!-- mery-due:2026-10-04 -->` として保持します。日付なしでも登録できます。
- LOG.md は引き続きメインカレンダーへ同期します。

My Tasks の未登録の項目も、今日の日付の「今日やる」へ取り込みます。未登録で削除済み・非表示の項目は取り込みません。過去の欄にある登録済みの未完了 TASKS は、内容が同じでも今日の「今日やる」へ移します。過去の完了項目は、Google 側に変更がない限りそのまま残します。プロジェクト TODO の項目は元の TODO.md に反映します。

既存の TASKS のカレンダー予定は残します。更新後のマクロでは、それらを更新・削除しません。不要な予定は確認して手動で整理してください。

Google Tasks API は時刻を扱えないため、TASKS に書いた `@09:30-10:30` はローカルに保持します。Google 側から TASKS へ取り込む変更は、日本時間の今日の日付の「今日やる」に反映します。Google の日付は別に記録し、取り込みだけで Google の日付を今日へ変更することはありません。

同期前に、開いている TASKS.md / LOG.md / TODO.md の編集を保存します。ローカルを書き換えるときはバックアップを作成します。TASKS.md のIDは `.mery-calendar/tasks-ids.json` に別保存します。初回の同期実行で、従来のIDコメントを移行して本文から取り除きます。Google Tasks のIDメモも対応情報を保存してから除去し、ユーザーのメモは残します。プロジェクト TODO.md と LOG.md のIDコメントは引き続き残してください。

状態は `.mery-calendar/tasks.sqlite` に保存します。これは再実行の重複防止と変更判定に使うため、消さないでください。TASKS と TODO に同じ内容があっても、別の同期IDなら別のタスクとして登録します。

実際の Google アカウントへの接続と登録は、上の設定後にユーザーが実行してください。開発時は模擬 API で検証しています。

参考: [Google Tasks API](https://developers.google.com/workspace/tasks/reference/rest)、[認証スコープ](https://developers.google.com/workspace/tasks/auth)
## ID別ファイル方式

TASKS.md と .mery-calendar/tasks-ids.json、	asks.sqlite はセットで保管してください。本文の名前変更・完了切替・並べ替え・追加・削除は照合します。同名項目の削除などIDを特定できない編集は停止するため、項目名を区別したり、編集と追加を分けて同期してください。初回移行はプレビューでは行わず、同期実行時にバックアップを作って行います。移行後は古いマクロで同期せず、この更新版を使ってください。
