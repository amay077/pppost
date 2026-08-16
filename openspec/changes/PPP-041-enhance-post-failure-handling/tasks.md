# Implementation Tasks

## 1. エラー情報の型定義と分類
- [x] 1.1 投稿失敗の原因を表す型（例: `PostError` / `PostResult`）を定義する（SNS 名・原因分類・エラーメッセージ）
- [x] 1.2 `postToBluesky` / `postToThreads` / `postToMisskey` の戻り値を `boolean` から原因情報を含む型へ変更し、HTTP ステータスコードとレスポンスボディから原因分類（`timeout` / `network` / `auth` / `server` / `rejected`）を判定する
- [x] 1.3 `postToSns` の戻り値を SNS ごとの原因一覧（`{ sns, errorType, message }`）へ拡張する

## 2. fetch タイムアウトの導入
- [x] 2.1 投稿 API（`bluesky_post` / `threads_post` / `misskey_post`）の `fetch` に AbortController + タイムアウト（30 秒想定）を導入し、`AbortError` を `timeout` として分類する
- [x] 2.2 R2 アップロード（`storage-client.ts` の署名付き URL 取得・PUT）にも同様のタイムアウトを導入する
- [x] 2.3 動画 finalize ポーリング（`finalizeBlueskyVideo` / `finalizeThreadsVideo` / `finalizeMisskeyVideo`）の最大試行回数到達を `timeout` として分類する

## 3. タイムアウト時のリトライ
- [x] 3.1 `timeout`（および `network`）分類の場合のみ、SNS ごとに 1 回だけ投稿をリトライする共通処理を実装する
- [x] 3.2 2 回目も失敗した場合は、最終的な原因をリトライ結果として返す（成功した場合は成功として扱う）
- [x] 3.3 動画 finalize ポーリングのタイムアウト時も、ポーリング全体を 1 回リトライする（リトライ時は既存の R2 動画 URL・ジョブ ID を再利用する）
- [x] 3.4 画像・動画の R2 アップロード失敗（全 SNS の中止）はリトライ対象としない（既存仕様のまま）

## 4. インラインエラー表示
- [x] 4.1 `MainContent.svelte` の `post()` から失敗時の `alert` を廃止し、投稿フォーム近くにエラー表示領域を追加する
- [x] 4.2 エラーは SNS 名 + 原因（例: `Bluesky: タイムアウトしました`）のリストとして表示し、成功時は従来どおり `alert("投稿しました。")` を維持する
- [x] 4.3 エラー表示は次回投稿開始時にクリアされる

## 5. バックエンドのエラーレスポンス整理（軽微）
- [x] 5.1 エラーボディが平文の投稿系関数を確認し、可能な範囲で JSON（`{ error: ... }`）に統一する

## 6. 検証
- [x] 6.1 `cd frontend && npm run check` で型チェックをパスさせる
- [ ] 6.2 手動テスト（`backend/test.http` の流れに準拠）で、失敗時の原因表示とタイムアウトリトライの動作を確認する
