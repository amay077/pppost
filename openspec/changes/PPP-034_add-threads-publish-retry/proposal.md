# Threads 公開失敗時のコンテナ再作成リトライを追加する

## Why

Threads への投稿が度々失敗する。Netlify Function のログ:

```
ERROR  threads publish failed: 400 {"error":{"message":"The requested resource does not exist","type":"OAuthException",
"code":24,"error_subcode":4279009,"error_user_title":"Media Not Found",
"error_user_msg":"The media with id 17979425010117458 cannot be found."}}
```

`waitForContainerReady` で `status=FINISHED` を確認してから公開しているにもかかわらず、公開（`threads_publish`）が `code:24 / subcode:4279009` "Media Not Found" で失敗する。再投稿（＝コンテナを作り直しての再試行）では成功する。

これは Threads/Meta 側の非同期伝播に起因する既知の問題で、コミュニティでも報告が複数ある。

- [fbsamples/threads_api#70](https://github.com/fbsamples/threads_api/issues/70)（Meta 公式サンプルリポジトリ）
- [exileum/meta-mcp#142](https://github.com/exileum/meta-mcp/issues/142)（カルーセル、FINISHED 待ち漏れが原因で PR #151 が修正）
- [vjpixel/diaria-studio#3995](https://github.com/vjpixel/diaria-studio/issues/3995)（create 直後の publish で発生、PR #4056 が FINISHED ポーリングを導入）
- [Meta Developers フォーラム](https://developers.facebook.com/community/threads/389774047443929/)

`status=FINISHED` を返すステータス API と公開 API のレプリカが異なり、公開 API 側にコンテナが未反映のまま失敗することがある。`is_transient: false` を返すが、時間を置いて再試行（コンテナを作り直す）と成功する。

現行実装（`backend/netlify/functions/threads_post.js`）は公開に失敗すると 1 回で投稿全体を失敗としており、リトライ機構がない。

## What Changes

- `publishContainer` が失敗したとき、エラーボディを解析して `code:24 / subcode:4279009`（"Media Not Found"）かどうかを判定する
- このエラーで公開が失敗した場合、システムは**コンテナを作り直して**コンテナ作成 → FINISHED 待ち → 公開のフロー全体を再実行する（作成済みコンテナでの再公開はしない）
- 再試行は初回を含めて最大 3 回（再試行は最大 2 回）。各再試行は呼び出し全体の実行時間予算（デッドライン）を尊重し、予算が不足している場合は再試行せずに失敗として扱う
- 再試行はテキスト・単画像・カルーセル・ゴースト投稿のすべての経路に適用される（`doThreadsPost` を経由するため）
- 4279009 以外の公開失敗（権限エラー等）は従来どおり 1 回で失敗として扱う
- 再試行発生時に `console.warn` でログを出力する（事象の発生頻度を観測可能にする）

## Non-Goals

- コンテナ作成・FINISHED 待ちの失敗のリトライ（現行同様、即失敗を維持）
- 作成済みコンテナ（同一 `creation_id`）での公開再試行
- ネットワークエラーや 5xx のリトライ
- フロントエンドの変更（エラー応答の形は変えないため、`res.ok` で判定している呼び出し側に影響しない）

## Impact

- **Affected specs**: threads-posting（「公開前のコンテナ処理完了待ち」要件を更新）
- **Affected code**: `backend/netlify/functions/threads_post.js` のみ
- **Breaking changes**: なし
- **関連 Issue**: [#35](https://github.com/amay077/pppost/issues/35)
