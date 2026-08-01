# Misskey 投稿機能の追加（MiAuth 認証・ネイティブ API）

## Why

mastodon.cloud がサービス停止するため、利用者のメインアカウントを misskey.io へ移行する。
本アプリは現在 Mastodon・Bluesky・Threads への同時投稿に対応しているが、ここに Misskey を投稿対象として追加する。

Mastodon は移行期間中も併存させ、削除・縮退は別 change で扱う（[PPP-006](../archive/2026-06-03-PPP-006-remove-twitter-posting/proposal.md) が Twitter を廃除したのと同じ手順を後日踏む）。

### 調査で確定した前提

misskey.io の実 API を叩いて確認した事実（2026年8月1日 時点、`https://misskey.io/api/meta`）。

| 項目 | 実測値 | 設計への影響 |
|------|--------|--------------|
| ソフトウェア | MisskeyIO fork `2025.4.1-io.12b` | — |
| Mastodon 互換 API | **無し**（`GET /api/v1/instance` → 404） | 既存 `mastodon_*.js` の流用は不可。ネイティブ API で新規実装する |
| MiAuth | `features.miauth: true` | アプリ事前登録・`client_secret`・PKCE がすべて不要 |
| `maxNoteTextLength` | 3000 | 文字数上限は Mastodon より緩く、専用カウンタは設けない |
| `maxFileSize` | 524288000 (500 MB) | Mastodon の 5 MB 自動リサイズ（`image-upload` capability）は Misskey には適用不要 |
| `fileIds` | 最大 16 件 | 実用上の制限に当たらない |
| 認証 | 全 API が `Authorization: Bearer` を受理 | `credential-custody` の保管トークン方式とそのまま噛み合う |

MiAuth の疎通も確認済み。

- `POST https://misskey.io/api/miauth/{uuid}/check`（未認可）→ `200 {"ok":false}`
- `GET https://misskey.io/miauth/{uuid}?name=...&permission=...` → `200`
- `POST https://misskey.io/api/i` に不正トークン → `401 AUTHENTICATION_FAILED`

## What Changes

- `openspec/specs/misskey-posting/` を新設し、接続・テキスト投稿・画像投稿・リプライ投稿・自投稿取得・文字数上限を規定する
- `func.ts` に `SettingDataMisskey` 型を追加し、`SettingData` ユニオン・`SettingType`・`SettingDataType` に `misskey` を加える
- `frontend/src/lib/MisskeyConnection.svelte` を新規作成し、MiAuth による接続/切断 UI を提供する（接続先ホストはテキスト入力、既定値 `misskey.io`）
- `MainContent.svelte` に Misskey の投稿対象チェックボックス・アイコン・リプライ元手動入力欄を追加する
- `MainContent.svelte` の `getPostId` を、URL としてパースできない入力をそのままノート ID として返すよう堅牢化する。Misskey の「ノート URL またはノート ID の直接入力」要件に必要な是正であり、同関数を共有する Mastodon・Bluesky の潜在バグ（裸の ID 入力で例外が発生し投稿処理全体が無言で中断する）も同時に解消される（[design.md D8](design.md)）
- `MainContent.ts` の `postSettings` / `postTo` / `postToSns` / `loadMyPosts` に `misskey` を追加し、`postToMisskey()` / `loadMyPostsMisskey()` を実装する
- バックエンド `misskey_token.js`（MiAuth check → D1 保管）、`misskey_post.js`（ドライブ投稿 → ノート作成）、`misskey_posts.js`（自投稿取得）と、ユーザー入力ホストを検証する共通ライブラリ `lib/misskey-host.js` を新規作成する
- `sns_disconnect.js` の `SNS_TYPES` に `'misskey'` を追加する
- `sns-posting` の投稿対象範囲要件を更新する。現行仕様は「Mastodon と Bluesky に限定」と記述されているが、Threads（PPP-009）が既に実装済みで仕様と実態が乖離しているため、Misskey の追加に合わせて Threads も含めた現行の投稿対象へ是正する。あわせて、archive 時に `openspec/specs/sns-posting/spec.md` の `## Purpose` 本文（同じく「Mastodon と Bluesky」と記述）を 4 SNS 対応へ手動で書き換える。OpenSpec の archive は `## Requirements` セクションのみを差し替えるため、Purpose は自動更新されない
- `credential-custody` の保管対象・切断対象に Misskey を追加する
- `PPP-004-reply-selection` のグループ化対象 SNS に Misskey を追加する

## Non-Goals

- Mastodon の削除・縮退（別 change で対応）
- SNS プロバイダの抽象化リファクタリング（`postOfType` などの列挙を `Record<SettingType, …>` に集約する改修）
- OAuth 2.0 (IndieAuth) 対応
- Misskey 固有機能（CW、可視性の選択、リアクション、チャンネル投稿、ローカルのみ投稿）
- Misskey 専用の文字数カウンタ表示（3000 文字上限は API のエラー応答として扱う）
- `image-upload` capability（Mastodon の 5 MB 自動リサイズ）の Misskey への適用
- PR ゴースト投稿（PPP-013、`threads-posting` capability）の Misskey 対応。現状 `threads_post.js` にのみ組み込まれており、Misskey 投稿では発火しない
- Misskey 接続先ホストの DNS 解決結果に基づく内部アドレス判定（ホスト検証は文字列形式に限定する。[design.md D3](design.md) 参照）

## Impact

- **Affected specs**: misskey-posting (新規), sns-posting (変更), credential-custody (変更), PPP-004-reply-selection (変更)
- **Affected code**:
  - 新規: `frontend/src/lib/MisskeyConnection.svelte`, `backend/netlify/lib/misskey-host.js`, `backend/netlify/functions/misskey_token.js`, `backend/netlify/functions/misskey_post.js`, `backend/netlify/functions/misskey_posts.js`
  - 変更: `frontend/src/lib/func.ts`, `frontend/src/lib/MainContent.ts`, `frontend/src/lib/MainContent.svelte`, `backend/netlify/functions/sns_disconnect.js`, `README.md`, `backend/test.http`
- **環境変数**: 追加なし。MiAuth はアプリ事前登録を要さず、接続先ホストはユーザー入力のため、`backend/.env` / `frontend/.env` / `.github/workflows/deploy_github_pages.yml` のいずれも変更不要
- **Breaking changes**: なし（機能追加のみ。Mastodon・Bluesky・Threads への投稿は従来通り）。唯一の既存挙動の変更は `getPostId` の堅牢化で、従来は例外により投稿処理全体が無言で中断していた「裸の ID 入力」が正しくリプライとして処理されるようになる改善である
- **関連 Issue**: [#25](https://github.com/amay077/pppost/issues/25)
