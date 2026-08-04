# 引用（Quote）投稿の追加と Manual reply の廃止

## Why

現在 pppost は reply のみ対応で引用（quote）が行えない。また、リプライ元の手動入力 UI（Manual reply）は煩雑であり、引用機能の追加に合わせて廃止し、ドロップダウン選択のみに統一する。

## What Changes

- 各 SNS への引用投稿を追加する:
  - **Bluesky**: `embed` に `app.bsky.embed.record`（引用のみ）/ `app.bsky.embed.recordWithMedia`（画像・OGP 併用）を指定。引用元は reply と同様に uri/cid を解決する
  - **Threads**: コンテナ作成（`POST /me/threads`）に `quote_post_id`（自投稿取得 API で得た投稿 `id`）を指定
  - **Misskey**: `notes/create` に `renoteId`（引用リノート）を指定
  - **Mastodon**: 対象外（PPP-029 で削除予定のため対応しない）
- **Manual reply を廃止**する:
  - リプライ元・引用元の指定を自分の投稿一覧からのドロップダウン選択のみに限定する
  - リプライ元の URL / ID 手動入力欄と「Manual reply」オプションを削除する
  - 副作用: 自分の投稿一覧に無い投稿（他人の投稿）へのリプライ・引用ができなくなる（許容する）
- **リプライと引用の排他**: 同時に指定できないようにする（どちらかを選択したら他方を解除）

## Impact

- **Affected specs**: `sns-posting`（引用の共通要件・Bluesky の引用・リプライ/引用元の選択方式）、`threads-posting`（Threads への引用）、`misskey-posting`（Misskey への引用、リプライ投稿の手動入力要件の削除）
- **Affected code**:
  - バックエンド: `backend/netlify/functions/threads_post.js` / `bluesky_post.js` / `misskey_post.js`
  - フロントエンド: `frontend/src/lib/MainContent.ts` / `MainContent.svelte`
- **Breaking changes**: リプライ元の手動入力 API（URL / ID 入力）を廃止するため、手動入力を利用していたユーザーへの影響あり（許容）
- **Open questions**:
  - Threads の `quote_post_id` が IMAGE / CAROUSEL コンテナで有効かは公式ドキュメントで確認できず（公式サンプル fbsamples/threads_api ではコンテナ共通パラメータ）。実機で確認し、不可なら TEXT のみ対応へフォールバックする
  - Bluesky の引用 + OGP 同時は `recordWithMedia`（media: external）で理論上可能。実機で確認する

## References

- [Issue #32](https://github.com/amay077/pppost/issues/32) - 引用（quote）投稿を可能にする + Manual reply を廃止
