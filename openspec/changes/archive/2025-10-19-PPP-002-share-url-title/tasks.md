# 実装タスク

## 1. バックエンド実装

- [x] 1.1 Netlify Functions に `fetch_title.js` を新規作成
- [x] 1.2 入力パラメータ `url` のバリデーション実装
- [x] 1.3 CORS ヘッダー設定を実装
- [x] 1.4 `cheerio` を使用して OGP メタタグ `og:title` を抽出
- [x] 1.5 OGP が存在しない場合は `<title>` タグを抽出（HTML 先頭 200 文字まで解析）
- [x] 1.6 HTML エンティティをデコード（UTF-8 として扱う）
- [x] 1.7 レスポンス形式 `{ success: boolean, title?: string, error?: string }` を実装
- [x] 1.8 ユーザーエージェント設定（OGP 対応サイトでの取得精度向上）

## 2. フロントエンド実装

- [x] 2.1 `MainContent.svelte` の `onMount` に URL 判定ロジックを追加
- [x] 2.2 URL のみ判定条件を実装（trim 後が有効な HTTP/HTTPS URL で余分な文字がない）
- [x] 2.3 URL 後ろの句読点（`、` `。` `,` `.`）やゼロ幅スペースを除去
- [x] 2.4 `text` パラメータ優先、未指定時は `url` パラメータを使用するロジック
- [x] 2.5 `fetch_title` API を呼び出してタイトルを取得
- [x] 2.6 取得成功時に本文を `{タイトル} - {URL}` 形式に置換
- [x] 2.7 Swarm URL の場合は既存処理を優先する制御フラグを実装
- [x] 2.8 取得中は `loading` フラグを `true` に設定、完了後に `false` へ戻す
- [x] 2.9 失敗時は `console` にログを記録し、本文は変更しない

## 3. テストと検証

- [x] 3.1 `text=https://example.com` でタイトル取得・本文変換が成功することを確認
- [x] 3.2 `text=コメント%20https://example.com` の場合は変換しないことを確認
- [x] 3.3 `url=https://example.com` で `text` 未指定のケースも変換されることを確認
- [x] 3.4 OGP が存在せず `<title>` のみでも変換されることを確認
- [x] 3.5 取得失敗時に本文が URL のまま維持されることを確認
- [x] 3.6 Swarm チェックイン URL の場合、従来どおりスクレイピング結果が優先されることを確認
