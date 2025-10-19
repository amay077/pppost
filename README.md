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
- URL のみが指定されている場合は対象ページのタイトルを取得し、`{タイトル} - {URL}` の形式で本文へ整形する。
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

## OpenSpec ワークフロー

本プロジェクトでは、新機能や重要な修正に [OpenSpec](https://github.com/pocketworks/openspec) を活用した仕様駆動開発を採用しています。

### 基本フロー

1. **プロポーザル作成**: `/openspec/changes/{change-id}/proposal.md` で変更の背景・内容・影響を記述
2. **仕様定義**: `/openspec/changes/{change-id}/specs/{capability}/spec.md` で要件とシナリオを定義
3. **タスク分割**: `/openspec/changes/{change-id}/tasks.md` で実装タスクをステップ分割
4. **実装**: タスクに沿って実装
5. **検証**: `openspec validate` でプロポーザルと仕様の整合性を確認

### 本プロジェクトの OpenSpec 慣例

#### プロジェクト固有情報

- **PROJECT_KEY**: `PPP` (PPPOST の略)
- **コミットメッセージ**: 日本語、チケット番号を接頭辞に付与（例: `PPP-003 リプライ選択グループ化を修正`）
- **Git ワークフロー**: 過去のコミットを書き換える操作は禁止し、常に通常の `git commit` を使用

#### 命名規則

本プロジェクトでは、proposal と spec の両方にチケット番号を付与し、課題管理システムで親子関係を管理します。

**Change ID (Proposal ID):**
- 形式: `PPP-{TASK_ID}-{descriptive-name}`
- 例: `PPP-005-add-threads-support`

**Spec Directory Name:**
- 形式: `PPP-{TASK_ID}-{descriptive-name}`
- 例: `PPP-006-threads-ui`, `PPP-008-threads-api`
- proposal とは異なるチケット番号を使用

**構造例:**
```
openspec/changes/PPP-005-add-threads-support/  ← proposal (親)
├── proposal.md
├── tasks.md
└── specs/
    ├── PPP-006-threads-ui/      ← spec1 (子)
    │   └── spec.md
    ├── PPP-008-threads-api/     ← spec2 (子)
    │   └── spec.md
    └── PPP-010-threads-notification/  ← spec3 (子)
        └── spec.md
```

#### 言語慣例

- **見出しは英語と日本語の併記**: `#### Scenario: Same content posted to multiple SNS（同じ内容を複数 SNS に投稿）`
  - 英語見出しで OpenSpec ツールとの互換性を維持
  - 括弧内の日本語で日本語話者の理解を容易にする
- **本文は日本語**: WHEN/THEN 条件などの仕様記述は日本語で記述
- **Requirement には SHALL/MUST を含める**: OpenSpec 検証に必須

詳細は `/openspec/AGENTS.md` を参照してください。

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

## SNS 投稿テキストの扱いと正規化

### 各 SNS のテキスト形式の違い

- **Twitter/X**: Yahoo リアルタイム検索経由でスクレイピングするため、URL が省略形（`docs.github.com/ja/copilot/get…`）で含まれる場合がある。投稿時刻の正確な取得は不可能。
- **Bluesky**: Bluesky SDK 経由でプレーンテキストとして取得
- **Mastodon**: Mastodon API 経由で取得。HTML エンティティ（`&nbsp;`, `&lt;`, `&quot;` など）が含まれる場合がある

### リプライ元選択でのグループ化ロジック

同一内容の投稿を複数 SNS から取得した際、リプライ元選択ドロップダウンで1つのグループとして表示するため、以下の正規化処理を行います（`frontend/src/lib/MainContent.ts:normalizeTextForGrouping`）：

1. **URL の除去**: `https?://[^\s]+` パターンにマッチする URL を削除
2. **HTML タグの除去**: `<[^>]+>` パターンにマッチするタグを削除
3. **HTML エンティティのデコード**: `&nbsp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&amp;` を対応する文字に変換
4. **空白の正規化**: 連続する空白文字（スペース、タブ、改行）を1つのスペースに統一
5. **前後の空白削除**: `trim()` で除去
6. **50%比較**: 正規化後のテキストの最初の50%（最小10文字、最大100文字）をグループ化キーとして使用

この正規化により、以下のような微妙な違いがあっても同一グループとして扱われます：

```javascript
// Twitter/X (Yahoo経由)
"docs.github.com/ja/copilot/get… 会社で Copilot Business...。 3〜4日..."

// Bluesky
"会社で Copilot Business...。3〜4日..."
```

### Twitter/X の制約事項

Yahoo リアルタイム検索を利用した Twitter/X のスクレイピングでは、正確な投稿時刻を取得できません。そのため、投稿時刻を基準としたグループ化は行わず、テキスト内容のみでグループ化しています。

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
