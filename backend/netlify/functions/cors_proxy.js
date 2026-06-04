const fetch = require('node-fetch')
const Encoding = require('encoding-japanese');

// Need for CORS
const resHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Content-Type': 'application/json',
};

const handler = async (event) => {
  console.info(`FIXME 後で消す  -> handler -> event:`, event);

  try {
    const url = event.queryStringParameters.url ?? 'empty';

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) {
      throw new Error(`failed to fetch: ${url}, ${res.status}`);
    }

    let text = '';

    const buf = await res.arrayBuffer();
    const view = new Uint8Array(buf);
    const detectedEncoding = Encoding.detect(view);
    console.log(`文字コードは${detectedEncoding}`);
    if (detectedEncoding == 'SJIS') {
      const textDecoder = new TextDecoder('shift-jis');    
      text = textDecoder.decode(buf);
    } else if (detectedEncoding == 'EUCJP') {
      const textDecoder = new TextDecoder('euc-jp');    
      text = textDecoder.decode(buf);
    } else {
      const textDecoder = new TextDecoder('utf-8');    
      text = textDecoder.decode(buf);
    }

    return {
      statusCode: 200,
      headers: resHeaders,
      body: text,
    }
  
  } catch (error) {
    console.log(`FIXME 後で消す  -> handler -> error:`, error);
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }