# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際のClaude Code (claude.ai/code) への指針を提供します。

## 概要

PPPOSTは、Twitter/X、Bluesky、Mastodonに一つのインターフェースから投稿できるマルチプラットフォーム対応のソーシャルメディア投稿アプリケーションです。SvelteフロントエンドとNetlify Functionsバックエンドを持つモノレポ構造になっています。

## アーキテクチャ

**モノレポ構造:**
- `/frontend` - TypeScript、Vite、PWAサポートを備えたSvelte 4 SPA
- `/backend` - APIエンドポイント用のNetlifyサーバーレス関数
- ルートレベルには共有設定を配置

**主要技術:**
- フロントエンド: Svelte 4、TypeScript、Vite 5、Bootstrap 5、@atproto/api (Bluesky用)
- バックエンド: Node.jsサーバーレス関数、twitter-api-v2、cheerio/jsdom
- 認証: OAuth (Twitter)、トークンベース (Mastodon)、SDK (Bluesky)

## 開発コマンド

### フロントエンド開発
```bash
cd frontend
npm install
npm run dev         # 開発サーバーを http://localhost:8080 で起動
npm run build       # プロダクションビルド
npm run check       # TypeScript/Svelteの型チェック
```

### バックエンド開発
```bash
cd backend
npm install
npm run dev         # Netlify関数を http://localhost:9000 で起動
```

### 両方を同時に実行
2つのターミナルを開く:
1. ターミナル1: `cd frontend && npm run dev`
2. ターミナル2: `cd backend && npm run dev`

## 主要な実装パターン

### 新しいソーシャルプラットフォームのサポート追加
1. `/backend/netlify/functions/[platform]_auth.js` に認証フローを作成
2. `/backend/netlify/functions/[platform]_token.js` にトークン管理を追加
3. `/backend/netlify/functions/[platform]_post.js` に投稿エンドポイントを実装
4. `/frontend/src/components/` にプラットフォーム固有のコンポーネントを追加
5. `/frontend/src/App.svelte` のメイン投稿ロジックを更新

### サーバーレス関数パターン
`/backend/netlify/functions/` 内の関数は以下のパターンに従う:
```javascript
exports.handler = async (event, context) => {
  // CORSヘッダーが必要
  // POSTリクエストの場合はevent.bodyをパース
  // { statusCode, headers, body } を返す
}
```

### フロントエンドの状態管理
- 認証トークンはローカルストレージに保存
- リアクティブな状態にはSvelteストアを使用
- プラットフォーム固有の設定は別モジュールに分離

### セキュリティの考慮事項
- トークンはcrypto-jsを使用して暗号化してから保存
- 機密データ（APIキー、シークレット）は環境変数を使用
- クロスオリジンリクエスト用のCORSプロキシ (`/backend/netlify/functions/cors.js`)

## テスト
現在は `/backend/test.http` ファイルを使用した手動テストのみ。自動テストスイートはなし。

## デプロイ
Netlifyにデプロイ。設定は `/backend/netlify.toml` にあり。

## 現在の制限事項 (README.mdより)
- Misskeyサポートなし
- 画像投稿機能は部分的に実装されているが有効化されていない
- Bluesky OGP (Open Graph) サポートなし

## 重要なファイル
- `/frontend/src/App.svelte` - メインアプリケーションコンポーネント
- `/frontend/src/lib/` - 共有ユーティリティとAPIクライアント
- `/backend/netlify/functions/` - すべてのサーバーレスAPIエンドポイント
- `/frontend/index.mustache` - バージョン注入用のHTMLテンプレート