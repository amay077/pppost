# Mastodon 投稿対応の削除

## Why

mastodon.cloud のサービス停止に伴い、メインアカウントは misskey.io へ移行済みである（#25）。当初方針のとおり Mastodon 対応をフェードアウトさせ、コード・spec・環境変数から削除する。

Workers 移管（#27 / PPP-027）の前に実施すると、jsdom の書き換え（`mastodon_posts.js`）が丸ごと消え、sharp の WASM 置換も Bluesky 1 箇所へ減るため、**#27 の実装より先の実施を推奨**する。

## What Changes

### フロントエンド

- `MastodonConnection.svelte` を削除する
- `MainContent.svelte` から Mastodon のチェックボックス行・アイコン 2 箇所・リプライ手動入力欄・`replyToIdForMastodon`・`postOfType` リテラルの `mastodon` キーを削除する
- `func.ts` の `SettingDataMastodon` を union・`SettingDataType` 条件型から削除する（条件型の末尾フォールバックが `SettingDataBluesky` である点に注意）
- `MainContent.ts` の `postSettings` / `postTo` / 2 箇所の switch / `reply_to_ids` から `mastodon` を削除し、`postToMastodon` / `loadMyPostsMastodon` を削除する
- `config.ts` の `post_targets.mastodon` と `VITE_MASTODON_SERVER01..03` の読み込みを削除する

### バックエンド

- `mastodon_token.js` / `mastodon_post.js` / `mastodon_posts.js` を削除する
- `sns_disconnect.js` の `SNS_TYPES` から `'mastodon'` を削除する
- `foursquare_scrape.js` が返す `{ mastodon: postText }` フィールド（未使用の遺物）を削除する

### 設定・CI・ドキュメント

- `.github/workflows/deploy_github_pages.yml` から `VITE_MASTODON_SERVER01/02` を削除する
- `frontend/.env` / `backend/.env` / Netlify env から Mastodon 系変数を削除する（`.env.example` に該当項目はもとから無い）
- `README.md` の投稿先一覧・認証・テキスト正規化の Mastodon 記述を削除する
- `backend/test.http` の Mastodon セクションを削除する

### データ

- D1 の `sns_type='mastodon'` 行は、デプロイ後に一度だけ手動 SQL（`DELETE FROM sns_credentials WHERE sns_type='mastodon'`）で削除する。バックエンドの削除経路（`sns_disconnect`）が消えるため、暗号化済みとはいえトークンを持つ行を孤児として残さない
- `localStorage` の `ppp_setting_mastodon` は放置する（PPP-006 が Twitter の孤児キーに対して採った前例に従う。参照者がいないため実害なし）

### Spec

- `sns-posting`: 投稿対象を Bluesky・Threads・Misskey へ縮小する
- `image-upload`: 唯一の要件（Mastodon 5 MB 自動リサイズ）を REMOVED とし、capability ごと廃止する
- `credential-custody`: 保管対象・切断対象の列挙から Mastodon を削除する
- `PPP-004-reply-selection`: グループ化対象 SNS から Mastodon を削除する
- `misskey-posting`: 要件・シナリオ中の Mastodon への言及を削除する

## Non-Goals

- Workers 移管そのもの（PPP-027 で対応）
- Bluesky の画像縮小処理（`bluesky_post.js` の 976,560 B 制限対応）の仕様化。現状どの capability にも規定がなく、本 change でも扱わない
- D1 スキーマの変更（`sns_type` は自由文字列のため変更不要）
- `twitter-api-v2` など Mastodon と無関係な遺物依存の削除（PPP-027 Phase 3 の棚卸しで対応）

## Impact

- **Affected specs**: sns-posting (変更), image-upload (**廃止**), credential-custody (変更), PPP-004-reply-selection (変更), misskey-posting (変更)
- **Affected code**:
  - 削除: `frontend/src/lib/MastodonConnection.svelte`, `backend/netlify/functions/mastodon_token.js`, `mastodon_post.js`, `mastodon_posts.js`
  - 変更: `frontend/src/lib/func.ts`, `MainContent.ts`, `MainContent.svelte`, `frontend/src/config.ts`, `backend/netlify/functions/sns_disconnect.js`, `foursquare_scrape.js`, `.github/workflows/deploy_github_pages.yml`, `README.md`, `backend/test.http`
- **Breaking changes**: あり（**BREAKING**: Mastodon への投稿・接続機能が削除される。既存の接続は無効になり、D1 の保管トークンは手動削除する）
- **関連 Issue**: [#29](https://github.com/amay077/pppost/issues/29)
