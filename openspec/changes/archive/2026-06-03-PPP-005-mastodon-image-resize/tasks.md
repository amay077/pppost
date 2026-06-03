# Implementation Tasks

## 1. Mastodon 画像リサイズ処理の追加

- [ ] 1.1 `mastodon_post.js` の先頭に `sharp` の require を追加
- [ ] 1.2 画像バッファ取得後に 5 MB 超過チェックとリサイズ処理を追加 (twitter_post.js と同パターン)
- [ ] 1.3 リサイズ時に `formData.append` の filename を `image.jpg`、contentType を `image/jpeg` に変更

## 2. 動作検証

- [ ] 2.1 5 MB 超の画像を添付して Mastodon に投稿し、エラーなく投稿されることを確認
- [ ] 2.2 5 MB 以下の画像が従来通り無加工で投稿されることを確認
