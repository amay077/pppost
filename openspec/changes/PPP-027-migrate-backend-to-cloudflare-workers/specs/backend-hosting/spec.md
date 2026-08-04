# Backend Hosting

## Overview

バックエンド API の実行基盤（Cloudflare Workers）に関する仕様。エンドポイント互換性、クロスオリジン許可、既存データの継続利用、実行時間特性、Cloudflare リソースへのアクセス方式を定める。

## ADDED Requirements

### Requirement: エンドポイント互換の単一 Worker（Path-compatible single Worker）

システムは、バックエンド API を Cloudflare Workers 上の単一 Worker として提供し、従来の Netlify Functions と同じパス名（`/misskey_post`、`/threads_token` 等）でルーティングしなければならない (SHALL)。フロントエンドの切り替えは API エンドポイントのベース URL（`VITE_API_ENDPOINT`）の変更のみで完結しなければならず (SHALL)、フロントエンドのコード変更を要求してはならない (SHALL NOT)。

#### Scenario: エンドポイント差し替えのみで動作する（Switch by endpoint only）

- **GIVEN** フロントエンドが Netlify 向けの `VITE_API_ENDPOINT` で稼働している
- **WHEN** `VITE_API_ENDPOINT` を Workers のベース URL へ変更して再ビルド・再デプロイする
- **THEN** 接続・投稿・自投稿取得・切断・画像アップロード（事前署名 URL 発行）・URL タイトル展開・バージョン表示のすべてがフロントエンドのコード変更なしに動作する

#### Scenario: ロールバックもエンドポイント差し替えのみ（Rollback by endpoint only）

- **GIVEN** フロントエンドが Workers 向けの `VITE_API_ENDPOINT` で稼働している
- **WHEN** `VITE_API_ENDPOINT` を Netlify 向けの値へ戻して再デプロイする
- **THEN** すべての機能が従来どおり動作する

### Requirement: クロスオリジン呼び出しの許可（Allow cross-origin calls）

システムは、フロントエンドのオリジン（GitHub Pages）からのクロスオリジン呼び出しを許可しなければならない (SHALL)。すべてのルートで `OPTIONS` プリフライトに応答し (SHALL)、`Authorization` および `Content-Type` ヘッダの送信を許可しなければならない (SHALL)。この許可はアプリケーション（Worker）自身が返さなければならず (SHALL)、ホスティング基盤側の設定（`netlify.toml` の `[[headers]]` 相当）に依存してはならない (SHALL NOT)。

#### Scenario: 別オリジンから Bearer 付きで投稿 API を呼ぶ（Cross-origin call with Authorization header）

- **GIVEN** フロントエンドがバックエンドとは別のオリジンで稼働している
- **WHEN** ブラウザが `Authorization: Bearer <session_id>` と `Content-Type: application/json` を伴う投稿 API を呼び出す
- **THEN** `OPTIONS` プリフライトが成功し、本リクエストがブラウザにブロックされずに実行される

### Requirement: 既存データの無移行継続（Existing data continues without migration）

システムは、移行の前後で D1 のスキーマおよび暗号形式（AES-256-CBC、レコードごとのランダム IV、`ivHex:cipherHex` 形式）を変更してはならない (SHALL NOT)。移行前に発行されたセッション ID と保管トークンは、移行後もデータ移行なしでそのまま有効でなければならない (SHALL)。移行がユーザーに SNS への再接続を要求してはならない (SHALL NOT)。

#### Scenario: 移行前のセッションで投稿できる（Post with pre-migration session）

- **GIVEN** 移行前に接続した SNS の暗号化トークンが D1 に保管されている
- **WHEN** 移行後のバックエンドに対して同じセッション ID で投稿を要求する
- **THEN** バックエンドは既存の暗号化トークンを復号して投稿を実行する
- **AND** ユーザーの再接続操作は発生しない

### Requirement: 画像投稿が壁時計制限で失敗しない（Image posting not bound by wall-clock limit）

システムは、投稿先の SNS によらず 1 投稿あたり 10 枚（`threads-posting` capability が定める Threads のカルーセル上限。本要件が実行時間を保証する枚数の基準値であり、UI 側の添付枚数制限を意味しない）までの画像付き投稿を、実行基盤の壁時計時間の上限を理由に失敗させてはならない (SHALL NOT)。実行時間の制約が CPU 時間ベースである基盤を採用し、画像の取得・転送などの I/O 待ちが実行時間制限を消費しない構成としなければならない (SHALL)。

#### Scenario: 画像 3 枚の投稿が完了する（Three-image post completes）

- **GIVEN** ユーザーが画像 3 枚を添付して Misskey への投稿を実行する
- **WHEN** バックエンドが画像を取得・アップロードしてノートを作成する
- **THEN** 実行時間の上限によるタイムアウトは発生せず、投稿が完了する

#### Scenario: 上限枚数のカルーセル投稿が完了する（Post at the maximum image count completes）

- **GIVEN** ユーザーが画像 10 枚（Threads のカルーセル上限）を添付して Threads への投稿を実行する
- **WHEN** バックエンドが子コンテナ作成・親コンテナ作成・公開を行う
- **THEN** 実行基盤の実行時間の上限によるタイムアウトは発生せず、投稿が完了する

### Requirement: Cloudflare リソースへのバインディングアクセス（Access Cloudflare resources via bindings）

システムは、D1 への読み書きを Workers のバインディング経由で行わなければならない (SHALL)。アカウント全体に権限が及ぶ Cloudflare API トークン（`CF_API_TOKEN` 相当）をバックエンドのランタイム設定として保持してはならない (SHALL NOT)。R2 への事前署名 URL 発行に用いる認証情報は、対象バケットにスコープされた S3 互換クレデンシャルに限らなければならない (SHALL)。

#### Scenario: アカウント API トークンなしで動作する（Operates without account-wide API token）

- **GIVEN** Workers の設定に D1 バインディングと、対象バケットにスコープされた R2 用 S3 互換クレデンシャルのみが構成されている
- **WHEN** トークンの保管・復号・削除および画像の事前署名 URL 発行を実行する
- **THEN** すべての操作がアカウント全体に効く API トークンなしで完了する

### Requirement: TypeScript による実装（Implemented in TypeScript）

システムは、バックエンド（`backend/worker/`）の実装を TypeScript で行い、`.ts` ファイルで構成しなければならない (SHALL)。ビルド設定（`tsconfig.json`）と依存（`typescript`）を用意し、静的型チェック（`tsc --noEmit`）がエラーなしで通る状態を保たなければならない (SHALL)。ルート・lib・共通処理のすべてを型付きで実装しなければならない (SHALL)。

#### Scenario: 静的型チェックが通る（Type check passes）

- **GIVEN** バックエンドが TypeScript で実装されている
- **WHEN** `tsc --noEmit` を実行する
- **THEN** 型エラーなしで完了する

#### Scenario: デプロイが TypeScript からビルドされる（Deploy builds from TypeScript）

- **GIVEN** `backend/worker/` 配下が `.ts` ファイルで構成されている
- **WHEN** `wrangler deploy` を実行する
- **THEN** TypeScript がビルドされ、API が動作する
