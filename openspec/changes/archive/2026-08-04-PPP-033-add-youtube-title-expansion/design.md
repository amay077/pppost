# Design: YouTube URL の特別整形

## Context

- 本文中の Swarm URL は専用スクレイピングで処理済み（`MainContent.svelte` の `resolveSwarmScrapeUrl` / `scrapeSwarmCheckin`）
- 一般的な URL 単独テキストは `fetch_title`（OGP 取得）で `{タイトル} - {URL}` に整形している
- YouTube はページ取得が不安定（同意画面・bot 判定）なため、公式の oEmbed API を利用する

## Goals / Non-Goals

- Goals:
  - 短縮系・フル形式の両方の YouTube URL を検出して整形する
  - 短縮 URL をフル URL に展開する（`t=` のみ保持）
  - タイトル取得を API キーなしで行う
- Non-Goals:
  - YouTube Data API v3 の導入（API キー管理が必要になるため）
  - サムネイル・動画長などの付加情報の取得
  - 複数 URL 混在時の個別整形

## Decisions

- Decision: タイトル取得は YouTube oEmbed API（`https://www.youtube.com/oembed?url=...&format=json`）を使用する
  - Alternatives considered: Data API v3（API キーの管理が必要）、`fetch_title` の流用（YouTube ページ取得の不安定性）
- Decision: URL の検出・正規化はフロントエンド（`MainContent.svelte`）で行い、バックエンド関数（`youtube_oembed`）は oEmbed 呼び出しに専念する
  - Alternatives considered: バックエンドで検出・正規化も実施（Swarm と同様にフロントエンドで検出する既存パターンを踏襲）
- Decision: 正規化ルール
  - `youtu.be/<video-id>` → `https://www.youtube.com/watch?v=<video-id>` に展開（`t=` のみ保持）
  - `youtube.com/watch?v=<video-id>` → ホストを `www.youtube.com` に統一（`t=` のみ保持）
  - `youtube.com/shorts/<video-id>` → 形式は維持しホストのみ統一（`t=` のみ保持）
  - `si=` `feature=` 等のトラッキングパラメータは除去する
- Decision: 複数の YouTube URL が本文に含まれる場合は、最初に検出された URL を対象に整形する（複数 URL の個別整形は行わない）
- Decision: URL 直後に日本語の文末記号（`。` `、` `！` `？` `〜` など）が続く場合は、記号を URL から除外して検出する（Swarm の検出と同様の扱い）

## Risks / Trade-offs

- oEmbed API の一時的な失敗（稀に 4xx）→ 失敗時は本文を変換しない（現状維持）ことでフォールバック
- 本文全体の置換により周囲のテキストが失われる → Swarm と同じ仕様であり、共有フローでは本文が URL のみであるため実害なし（Issue #33 の決定事項）

## Open Questions

- なし
