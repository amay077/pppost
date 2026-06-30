const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

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

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'R2 credentials not configured' })
    };
  }

  try {
    const { urls } = JSON.parse(event.body);

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid urls parameter' })
      };
    }

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    const deletedFiles = [];
    const errors = [];

    for (const url of urls) {
      try {
        // 公開URLのパス部分（先頭スラッシュを除く）がオブジェクトキー
        const filePath = new URL(url).pathname.replace(/^\//, '');

        if (filePath) {
          console.log(`Deleting object: ${filePath} from bucket: ${bucketName}`);
          await s3.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: filePath,
          }));
          deletedFiles.push(url);
        } else {
          errors.push({ url, error: 'Could not extract object key from URL' });
        }
      } catch (error) {
        console.error(`Error deleting ${url}:`, error);
        errors.push({ url, error: error.message });
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deleted: deletedFiles,
        errors: errors,
        success: errors.length === 0
      })
    };
  } catch (error) {
    console.error('Delete handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
}

module.exports = { handler };
