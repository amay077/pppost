# SPA バージョン更新の検知と更新ボタンの追加

## Why

version 表示（`MainContent.svelte:623-631`、version ボタン押下で表示）は現在 `spa_build` / `api_build` / `api_ver` を表示している。SPA をデプロイしても、ブラウザで開きっぱなしのユーザーには更新がただちに反映されない。一度ブラウザを離脱し、再度訪問すると更新される（GitHub Pages の index.html キャッシュと読み込み済み JS のため）。

開いているブラウザに新バージョンの存在を伝え、ワンクリックで最新版へ更新できるようにする。

## What Changes

### バージョン差分の検知

- ビルド時に生成済みの `frontend/public/version.json`（`frontend/script/replace.cjs` が生成、`built_at` 入り、`dist/` 経由で GitHub Pages に配置済み）を SPA リソースとして利用する
- version 表示を開いたとき、`version.json?v=<現在日時>` をキャッシュバスター付きで fetch し、サーバ側の `built_at` と現在の SPA の `built_at`（`window.built_at`。`index.mustache` で注入）を比較する
- `version.json` は現在の index.html と同一ディレクトリの相対パスで取得する（`vite base: "./"` により、デプロイ先パス（`/pppost/` 等）に依存しない）
- ISO 8601 文字列の比較は両者が同一生成源（`replace.cjs` の同一 `built_at`）のため、文字列比較で判定可能

### UI

- `spa_build` 行に、新バージョンが存在する場合のみ「更新」ボタンを表示する
- ボタン押下で `location.href = location.pathname + '?v=' + Date.now()` によりキャッシュキーを変えて再読込する
  - `location.reload()` は GitHub Pages の index.html キャッシュに当たり更新されないため不可

### 対象外（Non-Goals）

- PWA サービスワーカーによる更新検知（vite-plugin-pwa は導入済みだが SW 未登録のため、本変更では使用しない）
- バックグラウンドでの定期ポーリング（チェックは version 表示時のみ）
- 更新後の URL に残る `?v=` クエリの除去（`history.replaceState` による整形）は行わない

## Impact

- **Affected specs**: version-display（新規 capability）
- **Affected code**:
  - 追加・変更: `frontend/src/lib/MainContent.ts`（`getSpaVersion()` 追加）、`frontend/src/lib/MainContent.svelte`（更新判定・ボタン表示・更新処理）
  - 変更なし: `frontend/public/version.json` / `version.mustache` / `script/replace.cjs`（既存のビルド成果物を利用）
- **Breaking changes**: なし
- **関連 Issue**: [#31](https://github.com/amay077/pppost/issues/31)
