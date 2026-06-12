# Threads 画像投稿対応

## Why

PPP-009 で実装した Threads 投稿機能はテキストのみ対応で、画像は Non-Goal としていた。Mastodon・Bluesky では画像付き投稿が可能なため、Threads でも同様に対応し、マルチ SNS 投稿体験を統一する。

Threads API は画像を「公開 URL」として受け取る仕様のため、既存の Supabase 一時保存フローを再利用できる。

本変更は PPP-009（Threads テキスト投稿）の完了を前提とする。PPP-009 のテキスト投稿要件には「MVP では画像を Threads へ送信してはならない (SHALL NOT)」という制約があるため、本変更ではこの制約を解除する。

## What Changes

- PPP-009 の `### Requirement: Threads へのテキスト投稿` を MODIFIED で取り込み、「画像を送信してはならない (SHALL NOT)」制約を解除する
- `### Requirement: Threads への画像投稿`（ADDED）を追加し、単画像・カルーセル投稿、11 枚以上の上限超過時の挙動を定義する
- `### Requirement: Threads 画像投稿失敗時のエラー通知`（ADDED）を追加し、多段フローの失敗時にエラー一覧へ `Threads` を含める要件を定義する
- `backend/netlify/functions/threads_post.js` に `images`（Supabase 公開 URL 配列）受け取りを追加し、単画像（`media_type=IMAGE`）とカルーセル（`media_type=CAROUSEL`）の 2 段階投稿フローを実装する
- `frontend/src/lib/MainContent.ts` の `postToThreads()` に `imageUrls: string[]` 引数を追加し、`postToSns` の `case 'threads'` から渡す

## Non-Goals

- 動画投稿（`media_type=VIDEO`）
- Threads 専用の画像リサイズ（Supabase アップロード前に Mastodon・Bluesky 用リサイズは既存処理で行われるため、Threads でもその URL を流用する）

## Impact

- **Dependencies**: PPP-009（Threads テキスト投稿）の完了を前提とする。本変更は PPP-009 の `postToThreads` / `threads_post.js` を拡張する。
- **Affected specs**: threads-posting（MODIFIED: テキスト投稿要件 / ADDED: 画像投稿・画像投稿失敗通知）
- **Affected code**:
  - 変更: `backend/netlify/functions/threads_post.js`, `frontend/src/lib/MainContent.ts`
- **Breaking changes**: なし（テキストのみ投稿は従来通り動作する）

> 注: image-upload spec（Mastodon リサイズ仕様）は変更しない。Threads は Supabase 公開 URL を流用するだけでリサイズ処理を持たないため、image-upload への影響はない。
