# YouTube リンクの特別整形

## Why

Swarm チェックイン URL と同様に、投稿本文中に含まれる YouTube URL（短縮系・フル）を特別視して整形したい。動画共有時は本文が URL だけになることが多いため、動画タイトルを取得して `{タイトル} {URL}` 形式に整形し、短縮 URL はフル URL に展開する（Issue #33）。

## What Changes

- 本文中に YouTube URL（短縮系 `youtu.be`・フル `youtube.com/watch`・`youtube.com/shorts`）が含まれる場合、テキスト全体を `{タイトル} {展開後URL}` 形式（スペース区切り）に置き換える
- 短縮 URL は `https://www.youtube.com/watch?v=<video-id>` に展開する。クエリパラメータは `t=`（再生開始時刻）のみ保持し、`si=` 等の共有用トラッキングパラメータは除去する
- タイトル取得は YouTube oEmbed API（`https://www.youtube.com/oembed`、API キー不要）を利用する新規 Netlify Function `youtube_oembed` で行う
- 処理順は Swarm スクレイピング処理の次、一般的なタイトル取得（`{タイトル} - {URL}` 形式への整形）より優先する
- タイトル取得失敗時は本文を変換しない（現状維持）

## Impact

- **Affected specs**: `PPP-002-url-title-expansion`（Requirement: YouTube URL の特別処理 を追加）
- **Affected code**:
  - `frontend/src/lib/MainContent.svelte`（YouTube URL の検出・正規化・本文整形）
  - `backend/netlify/functions/youtube_oembed.js`（新規。oEmbed API 呼び出し）
- **Breaking changes**: なし

## References

- [Issue #33](https://github.com/amay077/pppost/issues/33)
