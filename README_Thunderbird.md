# Thunderbirdの導入とMeryTODOカレンダー設定

MeryTODOのデータはPC内のMarkdownファイルを正本として扱います。Thunderbirdは予定とToDoを表示・編集するためのローカルな画面です。CalDAVサーバーは `127.0.0.1` のみで動き、Googleアカウントやクラウド契約は不要です。

## 1. 必要なアプリを用意する

Windows版Thunderbirdを [公式ダウンロードページ](https://www.thunderbird.net/ja/) から入手し、インストーラーを実行します。既に起動できるなら再インストールは不要です。ThunderbirdにはカレンダーとToDoが標準で入っています。

同期マクロにはNode.js 24以上が必要です。[Node.js公式ダウンロードページ](https://nodejs.org/ja/download) から導入し、`C:\Program Files\nodejs\node.exe` があることを確認します。Meryとこのリポジトリは作業ハブ `C:\Projects\ai-work-hub` で使用する設定です。配置を変更した場合は `Mery_Thunderbirdと同期.js` の `HUB_DIR` も変更します。

## 2. Mery側を先に同期する

1. Meryの作業メニューから「年・月・週の目標と期限を管理」を開き、`GOALS.md` を作成または保存します。`TASKS.md` も作業ハブに置きます。
2. 作業メニューで「Thunderbird カレンダーと双方向同期」を実行します。ローカルCalDAVサーバーが起動します。
3. `MERYTODO_CALDAV_REPORT.md` のプレビューで追加・削除・競合を確認し、問題なければ反映します。反映時には変更前バックアップが作られます。

## 3. Thunderbirdに登録する

Thunderbirdのカレンダー画面で **新しいカレンダー → ネットワーク上 → CalDAV** を選びます。場所には次のURLを指定します。

```text
http://127.0.0.1:18453/calendars/default/MeryTODO/
```

カレンダー名は `MeryTODO` にします。認証情報は不要です。「オフラインサポート」を有効にします。Thunderbirdの画面表記が異なる場合は [公式のカレンダー作成手順](https://support.mozilla.org/ja/kb/creating-new-calendars) を参照してください。このURLをブラウザーで開くとカレンダーファイルがダウンロードされることがありますが、登録先はブラウザーではなくThunderbirdです。

年・月・週目標はカレンダーの期間予定、`GOALS.md` の行動TODOと `TASKS.md` の同期対象はThunderbirdのToDoに表示されます。同期はMeryのマクロを実行したときに行います。Thunderbird側で変更した後も、マクロでプレビューしてから反映してください。

## ローカルデータとバックアップ

正本は作業ハブの `GOALS.md` と `TASKS.md` です。`GOALS.md` 末尾の `mery-goal-id-map` は、各目標行の短い参照番号と完全な同期IDの対応表なので消さないでください。`.mery-calendar` にはCalDAVのデータベースと `TASKS.md` のID対応を保存します。バックアップやPC移行時は、Markdownファイルと `.mery-calendar` を一緒に保存します。これらは個人データなので、公開するGitHubリポジトリには含めません。

Google Tasks / Google Calendarとの同期は別の任意機能です。接続する場合だけ [Google Tasks](README_Google_Tasks.md) と [Google Calendar](README_Google_Calendar.md) の設定を行います。

## 表示されないとき

- Thunderbirdに同名のカレンダーが複数ある場合は、登録先URLを確認します。現在使用するのは上記のCalDAV URLです。
- カレンダーが登録済みでも項目が見えない場合は、Mery側で同期を反映したか、Thunderbird側でそのカレンダーが表示対象かを確認し、Thunderbirdで同期を実行します。
- GOALS.mdでチェックを付けた行動ToDoは完了済みです。ThunderbirdのToDo欄で「完了したToDoを表示」を有効にすると確認できます。
- GOALS.mdとTASKS.mdに同じ件名があるだけでは、別のToDoです。明示的にIDを対応付けた行だけは件名と完了状態が双方向に連動し、ThunderbirdではGOALS.md側の1件として表示されます。設定の考え方は [目標管理](README_目標管理.md) を参照してください。
- 接続できない場合は、Meryの同期マクロを再実行してローカルサーバーを起動します。PCを再起動するとサーバーは自動起動しません。
- `GOALS.md` の参照番号と対応表に不整合がある場合は、同期前のバックアップを使って復旧します。IDを手作業で再発行するとThunderbird側で別項目になることがあります。
