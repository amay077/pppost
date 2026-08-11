# ページ読み込み時の全 UI ブロック解消（Issue #40）

## Why

ページ読み込み時に画面全体が `loading..` 表示で覆われ、操作できるようになるまでに時間がかかる。`onMount` 内で Threads セッションリフレッシュ（毎回実行・24 時間以内は no-op）と、共有 URL 起動時のタイトル取得が同期的に await されるため、ネットワーク往復分だけフォームの描画が遅延する。

## What Changes

- 全 UI を覆っていた `loading` ゲートを撤去し、フォーム・ボタン群を即時描画する
- disable の根拠（待ち対象の処理）ごとに独立した 2 つのフラグを導入する:
  - `isProcessingText`: Swarm スクレイピング / YouTube タイトル取得 / 汎用タイトル取得の実行中（テキスト上書きリスク区間）を示す
  - `isRefreshingSession`: Threads OAuth コールバック交換 + `threads_refresh` の実行中を示す
- テキスト処理中は textarea・Clear・Post を disable し、Message ラベル横にスピナーを表示する
- セッションリフレッシュ中は Post のみ disable する
- Post はテキスト補完とセッションリフレッシュの両方が完了するまで disable とする（タイトル補完前の生 URL 投稿を防ぐ）

## Impact

- **Affected specs**: `posting-ui`（新規 capability）
- **Affected code**: `frontend/src/lib/MainContent.svelte`（フロントエンドのみ。`loading` フラグの撤去、`isProcessingText` / `isRefreshingSession` の導入、disabled 条件の変更、スピナー表示の追加）
- **Breaking changes**: なし

## References

- [Issue #40](https://github.com/amay077/pppost/issues/40)
