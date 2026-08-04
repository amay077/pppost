# Implementation Tasks

## 1. 実装

- [ ] 1.1 `frontend/src/lib/MainContent.ts` に `getSpaVersion()` を追加する（`version.json?v=${Date.now()}` を fetch し `{ built_at }` を返す。取得失敗時は null を返す）
- [ ] 1.2 `frontend/src/lib/MainContent.svelte` に `spaUpdateAvailable` 状態を追加し、`onVersion()` 内で `getSpaVersion()` の結果と `window.built_at` を比較して設定する
- [ ] 1.3 `MainContent.svelte` の `spa_build` 行に、`spaUpdateAvailable` の場合のみ「更新」ボタンを表示する
- [ ] 1.4 「更新」ボタン押下で `location.href = location.pathname + '?v=' + Date.now()` を実行する

## 2. 検証

- [ ] 2.1 `npm run check`（frontend）が成功する
- [ ] 2.2 `npm run build-prod`（frontend）が成功し、`dist/version.json` と `dist/index.html` の `built_at` が一致する
- [ ] 2.3 デプロイ後に、新バージョン存在時に「更新」ボタンが表示され、押下で更新されることを手動確認する
