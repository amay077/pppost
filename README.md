# PPPOST

PPPOST は、Twitter/X・Bluesky・Mastodon に一つの画面から同時投稿できるマルチプラットフォーム対応のソーシャルメディア投稿アプリケーションです。Svelte 製フロントエンドと Netlify Functions ベースのバックエンドを備えたモノレポ構成になっています。

## できること

- Twitter(X)・Bluesky・Mastodon (mastodon.cloud) への同時投稿  
  ※他サーバーへの対応希望は issue で相談してください

## 使い方

1. 各 SNS への接続設定を完了する
2. 投稿内容を入力して「Post」を実行する

## アーキテクチャ

- `/frontend` : TypeScript・Vite・PWA サポートを備えた Svelte 4 の SPA
- `/backend` : Netlify Functions で構築したサーバーレス API 群
- ルートディレクトリ : 共有設定やドキュメントを配置

**主要技術スタック**

- フロントエンド: Svelte 4、TypeScript、Vite 5、Bootstrap 5、@atproto/api (Bluesky 用)
- バックエンド: Node.js サーバーレス関数、twitter-api-v2、cheerio/jsdom
- 認証: Twitter OAuth、Mastodon トークン、Bluesky SDK

## 開発コマンド

### フロントエンド

```bash
cd frontend
npm install
npm run dev         # 開発サーバーを http://localhost:8080 で起動
npm run build       # プロダクションビルド
npm run check       # TypeScript/Svelte の型チェック
```

### バックエンド

```bash
cd backend
npm install
npm run dev         # Netlify Functions を http://localhost:9000 で起動
```

### 両方を同時に実行

1. ターミナル 1: `cd frontend && npm run dev`
2. ターミナル 2: `cd backend && npm run dev`

## 主要な実装パターン

- 新しいソーシャルプラットフォーム追加手順
  1. `/backend/netlify/functions/[platform]_auth.js` に認証フローを定義
  2. `/backend/netlify/functions/[platform]_token.js` にトークン管理を追加
  3. `/backend/netlify/functions/[platform]_post.js` に投稿エンドポイントを実装
  4. `/frontend/src/components/` にプラットフォーム固有コンポーネントを配置
  5. `/frontend/src/App.svelte` のメイン投稿ロジックを更新
- サーバーレス関数の基本形

```javascript
exports.handler = async (event, context) => {
  // CORS ヘッダーを付与
  // POST の場合は event.body をパース
  // { statusCode, headers, body } を返す
}
```

- フロントエンド状態管理
  - 認証トークンはローカルストレージに暗号化して保存
  - リアクティブな状態は Svelte ストアで管理
  - プラットフォーム固有の設定は別モジュールへ分離

## セキュリティ

- トークン保存時は crypto-js で暗号化
- API キーやシークレットは環境変数で管理
- クロスオリジン対策として `/backend/netlify/functions/cors.js` を利用

## テスト

- 現状は `/backend/test.http` を使った手動テストのみ
- 自動テストスイートは未整備

## デプロイ

- Netlify へデプロイ
- 設定は `/backend/netlify.toml` を参照

## 現在の制限事項

1. Misskey への投稿は未対応（検討余地あり）
2. 画像付き投稿は未サポート
3. Bluesky の OGP 対応なし

## License

See [LICENSE](LICENSE.txt) .
