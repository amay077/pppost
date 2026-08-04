# Implementation Tasks

## 1. バックエンド（Netlify Function）

- [ ] 1.1 `backend/netlify/functions/youtube_oembed.js` を新規作成する
  - GET クエリパラメータ `url` を受け取り、YouTube oEmbed API（`https://www.youtube.com/oembed?url=...&format=json`）を呼び出す
  - `url` は `youtube.com` / `youtu.be` ホストの http(s) URL に限定して検証する（oEmbed 誤用・SSRF 防止）。未指定・不正な場合は 400 を返す
  - CORS ヘッダーを既存関数（`fetch_title` 等）と同様に付与する
  - 成功時 `{ success: true, title }`、失敗時 `{ success: false, error }` を返す
- [ ] 1.2 `backend/test.http` に `youtube_oembed` のテスト項目を追記する

## 2. フロントエンド（MainContent.svelte）

- [ ] 2.1 YouTube URL の検出・正規化関数を追加する
  - 短縮系 `youtu.be/<video-id>`、フル `youtube.com/watch?v=<video-id>`、`youtube.com/shorts/<video-id>` を検出する（`www.` / `m.` プレフィックス対応、日本語文末記号は除外）
  - 正規化は design.md のルールに従う（`t=` のみ保持、`si=` 等は除去）
- [ ] 2.2 oEmbed タイトル取得処理を追加する（`/youtube_oembed` を呼び出し、ローディング状態を管理）
- [ ] 2.3 onMount の処理フローに YouTube 処理を組み込む
  - Swarm 処理の後、一般的なタイトル取得処理の前に実行する
  - 成功時は本文全体を `{タイトル} {展開後URL}` に置き換え、失敗時は本文を変更しない

## 3. 検証

- [ ] 3.1 `frontend` で `npm run check` と `npm run build` が成功する
- [ ] 3.2 `openspec validate PPP-033-add-youtube-title-expansion --strict` が通る
