# Implementation Tasks

## 1. 共有ボタンの追加

- [x] 1.1 `MainContent.svelte` のテキストエリア付近のボタングループに共有ボタンを追加
- [x] 1.2 既存の Bootstrap ボタン様式に合わせる
- [x] 1.3 共有はクリック（ユーザー操作）起点でのみ `navigator.share` を呼ぶ
- [x] 1.4 テキストも画像も無い場合（`text.length <= 0 && images.length <= 0`）は共有ボタンを `disabled` にし、空内容で `navigator.share` を呼ばない

## 2. テキストのみの共有

- [x] 2.1 画像がない場合は `navigator.share({ text })` を呼ぶ

## 3. テキストと画像の共有

- [x] 3.1 選択中の全画像（`images: ImageData[]`）について、各画像の表示中 URL (`img.croppedUrl ?? img.originalUrl`) を Blob → `File` に変換し、`files: File[]` 配列にまとめる
- [x] 3.2 `navigator.canShare({ files })` でファイル共有の対応可否を判定する
- [x] 3.3 対応時は `navigator.share({ text, files })` で全画像を共有する
- [x] 3.4 ファイル共有非対応時は `navigator.share({ text })` にフォールバックする

## 4. 非対応環境・例外の扱い

- [x] 4.1 `navigator.share` 非対応環境では共有ボタンを非表示にする
- [x] 4.2 共有処理の例外を捕捉し、ユーザーキャンセル（`AbortError`）時はエラー表示せず正常終了する。`AbortError` 以外の失敗時はユーザーに失敗を通知する（無言で握りつぶさない）

## 5. 動作検証

- [ ] 5.1 スマートフォンで共有ボタン押下時に OS の共有シートが開きテキストが渡ることを確認
- [ ] 5.2 複数画像添付時にテキストと全画像が共有されることを確認
- [ ] 5.3 ファイル共有非対応環境でテキストのみ共有にフォールバックすることを確認
- [ ] 5.4 Web Share API 非対応の PC ブラウザで共有ボタンが非表示であることを確認
- [ ] 5.5 テキストも画像も無いとき共有ボタンが無効であることを確認
- [ ] 5.6 共有シートをキャンセルしてもエラー表示されず、`AbortError` 以外の失敗時はユーザーに通知されることを確認
