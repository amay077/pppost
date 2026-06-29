# Design: Threads PR ゴースト投稿（準定期）

## D1. PR を「リプライ」ではなく「直後の独立投稿」にする理由

ユーザーの当初の要望は「本投稿に続けて PR を出す」だが、Threads API のゴースト投稿は **リプライにできない**（テキストのみ・リプライ不可）。よって PR をゴースト投稿として実現するには、本投稿とは別の独立した投稿として直後に出す方式（タイムライン上で連続して見える）が唯一の選択肢となる。ユーザーにこの制約を提示し、「直後に独立ゴースト投稿」で合意済み。

## D2. 必要スコープの検証方針

PPP-012 のリプライ投稿では `threads_manage_replies` の追加が必要だった（`code: 10` 権限エラー）。ゴースト投稿は通常の publish フロー（コンテナ作成 → 公開）を用いるため、既存の `threads_content_publish` で足りる見込みだが確証はない。

→ apply 時に実機でゴースト投稿を試行し、権限エラーが出る場合のみ必要スコープを特定して `ThreadsConnection.svelte` の `scope` に追加する（PPP-012 の task 5.1 と同じ進め方）。tasks.md に検証タスクを置く。

## D3. 間隔判定とローテーションの状態管理

状態はバックエンド DB を持たないため `localStorage` に保持する（既存方針と一致）。

- `ppp_pr_ghost_setting`: `{ enabled, intervalHours(既定 48), texts: string[] }` — ユーザー設定
- `ppp_pr_ghost_state`: `{ lastPostedAt(ms, 未投稿は 0), rotationIndex }` — 実行状態

判定: `Date.now() - lastPostedAt >= intervalHours * 3600_000`（未投稿=0 は常に真）。
ローテーション: `texts[rotationIndex % texts.length]` を選び、成功時に `rotationIndex + 1` と `lastPostedAt = Date.now()` を保存する。失敗時は状態を更新しない（次回の本投稿で再試行される）。

複数端末/ブラウザ間で `localStorage` は共有されないため、端末ごとに独立して間隔判定される点は許容する（個人運用ツールのため）。

## D4. PR 投稿失敗を本投稿の成否に影響させない

PR ゴースト投稿は本投稿成功後の付加機能である。PR 投稿が失敗しても、ユーザーの本投稿自体は成立しているため、`postToSns` が返す `errors` には PR の失敗を **含めない**（`console` ログのみ）。これにより「本投稿は成功したのに PR 失敗で投稿失敗の通知が出る」という誤解を避ける。状態（`lastPostedAt`）も成功時のみ更新するため、失敗時は次回の本投稿で自然に再試行される。

## D5. 発火タイミングの実装位置

`postToSns()` の本投稿ループ完了後、`errors` に `Threads` が含まれない（Threads 本投稿が成功）かつ `enableTypes` に `threads` が含まれる場合にのみ PR 判定を行う。PR ゴースト投稿は 2 回目の `threads_post` 呼び出しとして実行され、本投稿とは独立にコンテナ完了待機・公開を行う（バックエンドの 10 秒タイムアウトは各リクエストに個別適用されるため問題なし）。

注意: 既存の `postToSns()` は画像削除などの後処理を `errors.length == 0`（**全 SNS** 成功）で判定しているが、PR 発火条件はこれとは異なり **Threads 単体の成功**（`errors` に `Threads` を含まない）で判定する。他 SNS が失敗していても Threads 本投稿が成功していれば PR は付与する。実装時にこの 2 つの判定基準を混同しないこと（Minor Issue 1）。
