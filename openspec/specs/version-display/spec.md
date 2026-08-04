# version-display Specification

## Purpose
SPA のバージョン表示と、新バージョンがデプロイされた際の更新検知・更新操作の仕様。version 表示を開いたときにサーバ側の `version.json` と現在の SPA の `built_at` を比較し、新しい場合のみ「更新」ボタンを表示する。
## Requirements
### Requirement: SPA 更新の検知

version 表示を開いたとき、システムはキャッシュバスター付きクエリ（`?v=<現在日時>`）を付加した `version.json` を取得し、サーバ側の `built_at` と現在読み込まれている SPA の `built_at`（`window.built_at`）を比較しなければならない (SHALL)。サーバ側が新しい場合のみ、更新が利用可能であると判定しなければならない (SHALL)。現在の SPA の `built_at` が取得できない（空文字等）場合、システムは更新が利用可能であると判定してはならない (SHALL)。

#### Scenario: 新バージョンが存在する場合

- **GIVEN** サーバ側の `version.json` の `built_at` が現在の SPA の `built_at` より新しい
- **WHEN** version 表示を開く
- **THEN** `spa_build` 行に「更新」ボタンが表示される

#### Scenario: バージョンが最新または古い場合

- **GIVEN** サーバ側の `built_at` が現在の SPA の `built_at` と同じか古い
- **WHEN** version 表示を開く
- **THEN** 「更新」ボタンは表示されない

#### Scenario: 取得失敗時のフォールバック

- **GIVEN** `version.json` の取得が失敗する
- **WHEN** version 表示を開く
- **THEN** エラーを発生させず、「更新」ボタンを表示しない

### Requirement: SPA の更新

システムは、「更新」ボタンが押下されたとき、キャッシュを回避して最新の SPA を再読み込みしなければならない (SHALL)。

#### Scenario: 更新ボタン押下

- **GIVEN** 「更新」ボタンが表示されている
- **WHEN** ユーザーがボタンを押下する
- **THEN** サービスワーカーが最新の precache を取り込んでアクティブ化し、キャッシュに当たらず最新の index.html とアセットが読み込まれる

## Related Changes

- [2026-08-04-PPP-031-add-spa-version-update](../../changes/archive/2026-08-04-PPP-031-add-spa-version-update/proposal.md)

