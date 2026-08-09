# 本文エリアへのファイル ドラッグ&ドロップ追加

## Why

本文（Message）エリアへファイルをドラッグ&ドロップするだけで画像・動画を添付できるようにする。現状、画像は「画像を追加」ボタンとクリップボード貼り付けのみ、動画は「動画を追加」ボタンのみで添付でき、ファイルのドラッグ&ドロップには対応していない（Issue #37）。

## What Changes

- 本文エリア（Message ラベル + textarea を含むブロック）をドロップ対象とし、画像ファイル（`image/*`）をドロップすると画像として複数枚添付される
- 動画ファイル（`video/*`）をドロップすると、既存の動画バリデーション（100MB 以内・3 分以内・メタデータ読み取り、`video-posting` capability 準拠）を適用した上で 1 本のみ動画として添付される
- 画像・動画以外のファイル（例: PDF）は受け付けず、無視する
- 画像と動画が混在するドロップでは動画を優先して添付し、画像は無視する
- ドロップ時も既存の「画像と動画の排他」ルール（`sns-posting`）に従う: 動画が添付済みの状態で画像をドロップすると動画が解除され、画像が添付済みの状態で動画をドロップすると画像・リプライ元・引用元が解除される
- ドラッグ中は本文エリアにドロップ可能であることを示す視覚フィードバック（ハイライト）を表示する

## Impact

- **Affected specs**: `file-drop`（新規 capability）
- **Affected code**: `frontend/src/lib/MainContent.svelte`（ドロップハンドラ・排他制御・視覚フィードバック）、`frontend/src/lib/image-func.ts`（`loadImageAsDataURL` を再利用）
- **Breaking changes**: なし

## References

- [Issue #37](https://github.com/amay077/pppost/issues/37)
