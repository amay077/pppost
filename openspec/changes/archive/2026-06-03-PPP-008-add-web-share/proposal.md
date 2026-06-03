# 共有機能（Web Share API）の追加

## Why

Twitter (X) 投稿機能の廃除 ([PPP-006](../PPP-006-remove-twitter-posting/proposal.md)) に伴い、ユーザーが入力した投稿内容を任意のアプリへ転送できる手段が必要になる。スマートフォンでは Web Share API による OS 標準の共有シートを使うことで、テキストや画像を任意のアプリ（各 SNS の公式アプリ等）へ直接渡せる。クリップボードコピー ([PPP-007](../PPP-007-add-clipboard-copy/proposal.md)) と併せて、手動転送の利便性を高める。

## What Changes

- 共有ボタンを追加し、押下時に `navigator.share` で OS の共有シートを起動する
- 画像がない場合はテキストのみを共有する
- 画像がある場合はテキストと画像ファイル（選択中の全画像）を共有する
  - 選択中の全画像（`images: ImageData[]`）について、各画像の表示中 URL（`img.croppedUrl ?? img.originalUrl`）を Blob → `File` に変換し、`files: File[]` として配列にまとめる
  - `navigator.canShare({ files })` で対応判定し、対応時は全画像を `files` 配列で共有する
  - ファイル共有非対応時はテキストのみ共有にフォールバックする
- テキストも画像も無い場合は、空内容で共有を呼び出さないよう共有ボタンを無効化する（既存投稿ボタン `disabled={text.length <= 0 && images.length <= 0}` と同条件）
- Web Share API 非対応環境では共有ボタンを非表示にする
- 共有はユーザー操作（クリック）起点でのみ呼び出す（Web Share API の要件）

## Non-Goals

- 共有成功時の追加 UI フィードバックは設けない（OS の共有シート起動自体がユーザーへのフィードバックとなるため）。ただし、ユーザーキャンセル以外の共有失敗時はユーザーに通知する

## Impact

- **Affected specs**: web-share (新規)
- **Affected code**: `frontend/src/lib/MainContent.svelte`（共有ロジックは `frontend/src/lib/MainContent.ts` に配置する可能性あり）
- **Breaking changes**: なし（機能追加のみ）
