# Implementation Tasks

## 1. フロントエンド: 型定義（func.ts）

- [x] 1.1 `SettingDataMastodon` 型を削除し、`SettingData` union から除去する
- [x] 1.2 `SettingDataType<T>` の条件型から `'mastodon'` 分岐を削除する（末尾フォールバックは `SettingDataBluesky` のまま）
- [x] 1.3 `savePostSetting` / `loadPostSetting` / `deletePostSetting` は型駆動のため変更不要であることを確認する

## 2. フロントエンド: UI（MainContent.svelte / MastodonConnection.svelte）

- [x] 2.1 `MastodonConnection.svelte` を削除し、`MainContent.svelte` の import と チェックボックス行を削除する
- [x] 2.2 Post ボタン内・リプライ手動入力欄の Mastodon アイコン（SVG 2 箇所）を削除する
- [x] 2.3 `replyToIdForMastodon` 変数・手動入力欄・`post()` の `reply_to_ids.mastodon`・Clear/成功時のクリア処理を削除する
- [x] 2.4 `postOfType` リテラル 3 箇所から `mastodon: undefined` を削除する
- [x] 2.5 `onChangePostSettings` から `postSettings.mastodon` の行を削除する

## 3. フロントエンド: 投稿処理（MainContent.ts / config.ts）

- [x] 3.1 `postSettings` / `postTo` から `mastodon` を削除する
- [x] 3.2 `loadMyPosts` / `postToSns` の switch から `case 'mastodon'` を削除し、`postToMastodon` / `loadMyPostsMastodon` を削除する
- [x] 3.3 `postToSns` の `reply_to_ids` 型と `groupByText` 内の `postOfType` 初期化から `mastodon` を削除する
- [x] 3.4 `config.ts` の `post_targets.mastodon`・`VITE_MASTODON_SERVER01..03` 読み込み・`ConfigType` の該当フィールドを削除する

## 4. バックエンド

- [x] 4.1 `mastodon_token.js` / `mastodon_post.js` / `mastodon_posts.js` を削除する
- [x] 4.2 `sns_disconnect.js` の `SNS_TYPES` から `'mastodon'` を削除する
- [x] 4.3 `foursquare_scrape.js` の戻り値から未使用の `mastodon` フィールドを削除する（フロントは `postText` のみ参照）

## 5. 設定・CI・ドキュメント

- [x] 5.1 `.github/workflows/deploy_github_pages.yml` から `VITE_MASTODON_SERVER01/02` を削除する（GitHub Actions Variables 本体の削除はユーザー操作）
- [x] 5.2 `frontend/.env` から `VITE_MASTODON_SERVER01/02` を削除する
- [x] 5.3 `backend/.env` から `PPPOST_MASTODON_CLIENT_AUTH_*` を削除する（Netlify env 本体の削除はユーザー操作）
- [x] 5.4 `README.md` から Mastodon の記述（投稿先一覧・認証方式・テキスト正規化の HTML エンティティ説明）を削除する
- [x] 5.5 `backend/test.http` の Mastodon セクション（statuses 投稿・apps 登録）を削除する

## 6. データ

- [ ] 6.1 デプロイ後、`npx wrangler d1 execute pppost --remote --command "DELETE FROM sns_credentials WHERE sns_type='mastodon'"` を一度実行し、削除行数を記録する
- [x] 6.2 `localStorage` の `ppp_setting_mastodon` は放置とする（PPP-006 の前例に従う）ことを確認する

## 7. 動作検証

- [x] 7.1 `cd frontend && npm run check` で新規の型エラーが出ない（既存 3 件は対象外。特に union 縮小による参照漏れの検出）
- [x] 7.2 `cd frontend && npm run build` が成功する
- [ ] 7.3 投稿画面に Mastodon のチェックボックス・接続 UI が表示されない
- [ ] 7.4 Bluesky・Threads・Misskey への投稿（単独・同時・画像付き・リプライ）が従来通り動作する
- [ ] 7.5 リプライ元候補に Bluesky・Threads・Misskey の投稿が表示され、グループ化・並び順が従来通りである
- [ ] 7.6 `ppp_setting_mastodon` が localStorage に残っている既存ブラウザでも、アプリがエラーなく起動する
- [ ] 7.7 `sns_disconnect` に `sns_type='mastodon'` を渡すと 400 が返る
- [ ] 7.8 D1 に `sns_type='mastodon'` の行が存在しないことを確認する（6.1 実施後）

## 8. アーカイブ時

- [x] 8.1 `openspec/specs/image-upload/` を削除する（唯一の要件が REMOVED となり capability 廃止のため。archive が空 spec を残す場合は手動で削除し、`openspec validate --all --strict` で確認する）
- [x] 8.2 `openspec/specs/sns-posting/spec.md` の `## Purpose` から Mastodon を除去する
- [x] 8.3 `openspec/specs/credential-custody/spec.md` の `## Purpose`（TBD のまま）を実内容へ更新し、対象 SNS を Threads・Bluesky・Misskey とする
- [x] 8.4 `openspec/specs/PPP-004-reply-selection/spec.md` の `## Purpose` から Mastodon を除去する
- [x] 8.5 `openspec/specs/misskey-posting/spec.md` の `## Purpose` の「Mastodon・Bluesky・Threads に Misskey を追加する」を現状に合わせて更新する
- [x] 8.6 各 spec の `## Related Changes` に本 change を追記する
