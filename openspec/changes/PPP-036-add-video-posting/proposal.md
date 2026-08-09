# 動画の投稿に対応する

## Why

現状はテキスト・画像のみの投稿に対応している。Bluesky・Threads・Misskey の 3 SNS への動画投稿を可能にする。動画対応により、ユーザーは撮影した動画や共有動画を各 SNS に一度の操作で投稿できるようになる。

各 SNS の動画投稿 API は以下の通りである。

- **Bluesky**: `app.bsky.video.uploadVideo` でアップロードし、`app.bsky.video.getJobStatus` で処理完了を待ってから `app.bsky.embed.video` で埋め込む。video/mp4 のみ・100MB 上限・日次アップロード数/バイト上限あり（`app.bsky.video.getUploadLimits`）。画像と動画の同時埋め込みは不可
- **Threads**: `media_type=VIDEO` + `video_url`（公開 URL 必須）でメディアコンテナを作成し、FINISHED 待ちの後に公開する。MP4/MOV・5 分（300 秒）・1GB 上限。R2 公開 URL をそのまま渡せるため、バックエンドでの再アップロードが不要
- **Misskey**: `drive/files/create` に動画をそのままアップロードし、`fileIds` でノートに添付する。上限はサーバー設定依存

## What Changes

- **フロントエンド**: 動画の選択 UI（`accept="video/*"`）と `<video>` プレビューを追加する。動画を添付した場合は画像を添付できなくする（画像と動画の併用は不可）。許容上限（100MB・5 分以内）をフロントで事前チェックする。動画は base64 化せず File/Blob のまま R2 の署名付き URL へ直接 PUT する
- **R2**: `r2_presigned_url` の Content-Type 解決を拡張子から一般化し、動画（`video/mp4` 等）に対応させる。動画は `pppost/video/` プレフィックスのオブジェクトとして保存し、削除は画像と同様にバケットのライフサイクルルールに依存する
- **Threads**: 動画 1 本を `media_type=VIDEO` + `video_url`（R2 公開 URL）で投稿する。既存のコンテナ FINISHED 待ち・公開リトライ（4279009）のフローを流用する
- **Bluesky**: `@atproto/api` を動画 lexicon 対応版へアップグレードし、`app.bsky.video.uploadVideo` → `getJobStatus` ポーリング → `app.bsky.embed.video` の順で投稿する
- **Misskey**: 既存の `drive/files/create` アップロード処理を拡張し、動画ファイルを drive へアップロードして `fileIds` に含める
- **共有（Web Share）**: 共有シートから動画付きで共有できるようにする（`canShare` チェック・非対応環境ではテキストのみへフォールバック）
- 動画投稿の失敗時は、画像投稿と同様にエラー一覧へ SNS 名を追加してユーザーへ通知する

## Non-Goals

- 画像と動画の混在投稿（動画を添付した場合は動画のみ）
- 動画のトランスコード・リサイズ・サムネイル生成（ユーザーが用意したファイルをそのまま投稿する）
- Threads カルーセルへの動画混在（カルーセルは画像のみの現行仕様を維持）
- Bluesky の再生時間制限が 3 分の場合の自動変換（実装時に公式情報で確認し、必要なら Bluesky のみの別制限を検討）
- 自投稿一覧（リプライ元選択）での動画の表示・再生

## Impact

- **Affected specs**: `video-posting`（新規）、`sns-posting`（動画と画像の併用禁止を追加）
- **Affected code**:
  - `frontend/src/lib/MainContent.ts` / `MainContent.svelte` / `ImagePreview.svelte`（動画選択・プレビュー・投稿フロー）
  - `frontend/src/lib/storage-client.ts`（Blob 直接 PUT）
  - `backend/netlify/functions/r2_presigned_url.js`（Content-Type 一般化）
  - `backend/netlify/functions/threads_post.js`（VIDEO コンテナ）
  - `backend/netlify/functions/bluesky_post.js`（動画アップロード・埋め込み、SDK アップグレード）
  - `backend/netlify/functions/misskey_post.js`（drive への動画アップロード）
  - `backend/package.json`（`@atproto/api` アップグレード）
- **Breaking changes**: なし（画像・テキスト投稿のフローは変更しない）
- **関連 Issue**: [#36](https://github.com/amay077/pppost/issues/36)
