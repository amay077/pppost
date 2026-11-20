# Implementation Tasks

## 1. OpenSpec

- [x] 1.1 proposal.md / design.md / tasks.md を作成
- [x] 1.2 x-posting / x-post-api の spec delta を作成
- [x] 1.3 sns-posting を MODIFIED
- [x] 1.4 開発依頼書を references/ に移動

## 2. x-post-api のコア

- [x] 2.1 設定の読み込みと検証
- [x] 2.2 重み付き文字数
- [x] 2.3 入力検証
- [x] 2.4 Bearer 認証
- [x] 2.5 冪等性
- [x] 2.6 排他制御
- [x] 2.7 レート制限
- [x] 2.8 監査ログ
- [x] 2.9 HTTP サーバー（GET /health, POST /post）
- [x] 2.10 CORS
- [x] 2.11 dry_run

## 3. Chrome ブリッジ

- [x] 3.1 run-js.applescript
- [x] 3.2 x-check.js
- [x] 3.3 x-post.js（fill / click）
- [x] 3.4 chrome_bridge.py（タブ/アカウント選択、状態確認、投稿、結果確認）
- [x] 3.5 エラーマッピング

## 4. テスト

- [x] 4.1 重み付き文字数・検証・認証
- [x] 4.2 冪等性・排他・レート制限
- [x] 4.3 サービス（dry_run、成功、エラー、リトライなし）
- [x] 4.4 HTTP / CORS
- [x] 4.5 Chrome ブリッジ（モック）

## 5. デプロイ

- [x] 5.1 docker-compose.yml / serve.json
- [x] 5.2 .env.example
- [x] 5.3 launchd plist / run.sh
- [x] 5.4 README（ホスト Mac の構築手順）
- [x] 5.5 .gitignore

## 6. PPPOST フロントエンド

- [x] 6.1 SettingDataX
- [x] 6.2 XConnection.svelte
- [x] 6.3 postToX / エラーマッピング
- [x] 6.4 MainContent.svelte（チェックボックス、非対応要素の無効化、文字数）
- [x] 6.5 README
- [x] 6.6 X 選択時の投稿前疎通確認（失敗時は全体送信を中止）

## 7. 検証

- [x] 7.1 `python3 -m unittest`
- [x] 7.2 `/usr/bin/python3 -m unittest`
- [x] 7.3 `npm run check`
- [x] 7.4 `openspec validate PPP-042-add-x-posting --strict`
- [ ] 7.5 手動 E2E（ホスト Mac）
