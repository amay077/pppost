# Implementation Tasks

## 1. 仕様更新

- [x] 1.1 `PPP-004-reply-selection` の「グループ化のためのテキスト正規化」Requirement にハッシュタグの `#` 記号除去のシナリオを追加する

## 2. 実装

- [x] 2.1 `frontend/src/lib/MainContent.ts` の `normalizeText` にハッシュタグの `#` 記号除去（`#(?=[\p{L}\p{N}_])`）を追加する

## 3. 検証

- [x] 3.1 `npm run check`（svelte-check）が成功する（既存エラー 3 件のみ、変更箇所にエラーなし）
- [x] 3.2 `npm run build` が成功する
- [ ] 3.3 動作検証: Threads へのハッシュタグ付き投稿が、他 SNS の同一内容投稿と同じグループに表示される（要実環境・ユーザー確認）
