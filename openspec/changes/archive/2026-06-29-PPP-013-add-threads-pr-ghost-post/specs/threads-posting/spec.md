# Threads Posting Specification

## Overview

Threads の PR ゴースト投稿対応。本デルタは、バックエンドの `is_ghost_post` 対応・PR ゴースト投稿設定の管理・本投稿成功後の PR 自動付与の各要件を新規追加（ADDED）する。

## ADDED Requirements

### Requirement: Threads ゴースト投稿のバックエンド対応（Backend support for ghost posts）

システムは、`threads_post` バックエンドが `is_ghost_post`（任意の真偽値）を受け取り、`true` の場合にコンテナ作成のパラメータへ `is_ghost_post=true` を付与して、24 時間で自動アーカイブされるゴースト投稿として公開できるようにしなければならない (SHALL)。

ゴースト投稿は Threads API の制約によりテキストのみであるため、`is_ghost_post=true` のとき、システムは添付画像を無視し `media_type=TEXT` のコンテナを作成しなければならない (SHALL)。`is_ghost_post` が未指定または `false` の場合、システムは従来の投稿フロー（テキスト・単画像・カルーセル）を変更してはならない (SHALL NOT)。

公開前のコンテナ処理完了待ち（`### Requirement: 公開前のコンテナ処理完了待ち`）は、ゴースト投稿にも同様に適用される。ゴースト投稿の公開に失敗した場合、システムは失敗を呼び出し元へ返さなければならない (SHALL)。

#### Scenario: ゴースト投稿としてテキストを公開する（Publish text as ghost post）

- **GIVEN** バックエンドが `is_ghost_post=true` とテキストを含むリクエストを受け取る
- **WHEN** Threads へ投稿する
- **THEN** `media_type=TEXT` のコンテナが `is_ghost_post=true` 付きで作成され、完了待機後に公開される
- **AND** 公開された投稿は 24 時間で自動アーカイブされるゴースト投稿となる

#### Scenario: ゴースト投稿時は画像を無視する（Images ignored for ghost post）

- **GIVEN** バックエンドが `is_ghost_post=true` と画像 URL を含むリクエストを受け取る
- **WHEN** Threads へ投稿する
- **THEN** 画像は付与されず、テキストのみのゴースト投稿として公開される

#### Scenario: 通常投稿は影響を受けない（Normal post unaffected）

- **GIVEN** バックエンドが `is_ghost_post` 未指定（または `false`）のリクエストを受け取る
- **WHEN** Threads へ投稿する
- **THEN** 従来のテキスト・単画像・カルーセル投稿フローがそのまま実行される

### Requirement: PR ゴースト投稿設定の管理（Manage PR ghost post settings）

システムは、ユーザーが PR ゴースト投稿の設定として「有効/無効」「付与間隔（時間、既定 48）」「PR 文の一覧」を編集し、`localStorage` キー `ppp_pr_ghost_setting` に保存できるようにしなければならない (SHALL)。あわせて、実行状態（前回 PR を出した時刻 `lastPostedAt` と次に使う PR 文の位置 `rotationIndex`）を `localStorage` キー `ppp_pr_ghost_state` に保持しなければならない (SHALL)。

PR ゴースト投稿の設定 UI は Threads に接続済みのときのみ表示し (SHALL)、未接続時は表示してはならない (SHALL NOT)。

各 PR 文はゴースト投稿の制約に従い 500 文字以内とし、システムは上限超過をユーザーに知らせなければならない (SHALL)。

#### Scenario: PR 設定を保存する（Save PR settings）

- **GIVEN** ユーザーが Threads に接続済みである
- **WHEN** PR ゴースト投稿を有効にし、間隔と PR 文を入力する
- **THEN** 設定が `ppp_pr_ghost_setting` に保存される

#### Scenario: 未接続時は設定 UI を表示しない（No settings UI when not connected）

- **GIVEN** ユーザーが Threads に接続していない
- **WHEN** Threads の設定欄を開く
- **THEN** PR ゴースト投稿の設定 UI は表示されない

### Requirement: PR ゴースト投稿の自動付与（Auto-append PR ghost post）

システムは、本投稿が成功し、かつ以下のすべてを満たすときに限り、PR 文を 1 つ選んでゴースト投稿として自動で追加投稿しなければならない (SHALL)。

- 投稿対象に Threads が含まれ、Threads への本投稿が成功している（エラー一覧に `Threads` を含まない）
- PR ゴースト投稿設定が有効（`enabled=true`）で、PR 文が 1 つ以上登録されている
- 前回 PR を出した時刻（`lastPostedAt`）から設定間隔（`intervalHours`）以上経過している（未投稿時は経過とみなす）

上記のいずれかを満たさない場合、システムは PR ゴースト投稿を行ってはならない (SHALL NOT)。とくに、Threads が投稿対象でない場合や Threads 本投稿が失敗した場合は PR を付与してはならない (SHALL NOT)。

PR 文は登録順に 1 つずつローテーションして選択しなければならない (SHALL)。PR ゴースト投稿が成功したときのみ、システムは `lastPostedAt` を現在時刻に、`rotationIndex` を次の位置に更新しなければならない (SHALL)。コンテナ作成失敗・完了待機のタイムアウト・公開失敗など、PR ゴースト投稿が成功に至らなかったすべての場合において、システムは `lastPostedAt` と `rotationIndex` を更新してはならない (SHALL NOT)。

PR ゴースト投稿の失敗は本投稿の成否へ影響させてはならず (SHALL NOT)、本投稿の成功通知やエラー一覧（`errors`）に PR の失敗を含めてはならない (SHALL NOT)。

#### Scenario: 間隔経過後に PR が付与される（PR appended after interval elapsed）

- **GIVEN** ユーザーが Threads を投稿対象に選択し、PR 設定が有効で PR 文が登録されている
- **AND** 前回 PR から設定間隔以上が経過している
- **WHEN** 本投稿が成功する
- **THEN** PR 文が 1 つ選ばれ、直後に独立したゴースト投稿として公開される
- **AND** `lastPostedAt` と `rotationIndex` が更新される

#### Scenario: 間隔内では PR が付与されない（No PR within interval）

- **GIVEN** PR 設定が有効だが、前回 PR から設定間隔が経過していない
- **WHEN** 本投稿が成功する
- **THEN** PR ゴースト投稿は行われない

#### Scenario: Threads が投稿対象でなければ付与しない（No PR when Threads not targeted）

- **GIVEN** PR 設定が有効で間隔も経過しているが、投稿対象に Threads が含まれていない
- **WHEN** 本投稿が成功する
- **THEN** PR ゴースト投稿は行われない

#### Scenario: Threads 本投稿が失敗したら付与しない（No PR when Threads post failed）

- **GIVEN** PR 設定が有効で間隔も経過しているが、Threads への本投稿が失敗する状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** PR ゴースト投稿は行われず、`lastPostedAt` も更新されない

#### Scenario: PR 文がローテーションする（PR texts rotate）

- **GIVEN** PR 文が複数登録されている
- **WHEN** 間隔を空けて本投稿が複数回成功する
- **THEN** 登録順に 1 つずつ異なる PR 文がゴースト投稿される

#### Scenario: PR 投稿失敗は本投稿に影響しない（PR failure does not affect main post）

- **GIVEN** 本投稿は成功したが、PR ゴースト投稿が失敗する状態である
- **WHEN** 投稿処理が完了する
- **THEN** 本投稿は成功として通知され、エラー一覧に PR の失敗は含まれない
- **AND** `lastPostedAt` は更新されず、次回の本投稿で再試行される
