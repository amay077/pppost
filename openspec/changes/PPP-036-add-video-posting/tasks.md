# Implementation Tasks

## 1. R2 の動画アップロード対応（バックエンド）

- [ ] 1.1 `r2_presigned_url.js` の Content-Type 決定を拡張子から一般化し、`video/mp4` などの動画 MIME を解決できるようにする（`image/{ext}` 固定を廃止）
- [ ] 1.2 動画は `pppost/video/` プレフィックス配下のオブジェクトとして保存する（画像は従来どおり `pppost/`）
- [ ] 1.3 `node --check backend/netlify/functions/r2_presigned_url.js` が通ることを確認する

## 2. フロントエンドの動画選択 UI

- [ ] 2.1 動画選択ボタン（`accept="video/*"`）を追加し、動画 1 本を選択できるようにする
- [ ] 2.2 選択した動画を `<video>` 要素でプレビュー表示する
- [ ] 2.3 動画と画像の排他制御を実装する（動画ありで画像追加不可・画像ありで動画追加不可）
- [ ] 2.4 動画の削除（取り除き）操作を実装する
- [ ] 2.5 動画は base64 化せず File オブジェクトを保持する

## 3. 動画の許容上限チェック

- [ ] 3.1 100MB 超の動画を選択時に拒否しエラー通知する
- [ ] 3.2 動画の再生時間（メタデータ）を読み取り、5 分（300 秒）超を拒否してエラー通知する
- [ ] 3.3 再生時間を取得できない動画は拒否してエラー通知する

## 4. 動画のアップロードと投稿フロー（フロントエンド）

- [ ] 4.1 `storage-client.ts` を動画対応にし、File/Blob を署名付き URL へ直接 PUT できるようにする（base64 経由の廃止）
- [ ] 4.2 `MainContent.ts` の `postToSns` に動画 URL の受け渡しを追加する（各 SNS の POST ボディへ `video` を追加）
- [ ] 4.3 動画添付時は投稿本文クリア（`clearPostContent`）で動画もクリアされることを確認する
- [ ] 4.4 共有（Web Share）で動画を共有できるようにする（`canShare` チェック、非対応時はテキストのみへフォールバック）

## 5. Threads の動画投稿（バックエンド）

- [ ] 5.1 `threads_post.js` に動画 1 本の `media_type=VIDEO` コンテナ作成（`video_url` = R2 公開 URL）を追加する
- [ ] 5.2 既存のコンテナ FINISHED 待ち・公開リトライ（4279009）のフローを動画にも適用する
- [ ] 5.3 動画と画像が同時に渡された場合は画像を無視して動画のみを投稿する（または 400 を返す）ことを確認する

## 6. Bluesky の動画投稿（バックエンド）

- [ ] 6.1 `@atproto/api` を動画 lexicon 対応版へアップグレードする（backend/package.json）
- [ ] 6.2 `bluesky_post.js` に動画アップロード（`app.bsky.video.uploadVideo`）→ 処理完了待ち（`getJobStatus` ポーリング）→ `app.bsky.embed.video` での投稿を実装する
- [ ] 6.3 ジョブ失敗（`JOB_STATE_FAILED`）時は投稿せず失敗を返す
- [ ] 6.4 ポーリングをバックエンドの実行時間制約内に収める（有限の試行回数・打ち切り）
- [ ] 6.5 Bluesky の再生時間制限（約 3〜5 分、`getUploadLimits`・公式情報）を確認し、必要なら Bluesky のみの別制限をフロントに反映する
- [ ] 6.6 動画投稿時は OGP 埋め込みをスキップすることを確認する

## 7. Misskey の動画投稿（バックエンド）

- [ ] 7.1 `misskey_post.js` の drive アップロード処理を動画ファイル（`video/*`）にも対応させる
- [ ] 7.2 動画のアップロード失敗時はノートを作成せず失敗を返すことを確認する

## 8. 動作検証

- [ ] 8.1 `npm run check`（フロントの型チェック）が通る
- [ ] 8.2 バックエンド関数の構文チェック（`node --check`）が通る
- [ ] 8.3 ローカル環境で動画付き投稿の手動テストを実施する（各 SNS で動画が投稿されること、画像投稿が従来どおり動作すること）
- [ ] 8.4 100MB 超・5 分超の動画が事前チェックで拒否されることを確認する
- [ ] 8.5 共有シートから動画が共有できることを確認する（モバイル端末）

## 9. OpenSpec 検証とアーカイブ

- [ ] 9.1 `openspec validate PPP-036-add-video-posting --strict` が通る
- [ ] 9.2 デプロイ後、archive 時に `openspec/specs/video-posting/spec.md` が新規作成され、`openspec/specs/sns-posting/spec.md` に併用禁止要件が反映されていることを確認する
