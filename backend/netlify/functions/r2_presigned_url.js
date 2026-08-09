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
    const ext = (filename.split('.').pop() || 'png').toLowerCase();
    const fileName = `${timestamp}-${randomStr}.${ext}`;

    // 拡張子から Content-Type を解決する（画像・動画の両方に対応）
    // 署名付き PUT 時の Content-Type と一致させる必要があるため、ここで決定して返す
    const MIME_BY_EXT = {
      // 画像
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      // 動画
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      webm: 'video/webm',
      m4v: 'video/x-m4v',
    };
    const contentType = MIME_BY_EXT[ext];
    if (contentType == null) {
      // 未知の拡張子はライフサイクルルールの対象（pppost/ と pppost/video/）を
      // 判別できないため、アップロードを受け付けない
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: `unsupported file extension: ${ext}` }),
      };
    }

    // 動画はライフサイクルルールを分けて管理するため、プレフィックスを分ける
    const isVideo = contentType.startsWith('video/');
    const filePath = isVideo ? `pppost/video/${fileName}` : `pppost/${fileName}`;

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
