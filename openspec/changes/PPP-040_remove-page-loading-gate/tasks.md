# Implementation Tasks

## 1. フラグの導入（MainContent.svelte）

- [x] 1.1 全 UI ゲート用の `loading` を撤去し、`isProcessingText`（テキスト処理中）と `isRefreshingSession`（セッション処理中）を導入する
- [x] 1.2 `scrapeSwarmCheckin` / `fetchTitleForUrl` / `fetchYouTubeTitle` 内の `loading` の true/false 切り替えを `isProcessingText` に置き換える

## 2. 全 UI ゲートの撤去

- [x] 2.1 `{#if loading} loading.. {:else}` による全 UI ゲートを削除し、フォーム・ボタン群を常時描画する

## 3. disabled 条件の変更

- [x] 3.1 textarea の disabled 条件に `isProcessingText` を追加する（`isProcessingText || posting`）
- [x] 3.2 Clear ボタンの disabled 条件に `isProcessingText` を追加する
- [x] 3.3 Post ボタンの disabled 条件に `isProcessingText || isRefreshingSession` を追加する

## 4. onMount 内のフラグ操作

- [x] 4.1 Threads OAuth コールバック交換 + `threads_refresh` の処理を `isRefreshingSession = true/false` で囲む（await は維持）
- [x] 4.2 セッション処理とテキスト処理を分離し、`isRefreshingSession` がテキスト処理の完了を待たずに解放されることを確認する
- [x] 4.3 onMount にエラーハンドリング（catch + console.error）を追加する

## 5. インジケータ表示

- [x] 5.1 Message ラベル横に、`isProcessingText` 中のみ表示されるスピナーを追加する

## 6. 検証

- [x] 6.1 `npm run check`（svelte-check）で新規エラーがないことを確認する（既存エラー 3 件は変更前から存在）
- [x] 6.2 `npm run build` が成功する
- [ ] 6.3 実機で以下を確認する: 通常アクセス時の即時描画 / Threads 接続時の Post ボタンの遅延有効化 / `?url=` 共有時のスピナー表示とタイトル補完後の textarea・Clear・Post の解放
