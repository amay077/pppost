# README 記載事項検証レポート（PPP-002）

## 目的
README.md に記載されたプロジェクト説明・機能・制約が、現行実装／構成と一致しているかを検証する。

## 判定基準
- **OK**: README の記述と実装が一致。
- **NG**: README の記述が実装と矛盾。
- **TBD**: 設定依存などで一概に判断できない、または追加確認が必要。

## 検証結果一覧

| 項目 | README 記述 | 判定 | 根拠・備考 |
| --- | --- | --- | --- |
| 製品概要 | 「Twitter/X・Bluesky・Mastodon に同時投稿できる SPA。Svelte＋Netlify Functions のモノレポ。」 | OK | 同時投稿 UI／処理が実装済み (`frontend/src/lib/MainContent.svelte:202`, `frontend/src/lib/MainContent.ts:132`)。Svelte/Vite/Netlify Functions 構成を確認 (`frontend/package.json:6`, `backend/netlify/functions/twitter_post.js:1`)。 |
| Mastodon 対応サーバー | 「mastodon.cloud に投稿（他サーバーは要相談）」 | TBD | デフォルトは環境変数から読み込んでおり `mastodon.cloud` 固定とは限らない (`frontend/src/config.ts:16`)。README の限定表現は環境設定によっては不正確。 |
| 主要技術スタック（フロントエンド） | 「Svelte 4、TypeScript、Vite 5、Bootstrap 5、@atproto/api」 | OK | 該当ライブラリを依存関係で確認 (`frontend/package.json:6`, `frontend/src/app.scss:2`)。 |
| 主要技術スタック（バックエンド） | 「Node.js サーバーレス関数、twitter-api-v2、cheerio/jsdom」 | OK | Netlify Functions と各ライブラリを使用 (`backend/package.json:21`, `backend/netlify/functions/twitter_posts.js:4`, `backend/netlify/functions/mastodon_posts.js:44`)。 |
| 認証方式 | 「Twitter OAuth、Mastodon トークン、Bluesky SDK」 | OK | 各接続コンポーネント・関数で実装 (`frontend/src/lib/TwitterConnection.svelte:26`, `frontend/src/lib/MastodonConnection.svelte:21`, `backend/netlify/functions/bluesky_login.js:1`)。 |
| 新規プラットフォーム追加手順 | 「`/backend/netlify/functions/[platform]_auth.js` などを追加し、`/frontend/src/components/` にコンポーネントを置く」 | NG | 実際には `frontend/src/lib/` 配下で管理しており `_auth.js` が存在しないプラットフォームもある (`frontend/src/lib/MastodonConnection.svelte:1`)。ガイドのディレクトリ・ファイル名が現実と不一致。 |
| サーバーレス関数の基本形 | 「CORS ヘッダーを付けて `{ statusCode, headers, body }` を返す」 | OK | 主要関数が同パターンで実装 (`backend/netlify/functions/mastodon_post.js:21`, `backend/netlify/functions/twitter_post.js:96`)。 |
| フロントエンド状態管理 | 「トークンは暗号化してローカルストレージ保存。Svelte ストアで状態管理。設定は別モジュール分離。」 | NG | トークンは平文 JSON のまま保存 (`frontend/src/lib/func.ts:43`)。Svelte ストアは未使用。設定モジュール分離のみ一致。 |
| セキュリティ対策 | 「トークン暗号化に crypto-js、機密情報は環境変数、CORS プロキシは `cors.js`。」 | NG | `crypto-js` は依存にあるが暗号化処理は未実装。CORS プロキシは `cors_proxy.js` 名で実装 (`backend/netlify/functions/cors_proxy.js:1`)。環境変数利用は一致。 |
| テスト | 「`/backend/test.http` の手動テストのみ」 | NG | `backend/test-supabase-upload.js` によるアップロード検証スクリプトも存在。 |
| デプロイ | 「Netlify にデプロイし `backend/netlify.toml` を参照」 | OK | 同ファイルで設定を確認 (`backend/netlify.toml:1`)。 |
| 制限事項① | 「Misskey への投稿は未対応」 | OK | コード・設定に Misskey 対応はなし。 |
| 制限事項② | 「画像付き投稿は未サポート」 | NG | UI・Supabase 経由の画像投稿処理が実装済み (`frontend/src/lib/ImagePreview.svelte:1`, `frontend/src/lib/MainContent.ts:139`, `backend/netlify/functions/twitter_post.js:34`)。 |
| 制限事項③ | 「Bluesky の OGP 対応なし」 | NG | Bluesky 投稿で OGP 埋め込み処理が実装済み (`backend/netlify/functions/bluesky_post.js:196`)。 |

## 追加メモ
- README の「できること」節は概ね正しいが、対応サーバーの限定表記は設定次第で変わるため注意。
- README の「主要な実装パターン」「セキュリティ」「制限事項」は現状コードと乖離が大きい。最新実装に合わせた修正が必要。

