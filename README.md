# PPPOST

PPPOST は、Twitter/X・Bluesky・Mastodon に一つの画面から同時投稿できるマルチプラットフォーム対応のソーシャルメディア投稿アプリケーションです。Svelte 製フロントエンドと Netlify Functions ベースのバックエンドを備えたモノレポ構成になっています。

## できること

- Twitter(X)・Bluesky・Mastodon (mastodon.cloud) への同時投稿  
  ※他サーバーへの対応希望は issue で相談してください

## 使い方

1. 各 SNS への接続設定を完了する
2. 投稿内容を入力して「Post」を実行する

### URL 起動時のクエリパラメータ

- `text` : 起動時に投稿本文へ即反映される。改行や記号はクエリ文字列としてエンコードして指定する。
- `url` : `text` が未指定の場合に投稿本文へ反映される。
- Swarm 対応：どちらかでセットされた本文内に `https://swarmapp.com/.../checkin/...` 形式の URL が含まれると、自動でスクレイピング API を呼び出し、取得したチェックイン内容で本文を置き換える。

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

- 新しいソーシャルプラットフォーム追加  
  現時点では共通化された手順が確立されていないため、既存の Mastodon/Bluesky/Twitter 実装を参考に個別対応してください。
- サーバーレス関数の基本形

```javascript
exports.handler = async (event, context) => {
  // CORS ヘッダーを付与
  // POST の場合は event.body をパース
  // { statusCode, headers, body } を返す
}
```

- フロントエンド状態管理
  - 認証トークンはローカルストレージに保存しており、現状は平文 JSON で保持される
  - 状態はコンポーネント内のリアクティブ変数で管理
  - プラットフォーム固有の設定は別モジュールへ分離

## セキュリティ

- アカウント設定はローカルストレージに平文 JSON で保存されるため、端末共有や XSS に対して漏洩リスクがある。暗号化対応が今後の課題。
- API キーやシークレットは環境変数で管理
- クロスオリジン対策として `/backend/netlify/functions/cors_proxy.js` を利用

## テスト

- 現状は `/backend/test.http` を使った手動テストのみ
- 自動テストスイートは未整備

## デプロイ

- Netlify へデプロイ
- 設定は `/backend/netlify.toml` を参照

## 現在の制限事項

1. Misskey への投稿は未対応（検討余地あり）
2. ローカルストレージに保存した接続情報が平文のまま保持される（暗号化未対応）
3. Mastodon 以外のサーバーへの認証情報テンプレートが未整備（環境変数を追加すれば拡張可能）

## License

See [LICENSE](LICENSE.txt) .
