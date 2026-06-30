const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const handler = async (event) => {
  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    const { filename } = JSON.parse(event.body);

    // R2 (S3互換) クライアントの初期化（サーバーサイドでのみ）
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    // ユニークなファイル名を生成
    const timestamp = Date.now();
    const randomStr = crypto.randomBytes(8).toString('hex');
    const extension = filename.split('.').pop() || 'png';
    const fileName = `${timestamp}-${randomStr}.${extension}`;
    const filePath = `pppost/${fileName}`;

    // PUT 時の Content-Type と署名を一致させるため、ここで決定して返す
    const contentType = `image/${extension}`;

    // 署名付きアップロードURLを生成（5分間有効）
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filePath,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    // 公開URLを組み立てて返す（R2_PUBLIC_URL は末尾スラッシュ無しを想定）
    const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
    const publicUrl = `${publicBase}/${filePath}`;

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uploadUrl,
        publicUrl,
        path: filePath,
        contentType,
      }),
    };
  } catch (error) {
    console.error('Presigned URL error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

module.exports = { handler };
