# クリップボードコピー機能の追加

## Why

Twitter (X) 投稿機能の廃除 ([PPP-006](../PPP-006-remove-twitter-posting/proposal.md)) に伴い、ユーザーが入力した投稿内容を各 SNS の公式アプリへ手動で持ち込む手段が必要になる。入力テキストと選択画像をワンクリックでクリップボードへコピーできるようにすることで、任意のアプリへの貼り付けを容易にする。

## What Changes

- テキスト入力エリアにテキストコピーボタンを追加し、入力テキストをクリップボードへコピーする
- 各画像プレビューに画像コピーボタンを追加し、画像データをクリップボードへコピーする
  - 表示中の URL（クロップ済みなら `croppedUrl`、未クロップなら `originalUrl`）を Blob 化し、`ClipboardItem` でコピーする
  - コピー対象は押下したボタンに対応する 1 枚のみとする
- コピー成功・失敗をユーザーにフィードバックする（ボタン文言を一定時間 `コピーしました` / `コピー失敗` へ変化させ、2 秒後に元へ戻す）
- Clipboard API 非対応環境向けのフォールバック方針を定める

## Impact

- **Affected specs**: clipboard-copy (新規)
- **Affected code**: `frontend/src/lib/MainContent.svelte`, `frontend/src/lib/ImagePreview.svelte`
- **Breaking changes**: なし（機能追加のみ）
