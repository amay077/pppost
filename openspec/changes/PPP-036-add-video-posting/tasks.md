# Implementation Tasks

## 1. R2 の動画アップロード対応（バックエンド）

- [x] 1.1 `r2_presigned_url.js` の Content-Type 決定を拡張子から一般化し、`video/mp4` などの動画 MIME を解決できるようにする（`image/{ext}` 固定を廃止）
- [x] 1.2 動画は `pppost/video/` プレフィックス配下のオブジェクトとして保存する（画像は従来どおり `pppost/`）
- [x] 1.3 `node --check backend/netlify/functions/r2_presigned_url.js` が通ることを確認する

## 2. フロントエンドの動画選択 UI

- [x] 2.1 動画選択ボタン（`accept="video/*"`）を追加し、動画 1 本を選択できるようにする
- [x] 2.2 選択した動画を `<video>` 要素でプレビュー表示する
- [x] 2.3 動画と画像の排他制御を実装する（動画ありで画像追加不可・画像ありで動画追加不可）
- [x] 2.4 動画の削除（取り除き）操作を実装する
- [x] 2.5 動画は base64 化せず File オブジェクトを保持する

## 3. 動画の許容上限チェック

- [x] 3.1 100MB 超の動画を選択時に拒否しエラー通知する
- [x] 3.2 動画の再生時間（メタデータ）を読み取り、3 分（180 秒）超を拒否してエラー通知する
- [x] 3.3 再生時間を取得できない動画は拒否してエラー通知する

## 4. 動画のアップロードと投稿フロー（フロントエンド）

- [x] 4.1 `storage-client.ts` を動画対応にし、動画は File/Blob を署名付き URL へ直接 PUT できるようにする（画像の既存 base64 フローは変更しない）
- [x] 4.2 `MainContent.ts` の `postToSns` に動画 URL の受け渡しを追加する（各 SNS の POST ボディへ `video` を追加）
- [x] 4.3 動画添付時は投稿本文クリア（`clearPostContent`）で動画もクリアされることを確認する
- [x] 4.4 動画添付時はリプライ元・引用元の選択を解除し、以後選択できないようにする（排他制御）
- [x] 4.5 投稿ボタンの無効化条件は従来どおり（本文必須）。共有ボタンの無効化条件に動画を反映する（本文・画像・動画すべて空のときのみ無効）
- [x] 4.6 共有（Web Share）で動画を共有できるようにする（`canShare` チェック、非対応時はテキストのみへフォールバック）
- [x] 4.7 R2 の動画アップロード失敗時は各 SNS への投稿を試行せず、共通エラーとして通知する

## 5. Threads の動画投稿（バックエンド）

- [x] 5.1 `threads_post.js` に動画 1 本の `media_type=VIDEO` コンテナ作成（`video_url` = R2 公開 URL）を追加する
- [x] 5.2 動画コンテナが実行時間予算内に `FINISHED` にならない場合、失敗とせず `creation_id` を HTTP 202 で返す（非同期最終化の導入）
- [x] 5.3 `threads_video_finalize` 関数を追加し、コンテナの `FINISHED` 待ち・公開・4279009 時のコンテナ再作成リトライを行う
- [x] 5.4 動画と画像が同時に渡された場合は 400 を返して投稿を拒否する
- [x] 5.5 動画とリプライ元・引用元が同時に渡された場合は 400 を返して投稿を拒否する
- [x] 5.6 ゴースト投稿（`is_ghost_post=true`）時は動画を無視して `media_type=TEXT` のまま投稿することを確認する
- [x] 5.7 Threads 共通ロジック（コンテナ作成・FINISHED 待ち・公開・ゴースト）を `backend/netlify/lib/threads.js` に抽出する
- [x] 5.8 フロントが 202 受信時に `threads_video_finalize` をポーリングし、完了後に成功とする
- [x] 5.9 202 Accepted は `res.ok === true` になるため、フロントのステータス判定は 202 を先に確認する（本番で 202 を成功扱いするバグを修正）

## 6. Bluesky の動画投稿（バックエンド）

- [x] 6.1 `@atproto/api` を動画 lexicon 対応版へアップグレードする（backend/package.json）
- [x] 6.2 動画アップロード（`app.bsky.video.uploadVideo`）→ 処理完了待ち（`getJobStatus` ポーリング）→ `app.bsky.embed.video` での投稿を実装する
- [x] 6.3 動画エンドポイントは PDS ではなく動画サービス（`video.bsky.app`）に対して呼び出し、アップロードは `getServiceAuth` のサービス トークンを使用する（PDS への呼び出しは 501 になるため）
- [x] 6.4 動画処理が実行時間予算内に完了しない場合、失敗とせずジョブ ID を HTTP 202 で返す（非同期最終化の導入）
- [x] 6.5 `bluesky_video_finalize` 関数を追加し、ジョブの処理完了待ち・`app.bsky.embed.video` での投稿を行う
- [x] 6.6 ジョブ失敗（`JOB_STATE_FAILED`）時は投稿せず失敗を返す
- [x] 6.7 ポーリングをバックエンドの実行時間制約内に収める（有限の試行回数・打ち切り）
- [x] 6.8 Bluesky の再生時間制限を公式情報で確認する（結果: 3 分。アプリ全体の上限を 3 分に設定）
- [x] 6.9 動画投稿時は OGP 埋め込みをスキップすることを確認する
- [x] 6.10 `app.bsky.embed.video` の alt テキストを自動生成（例: `Video`）する
- [x] 6.11 フロントが 202 受信時に `bluesky_video_finalize` をポーリングし、完了後に成功とする

## 7. Misskey の動画投稿（バックエンド）

- [x] 7.1 動画投稿を `drive/files/upload-from-url`（非同期取り込み）に変更し、取り込み依頼後は `video_url` を HTTP 202 で返す（`drive/files/create` の直接アップロードは 30 秒タイムアウトのため）
- [x] 7.2 `misskey_video_finalize` 関数を追加し、`drive/files`（`type: 'video/*'`・作成日時降順）から URL 由来のファイル名で対象を特定して `notes/create` でノートを作成する
- [x] 7.3 取り込み完了前は 202 を返し、クライアントがポーリングする（`drive/files/upload-from-url` は同一ハッシュの既存ファイルを再利用するため `force: true` で新規登録させる）
- [x] 7.4 動画の取り込み・ノート作成失敗時はノートを作成せず失敗を返すことを確認する
- [x] 7.5 フロントが 202 受信時に `misskey_video_finalize` をポーリングし、完了後に成功とする

## 8. 動作検証

- [x] 8.1 `npm run check`（フロントの型チェック）が通る
- [x] 8.2 バックエンド関数の構文チェック（`node --check`）が通る
- [ ] 8.3 ローカル環境で動画付き投稿の手動テストを実施する（各 SNS で動画が投稿されること、画像投稿が従来どおり動作すること）
- [ ] 8.4 100MB 超・3 分超の動画が事前チェックで拒否されることを確認する
- [ ] 8.5 共有シートから動画が共有できることを確認する（モバイル端末）

## 9. OpenSpec 検証とアーカイブ

- [x] 9.1 `openspec validate PPP-036-add-video-posting --strict` が通る
- [ ] 9.2 デプロイ後、archive 時に `openspec/specs/video-posting/spec.md` が新規作成され、`openspec/specs/sns-posting/spec.md` に併用禁止要件・`openspec/specs/web-share/spec.md` に無効化条件の変更が反映されていることを確認する
