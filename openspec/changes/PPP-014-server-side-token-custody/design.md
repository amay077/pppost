# Design: 投稿トークンのサーバー側保管（BFF 化）

## D1. なぜ Bearer セッション（案A）か

フロント=GitHub Pages / API=Netlify Functions の**クロスサイト**構成のため、HttpOnly Cookie は
サードパーティ Cookie 扱いでブラウザにブロックされる。現構成を維持したまま実装するには、セッション ID を
`Authorization: Bearer` ヘッダで送る方式が唯一素直。クライアントが保持するのは**失効可能な低価値のセッション ID のみ**で、
SNS の長命トークンは一切持たない。XSS はセッション有効中の投稿代行の余地は残るが、複数 SNS 資格情報の窃取・外部再利用は防げる。
（Cookie 化＝最堅牢は同一サイト化を伴う将来課題として Non-Goal）

## D2. なぜ Cloudflare D1 か / アクセス方式

- 採用理由: 将来の Netlify→Cloudflare 移行の布石、Netlify Blobs の無料枠が不透明、状態を CF（R2 と同居）に集約したい。
- アクセス: バックエンドは Netlify Functions のままなので、**D1 の HTTP API**（`POST /accounts/{account_id}/d1/database/{database_id}/query`）を
  fetch で叩く。CF API トークン・アカウント ID・DB ID は **Netlify 環境変数**に置く（クライアントには出さない）。
- **TTL 注意**: D1（SQLite）に KV のようなネイティブ TTL はない。期限は `expires_at`/`last_*_at` カラム + クエリ時の
  時刻比較でエミュレートし、掃除が要る場合は Cloudflare Cron Triggers で定期パージする。

## D3. セッションモデル（匿名・個人単一ユーザー）

- 最初の SNS 接続時にクライアントへ session_id が無ければ、backend が**高エントロピーな session_id を生成**（`crypto.randomBytes`）し、
  D1 に行を作成、session_id だけを返す。クライアントは `localStorage` の `ppp_session_id` に保存。
- 以降は全 API が `Authorization: Bearer <session_id>`。backend は D1 で該当行を引き、必要な SNS トークンを復号して使用。
- session_id は不透明なランダム値そのものが認可の鍵。個人単一ユーザー前提のため、ユーザー識別（ログイン）は設けない。
- **セッション失効の扱い**: 本変更ではセッションに TTL（有効期限による自動失効）を設けず、無期限運用とする。セッションが無効化されるのは、明示的な削除（全 SNS 切断によりレコードが不要化した場合や、D2 の Cron パージで孤立レコードを掃除する場合）のみである。したがって認可判定は「対応する保管レコードが存在するか否か」のみで行い、spec 上も「失効」ではなく「存在しない（削除済みを含む）」として扱う。期限ベースの失効を導入する場合は将来の別 proposal で `expires_at` 判定を要件化する。

## D4. 暗号化

- SNS トークンは既存 `PPPOST_DATA_SECRET` を鍵に **AES-256-CBC** で暗号化して D1 に保存。
- 既存パターンは固定 IV（`PPPOST_DATA_IV`）を全データで再利用しており弱いため、本変更では**レコードごとにランダム IV を生成**し、
  `iv:ciphertext`（ともに hex）の形で保存する。

## D5. OAuth / 接続フローの変更（重要）

- Threads: 認可後の redirect は従来どおりフロントに着地するが、フロントは `code` と（あれば）session_id を backend へ渡すだけ。
  backend が長命トークンへ交換し、**D1 に暗号化保存**、session_id と表示用メタ（`user_id` 等）のみ返す。トークンはフロントに返さない。
- Mastodon: `code` → backend でトークン交換 → D1 保存 → session_id/メタのみ返す。
- Bluesky: id/password → backend で `agent.login` → `agent.session` を D1 保存 → session_id と表示用（handle/did）を返す。
  `refreshSession` 等のセッション更新も backend が D1 を更新する形へ。

## D6. Threads リフレッシュとゴースト間隔のサーバー移管

- Threads 長命トークンの 24h 経過リフレッシュ判定は、従来フロントの `onMount` が `obtained_at` で行っていたが、
  **backend が D1 の `updated_at`/メタで判定**して実行する（クライアント起因の呼び出しを廃止、または「投稿時に必要なら更新」に集約）。
- PPP-013 のゴースト投稿状態（`last_posted_at`/`rotation_index`）を D1 `pr_ghost_state` に移し、`now - last_posted_at >= interval` を
  **サーバーで判定**して発火。localStorage 改変で間隔ゲートを回避できないようにする。

## D7. 移行

既存ユーザーの localStorage には平文トークンが残るが、新フローでは使わない。消費系は session_id 前提となるため、
**各 SNS の再接続**で D1 に入り直してもらう（後方互換は持たない）。フロントは旧 `ppp_setting_*` のトークン項目を破棄する。

## D8. 段階実装の指針

セッション基盤（D1 ユーティリティ・発行/検証）→ Threads → Mastodon → Bluesky → ゴースト間隔移管、の順で
1 SNS ずつ「発行側保存＋消費側参照」を揃える。中途半端に片側だけ変えるとトークン不整合で全断するため、SNS 単位で完結させる。
