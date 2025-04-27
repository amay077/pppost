const fetch = require('node-fetch')

// Need for CORS
const resHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Content-Type': 'application/json', // レスポンスボディがJSONであることを示す
};

const handler = async (event) => {
  console.info(`FIXME 後で消す  -> handler -> event:`, event);

  try {
    const url = event.queryStringParameters.url ?? 'empty';

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`failed to fetch: ${url}, ${res.status}`);
    }

    // 画像データをBufferとして取得
    const imageBuffer = await res.buffer();
    // Content-Typeを取得
    const contentType = res.headers.get('content-type');

    // BufferをBase64エンコード
    const base64Image = imageBuffer.toString('base64');
    // Data URIを生成
    const dataUri = `data:${contentType};base64,${base64Image}`;

    return {
      statusCode: 200,
      headers: resHeaders,
      body: dataUri,
    }
  
  } catch (error) {
    console.log(`FIXME 後で消す  -> handler -> error:`, error);
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }