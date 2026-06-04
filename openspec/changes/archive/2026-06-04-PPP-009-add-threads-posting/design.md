# Design: Threads 投稿機能（MVP）

## Context

Threads は Mastodon・Bluesky と同型のレイヤ構成（型定義 → 永続化 → 接続 UI → ランタイム状態 → 投稿関数 + switch 分岐 → チェックボックス/アイコン → バックエンド Function）で追加できる。一方で Threads Graph API の OAuth フローと投稿フローには既存 SNS と異なる点があり、以下の設計判断を記録する。

## Threads Graph API（確認済み仕様）

- 認可: `GET https://threads.net/oauth/authorize`
  - `client_id`, `redirect_uri`（完全一致が必須）, `response_type=code`, `scope=threads_basic,threads_content_publish`
- 短命トークン: `POST https://graph.threads.net/oauth/access_token`
  - `client_id`, `client_secret`, `grant_type=authorization_code`, `code`, `redirect_uri` → `{ access_token, user_id }`（約 1 時間）
- 長命トークン（60 日）: `GET https://graph.threads.net/access_token`
  - `grant_type=th_exchange_token`, `client_secret`, `access_token`（短命） → `{ access_token, token_type, expires_in }`
- テキスト投稿（2 段階）:
  1. コンテナ作成: `POST https://graph.threads.net/v1.0/{user-id}/threads`（`media_type=TEXT`, `text`, `access_token`）→ `{ id }`（= creation_id）
  2. 公開: `POST https://graph.threads.net/v1.0/{user-id}/threads_publish`（`creation_id`, `access_token`）→ `{ id }`
- 本文上限: 500 文字

## Decisions

### D1: リダイレクト方式で認可コードを受信する

Mastodon は OOB redirect（`urn:ietf:wg:oauth:2.0:oob`）でコードをユーザーに手動コピペさせているが、**Threads は OOB を許可しない**。登録済み HTTPS `redirect_uri` への遷移が必須。

- 接続ボタン押下で `window.location.href` により**同一タブ**で authorize ページへ遷移する（別タブだとコールバックを掴めない）
- 認可後にアプリへ戻った際、`MainContent.svelte` の `onMount` で URL クエリの `code`（および `state`）を受信する。これは廃除前の Twitter で使われていた onMount 受信パターンと同型
- 受信後は `history.replaceState` で URL から `code` を除去する

### D2: 長命トークン交換はバックエンドで実施する

`client_secret` をフロントエンドに置かない。`threads_token.js` が認可コードを受け取り、短命トークン取得 → 長命トークン交換までを行い、結果（`user_id`, 長命 `access_token`, `token_type`, `expires_in`）のみをフロントへ返す。フロントは長命トークンを `localStorage` キー `ppp_setting_threads` に保存する。

保存データには `obtained_at`（取得時刻）を含め、`expires_in` と合わせて期限判定が可能な構造にしておく（自動リフレッシュは本 MVP では実装しないが、後続で追加しやすくする）。

### D3: テキスト単体は即時 publish する

Threads はコンテナ作成後、公開まで約 30 秒の待機が推奨される場合があるが、テキスト単体のコンテナは概ね即時で公開可能。MVP ではコンテナ作成 → 即時 publish を試み、いずれかの段階が失敗した場合はバックエンドがエラーを返し、フロントは既存の `errors.push('Threads')` 経路でユーザーに通知する。

### D4: 専用文字数カウンタは追加しない

既存の文字数表示は twitter-text 基準（Twitter 由来）であり、Threads の 500 文字とは異なる。MVP では Threads 専用カウンタを追加せず、500 文字超過時は Threads API のエラー応答を受けて投稿失敗として通知する。専用カウンタは後続 proposal で検討する。

### D5: 画像アップロード処理は Threads に渡さない

`postToSns` 内の画像アップロード（Supabase 経由）処理は Mastodon・Bluesky 用にそのまま維持し、`postToThreads()` には画像を渡さない。Threads は本 MVP ではテキストのみを送信する。

## 型・状態の網羅性に関する注意

`SettingType` を全網羅する箇所（`MainContent.ts` の `postOfType` 初期化、`MainContent.svelte` の `replyToPost` / `postOfType` 初期化）に `threads: undefined` を追加しないと TypeScript の型エラーになる。MVP ではリプライ非対応のため値は常に `undefined` のままだが、型網羅のために初期化が必要。

一方、`postToSns` 内の `reply_to_ids` は固定形状の型（`SettingType` で網羅されない）であり、Threads のリプライは MVP 対象外のため `threads` を追加する必要はない。`SettingDataThreads` には既存の `SettingDataMastodon`/`SettingDataBluesky` に倣い `title: 'Threads'` リテラルフィールドを持たせる。
