# URL タイトル自動展開機能

## Why

外部サービスからシェアされた URL を本アプリに渡した際、本文が URL のみだと投稿内容が単調になる。URL 単体で起動された場合にページタイトルを自動取得して本文へ補うことで、投稿表現を向上させる必要がある。

現在、起動時クエリパラメータ `text` または `url` が URL 単体の場合、そのまま投稿本文に設定されるため、ユーザーが手動でタイトルを追加する必要があり、UX が低下している。

## What Changes

- 起動時クエリパラメータ（`text` または `url`）が URL のみの場合、バックエンド経由でページタイトルを自動取得する
- 取得したタイトルを `{タイトル} - {URL}` 形式で本文に設定する
- Swarm チェックイン URL の場合は既存のスクレイピング処理を優先する

## Impact

- 影響を受けるスペック: `PPP-002-url-title-expansion`（新規作成）
- 影響を受けるコード:
  - `frontend/src/lib/MainContent.svelte`: URL 判定とタイトル取得ロジックを `onMount` に追加
  - `backend/netlify/functions/`: 新規関数 `fetch_title.js` を追加（OGP/title タグ抽出）
