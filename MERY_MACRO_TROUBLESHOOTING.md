# Mery macro troubleshooting notes

- Do not assume `Alert()` or `Confirm()` are defined as global functions in Mery JScript. Use `WScript.Shell.Popup` for messages and Yes/No prompts.
- For a Yes/No prompt, call `new ActiveXObject("WScript.Shell").Popup(message, 0, title, 4 + 32)` and continue only when the return value is `6` (Yes).
- Do not assume the editor global is lowercase `editor`. Resolve it with `typeof Editor !== "undefined" ? Editor : (typeof editor !== "undefined" ? editor : null)` and show an actionable error if neither exists.
- When a Mery dialog reports an undefined identifier, inspect the exact identifier at the reported line before changing unrelated code. Validate that the macro parses after stripping its `#title` directive.
- Mery の JScript では String.normalize() や Array.from() を前提にしない。Unicode正規化は機能の有無を確認してから呼び、未対応時は必要な範囲だけ互換変換する。文字配列化には split を使う。
- CreatePopupMenu() may be unavailable in a child macro launched with ExecuteMacro. Use WScript.Shell.Popup with Yes/No/Cancel for child-macro choices.
- A child macro may also lack both `editor` and Editor. For file-only work, prefer the current document when its path matches and use direct file I/O as the fallback.

- Do not call another API macro from a child macro when ditor / Editor may be unavailable. Have the child write a pending request under .mery-calendar, return to Mery_作業メニュー.js, and let the parent open the input document and execute the API macro.
