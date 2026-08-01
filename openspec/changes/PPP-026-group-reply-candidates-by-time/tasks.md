# Implementation Tasks

## 1. グループ化ロジック（MainContent.ts）

- [x] 1.1 `groupByText` 内に時間窓の定数 `GROUP_WINDOW_MS`（`60 * 60 * 1000`）を定義する
- [x] 1.2 グループ保持構造を `{ [textKey: string]: { group: PresentedPost, times: number[] }[] }` に変更する（本文キーごとに、時刻の異なる複数グループを配列で持つ）
- [x] 1.3 各投稿について、本文キーが一致するグループのうち `times` のいずれかとの差が `GROUP_WINDOW_MS` 以内のものを探し、見つからなければ新しいグループを作る
- [x] 1.4 グループ生成部（`display_posted_at` / `trimmed_text` / `postOfType` の初期値）は現行の実装をそのまま流用する
- [x] 1.5 取り込んだ投稿の時刻を `times` に記録する
- [x] 1.6 既存の `latestPostedAt` ヘルパを削除し、ソートキーを `Math.max(...times)` に変更する
- [x] 1.7 全バケットを平坦化して降順ソートし、`PresentedPost[]` を返す
- [x] 1.8 `PresentedPost` 型（`MainContent.ts:17-23`）と `groupByText` の呼び出し側を変更していないことを確認する
- [x] 1.9 `compareLength` の算出（`MainContent.ts:153`）を変更していないことを確認する（Non-Goals）

## 2. 動作検証

- [x] 2.1 `cd frontend && npm run build` が成功する
- [x] 2.2 `cd frontend && npm run check` で新規の型エラーが出ない（既存の 3 件は対象外）
- [ ] 2.3 `cd backend && npm run dev` / `cd frontend && npm run dev` で起動し、Reply を展開する
- [ ] 2.4 `8/01 17:51` の Swarm チェックインが 8/01 の他の投稿と並ぶ位置（リスト先頭付近）に表示される
- [ ] 2.5 同じ場所への過去のチェックイン（7/26 以前の「ガーデンガーデン」）が別行として出現する
- [ ] 2.6 リスト全体が投稿日時の降順で並び、順序の飛びがない
- [ ] 2.7 同一内容を複数 SNS へ同時投稿したもの（`(bluesky, threads)`、`(bluesky, threads, misskey)` 等）が 1 行にまとまったままである（時間窓で意図せず分裂していないこと）
- [ ] 2.8 DevTools コンソールの `console.log(result)` で、各グループの `postOfType.*.posted_at` が `display_posted_at` と同じ投稿を指している
- [ ] 2.9 グループを選んでリプライ投稿し、意図した投稿への返信になる
- [x] 2.10 `npx openspec validate PPP-026-group-reply-candidates-by-time --strict` が通る

## 3. アーカイブ時

- [ ] 3.1 archive 後に `openspec/specs/PPP-004-reply-selection/spec.md` の `## Purpose` を更新する。現行は「同一内容の投稿を複数の SNS（X、Mastodon、Bluesky）にまたがって適切にグループ化し」と書かれており、対象 SNS が古い（X は PPP-006 で廃除、Threads・Misskey が未記載）うえ、本 change で加えた時刻近接の条件も反映されていない。OpenSpec の archive は `## Requirements` セクションのみを差し替えるため自動更新されない
