# Cloudflare R2 セットアップガイド

PPPOST で SNS への画像投稿に使う一時ストレージとして Cloudflare R2 を設定する手順です。投稿時にアップロードした画像を署名付き URL で R2 に一時保存し、各 SNS に渡したあと削除します。

## 1. R2 バケットの作成

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にアクセス
2. 左メニューから「R2」を選択（初回は R2 の有効化が必要）
3. 「バケットを作成」をクリック
4. バケット名を入力（例: `pppost-img-tmp`）
5. 「バケットを作成」で確定

## 2. 公開アクセスの設定

SNS 側が画像 URL を fetch できるよう、バケットを公開する必要があります。

1. 作成したバケットの「設定」を開く
2. 「パブリックアクセス」の項目で **R2.dev サブドメイン** を許可
   - 公開 URL（例: `https://pub-xxxxxxxx.r2.dev`）が発行される → これを `R2_PUBLIC_URL` に設定
   - 独自ドメインを使う場合は「カスタムドメイン」を接続し、そのドメインを `R2_PUBLIC_URL` に設定

## 3. CORS の設定（重要）

ブラウザから署名付き URL へ直接 PUT アップロードするため、CORS の許可が必須です。

1. バケットの「設定」→「CORS ポリシー」を開く
2. 以下のような JSON を設定（`AllowedOrigins` はフロントのデプロイ先ドメインに置き換え）:

```json
[
  {
    "AllowedOrigins": [
      "https://your-frontend-domain",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3000
  }
]
```

> `http://localhost:5173` はローカル開発（Vite）用。本番のみで良ければ削除可。

## 4. R2 API トークンの発行

1. R2 のトップページで「R2 API トークンを管理」を開く
2. 「API トークンを作成」をクリック
3. 権限は **オブジェクトの読み取りと書き込み**（対象バケットに限定推奨）を選択
4. 作成後に表示される以下を控える:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`（再表示不可。必ず保存）
5. アカウント ID は R2 のエンドポイント URL（`https://<アカウントID>.r2.cloudflarestorage.com`）から確認 → `R2_ACCOUNT_ID`

## 5. 環境変数の設定

### バックエンド環境変数（Netlify）

Netlify の環境変数に以下を設定します（ローカルは `backend/.env`）:

```bash
# Cloudflare アカウント ID
R2_ACCOUNT_ID=your_cloudflare_account_id

# R2 API トークンの認証情報（秘密情報）
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key

# バケット名
R2_BUCKET_NAME=pppost-img-tmp

# 公開 URL（末尾スラッシュ無し）
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

**重要**: `R2_SECRET_ACCESS_KEY` は秘密情報です。フロントエンドには含めず、バックエンドの環境変数としてのみ設定してください。

**仕組み**:
1. フロントエンドがバックエンドに署名付きアップロード URL をリクエスト
2. バックエンド（`r2_presigned_url`）が R2 の S3 互換 API で一時的なアップロード URL（5分有効）を生成
3. フロントエンドが直接 R2 にアップロード（Netlify Functions を経由しない）
4. 投稿完了 or 失敗後、バックエンド（`r2_delete`）が画像を削除

## 6. ライフサイクルルール（任意・推奨）

一時画像のため、削除漏れ対策に自動削除ルールを設定しておくと安全です。

1. バケットの「設定」→「オブジェクトライフサイクルルール」を開く
2. 「ルールを追加」で、例えば「作成から 1 日後に削除」を設定

## 7. デプロイ

```bash
# バックエンド
cd backend
npm install

# フロントエンド
cd ../frontend
npm install

# ビルドとデプロイ
npm run build
netlify deploy --prod
```

## 無料枠の制限（参考）

- **ストレージ**: 10GB
- **Class A 操作（書き込み等）**: 100万回/月
- **Class B 操作（読み取り等）**: 1000万回/月
- **egress（転送量）**: 無料

## トラブルシューティング

### アップロードが CORS エラーになる
- バケットの CORS ポリシーに、フロントのオリジンと `PUT` メソッド、`Content-Type` ヘッダーが含まれているか確認

### `SignatureDoesNotMatch` エラー
- PUT 時の `Content-Type` ヘッダーが、署名生成時の `ContentType` と一致しているか確認（本実装ではサーバーが返す `contentType` をそのまま使用）

### 画像が表示されない / SNS に反映されない
- バケットの公開アクセス（R2.dev サブドメイン or カスタムドメイン）が有効か確認
- `R2_PUBLIC_URL` が正しく、末尾スラッシュ無しで設定されているか確認
- 生成された公開 URL にブラウザで直接アクセスできるか確認
