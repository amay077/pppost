# Mastodon 画像アップロード時の自動リサイズ追加

## Why

Mastodon API の画像サイズ上限 (10 MB) を超えるファイルをアップロードすると 422 エラーが返り、投稿に失敗する。Twitter/X・Bluesky には既に sharp を使った自動リサイズ処理が実装済みだが、Mastodon には未実装のため、大きな画像を添付すると Mastodon だけ投稿失敗する。

## What Changes

- `backend/netlify/functions/mastodon_post.js` に sharp による画像リサイズ処理を追加
- 上限は 5 MB (Twitter/X と同一基準) とし、超過時は自動でリサイズ・JPEG 変換する
- リサイズ後の contentType を `image/jpeg` に更新し、FormData に正しく反映する

## Impact

- **Affected specs**: image-upload (新規)
- **Affected code**: `backend/netlify/functions/mastodon_post.js`
- **Breaking changes**: なし。5 MB 以下の画像は従来通り無加工で送信される
