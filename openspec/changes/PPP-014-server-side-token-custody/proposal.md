# 投稿トークンのサーバー側保管（BFF 化）

## Why

各 SNS のアクセストークン（Threads=60日長命、Bluesky=session JWT 一式、Mastodon=access_token）が現状
クライアントの `localStorage` に平文保存され、操作ごとに平文でサーバーへ往復している。XSS で全 SNS トークンが
一括流出すると、pppost 外での恒久的なアカウント乗っ取りに直結する。

本変更は BFF（Backend for Frontend）化により、トークンをサーバー側の保管庫（Cloudflare D1）へ暗号化保存し、
**クライアントには一切返さない**。クライアントは pppost が発行する不透明なセッション ID だけを保持し、Bearer で認可する。
あわせて、PPP-013 でクライアント（`localStorage`）管理としていた Threads ゴースト投稿の間隔状態もサーバー側へ移管し、
改ざん不可・多端末一貫にする。

前提の変化: Supabase は廃止（画像は Cloudflare R2 へ移行済み）、Twitter 関連 Function は削除済み。

## What Changes

- 新規 capability `credential-custody`（ADDED）を追加し、次を定義する:
  - サーバー発行の匿名セッション（`Authorization: Bearer <session_id>`）とその保管
  - SNS トークンを Cloudflare D1 に AES 暗号化保存し、クライアントへ返さない要件
  - 発行系（接続）・消費系（投稿/取得/リフレッシュ）でセッションから保管トークンを引く要件
- `threads-posting` spec を MODIFIED:
  - `### Requirement: Threads アカウント接続` — トークンを `localStorage` でなくサーバー保管に変更、返すのは session_id とメタのみ。あわせて接続要件の scope 表記を `threads_basic,threads_content_publish,threads_manage_replies`（3 スコープ）に是正し、既存のリプライ要件（`threads_manage_replies` 必須）との latent な不整合を解消する
  - `### Requirement: Threads 長命トークンの自動リフレッシュ` — リフレッシュ判定・実行を**サーバー側**へ移管
  - `### Requirement: PR ゴースト投稿設定の管理` / `### Requirement: PR ゴースト投稿の自動付与` — 状態・間隔判定をサーバー（D1）へ移管
- バックエンド: D1 アクセス + AES 暗号化の共通ユーティリティ、セッション発行/検証を新設。発行系 3 関数
  （`threads_token`/`mastodon_token`/`bluesky_login`）と消費系 7 関数（`threads_post`/`threads_posts`/`threads_refresh`/
  `mastodon_post`/`mastodon_posts`/`bluesky_post`/`bluesky_posts`）を改修
- フロントエンド: `func.ts` からトークン保存を除去し `ppp_session_id` を追加、`MainContent.ts` の各 `postToXxx` を Bearer 認可へ、
  各 `*Connection.svelte` を「トークンを受け取らない」フローへ

## Non-Goals

- ユーザーログイン（認証）の導入。個人単一ユーザー前提の匿名セッションに留める（多人数対応は将来の別 proposal）
- Netlify から Cloudflare へのランタイム移行そのもの（D1 採用はその布石だが、本変更ではバックエンドは Netlify Functions のまま）
- HttpOnly Cookie セッション（クロスサイト構成のため Bearer とする。Cookie 化は同一サイト化を伴う将来課題）
- 既存 `localStorage` トークンの自動移行（後方互換は持たず、再接続で対応）

## Impact

- **Dependencies**: PPP-009〜PPP-013（Threads 投稿基盤・ゴースト投稿）の完了を前提とする（すべてアーカイブ済み）
- **New infrastructure**: Cloudflare D1（テーブル 2 種）。Netlify 環境変数に CF API トークン・DB ID・アカウント ID を追加
- **Affected specs**:
  - credential-custody（ADDED: 新 capability）
  - threads-posting（MODIFIED: 接続 / トークンリフレッシュ / PR ゴースト設定管理 / PR ゴースト自動付与）
- **Affected code**:
  - 新規: D1 + 暗号化 + セッションの共通ユーティリティ（`backend/netlify/functions` 配下）
  - 変更: 発行系 3 関数・消費系 7 関数、`frontend/src/lib/func.ts`・`MainContent.ts`・各 `*Connection.svelte`
- **Breaking changes**: あり。全ユーザーは各 SNS の**再接続が必要**（旧 localStorage トークンは無効化）

## References

- [design.md](./design.md) - D1 アクセス方式、セッションモデル、暗号化、OAuth コールバック変更、移行方針
- [plan-202607021307.md](./references/plan-202607021307.md) - plan モードで確定した設計
