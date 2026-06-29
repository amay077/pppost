# Implementation Tasks

## 1. バックエンド: ゴースト投稿対応（threads_post.js）

- [x] 1.1 `handler()` の body 分解に `is_ghost_post`（任意）を追加で受け取る
- [x] 1.2 `is_ghost_post === true` のとき、画像を無視して `media_type=TEXT` のコンテナを作成し、作成パラメータに `is_ghost_post: true` を付与する（TEXT/IMAGE/CAROUSEL 分岐の前でガードする）
- [x] 1.3 `is_ghost_post` 未指定・`false` 時は従来の投稿フローを一切変更しない
- [x] 1.4 完了待機（`waitForContainerReady`）・公開（`publishContainer`）は既存ロジックをそのまま流用する

## 2. フロントエンド: PR 設定・状態の保存（func.ts）

- [x] 2.1 `PrGhostSetting`（`enabled` / `intervalHours` / `texts: string[]`）と `PrGhostState`（`lastPostedAt` / `rotationIndex`）型を追加する
- [x] 2.2 `savePrGhostSetting` / `loadPrGhostSetting`（キー `ppp_pr_ghost_setting`）を追加する（未設定時 null）
- [x] 2.3 `savePrGhostState` / `loadPrGhostState`（キー `ppp_pr_ghost_state`）を追加する（未設定時 null）

## 3. フロントエンド: 投稿処理（MainContent.ts）

- [x] 3.1 `postToThreads(text, imageUrls, reply_to_id?, options?: { is_ghost_post?: boolean })` に `options` 引数を追加し、リクエスト body に `is_ghost_post` を含める
- [x] 3.2 `postToSns()` の本投稿ループ完了後に PR 付与ブロックを追加する: `enableTypes` に `threads` を含み、かつ `errors` に `Threads` を含まない（本投稿成功）ことを判定する
- [x] 3.3 `loadPrGhostSetting()` が `enabled === true` かつ `texts.length > 0`、かつ `Date.now() - state.lastPostedAt >= intervalHours * 3600_000`（state なしは 0 扱い）のときのみ PR を投稿する
- [x] 3.4 `texts[rotationIndex % texts.length]` を選び、`postToThreads(prText, [], undefined, { is_ghost_post: true })` を実行する
- [x] 3.5 PR 投稿が成功したときのみ `savePrGhostState({ lastPostedAt: Date.now(), rotationIndex: rotationIndex + 1 })` を保存する
- [x] 3.6 PR 投稿の失敗は `errors` に積まず `console` ログのみとする（本投稿の成否に影響させない）

## 4. フロントエンド: PR 設定 UI（ThreadsConnection.svelte）

- [x] 4.1 Threads 接続済み（`loadPostSetting('threads') != null`）のときのみ表示する PR 設定セクションを追加する
- [x] 4.2 有効/無効トグル・間隔（時間、既定 48）・PR 文リスト（複数）を編集できる UI を用意する
- [x] 4.3 変更時に `savePrGhostSetting()` で保存する
- [x] 4.4 各 PR 文の 500 文字制限を UI 上で示し、超過を警告する

## 5. スコープ検証（design.md D2）

- [ ] 5.1 実機でゴースト投稿を試行し、既存スコープ（`threads_basic,threads_content_publish,threads_manage_replies`）で成功するか確認する
- [ ] 5.2 権限エラーが出る場合のみ、必要スコープを特定して `ThreadsConnection.svelte` の `scope` に追加する

## 6. 動作検証

- [x] 6.1 `cd frontend && npm run build` が型エラーなく成功することを確認する
- [ ] 6.2 devtools で `ppp_pr_ghost_state.lastPostedAt` を 48 時間以上前にし、本投稿後に PR ゴースト投稿が付与されることを確認する
- [ ] 6.3 `lastPostedAt` を直近にし、本投稿しても PR が付与されないことを確認する
- [ ] 6.4 PR 文を複数登録し、間隔を空けた連続投稿で順番にローテーションすることを確認する
- [ ] 6.5 Threads を投稿対象から外した状態では PR が付与されないことを確認する
- [ ] 6.6 公開された PR が Threads 上で吹き出し表示（24 時間で消える）・テキストのみであることを確認する
- [ ] 6.7 PR 投稿が失敗しても本投稿の成功通知が出て、エラー一覧に PR の失敗が含まれないことを確認する
