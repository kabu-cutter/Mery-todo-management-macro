# Mery Gemini Task Macro v0.6.5 addon

## 目的

`TASKS.md` の「今日やる」が増えてきたときに、Geminiへ優先度案を考えてもらうマクロを追加します。

TASKS本体は上書きしません。  
`PRIORITY案.md` に優先度案を出します。

## 追加/更新ファイル

- `Mery_TASKS今日やるをGeminiで優先度整理.js`（追加）
- `Mery_作業メニュー.js`（更新）

## 使い方

作業メニューから以下を選びます。

```text
今日やる優先度をGeminiで整理
```

出力先:

```text
C:\Projects\ai-work-hub\PRIORITY案.md
```

中間入力:

```text
C:\Projects\ai-work-hub\PRIORITY整理入力.md
```

## 出力内容

- まず1つだけやるなら
- 今から順にやるなら
- 優先度A 今日やる
- 優先度B 余裕があれば
- 後で・置く候補
- 確認が必要
- 統合候補
- LOG候補

## TASKS.mdへの反映

`PRIORITY案.md` を見て、反映したい行だけを選択します。

```text
PRIORITY案.mdで行を選択
↓
作業メニュー
↓
選択範囲を今日のTASKS欄へ追加
```

## メニュー変更

前に不要そうと判断した `今日の作業ログを追記` は、通常メニューから外しました。

## 注意

Gemini APIを使うため、`call_gemini_api.js` と `GEMINI_API_KEY` の設定が必要です。
