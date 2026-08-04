const fetch = require('node-fetch');

const resHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Content-Type': 'application/json',
};

// YouTube ホストの http(s) URL のみ許可する（oEmbed 誤用・SSRF 防止）
const isYouTubeUrl = (input) => {
  try {
    const parsed = new URL(input);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === 'youtube.com' ||
        parsed.hostname === 'www.youtube.com' ||
        parsed.hostname === 'm.youtube.com' ||
        parsed.hostname === 'youtu.be' ||
        parsed.hostname === 'www.youtu.be')
    );
  } catch (_) {
    return false;
  }
};

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: resHeaders,
      body: '',
    };
  }

  try {
    const url = event.queryStringParameters?.url;

    if (!url || !isYouTubeUrl(url)) {
      return {
        statusCode: 400,
        headers: resHeaders,
        body: JSON.stringify({ success: false, error: 'A valid YouTube URL is required' }),
      };
    }

    console.log('Fetching YouTube oEmbed for URL:', url);

    // YouTube oEmbed API（API キー不要）で動画タイトルを取得する
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: resHeaders,
        body: JSON.stringify({ success: false, error: `Failed to fetch oEmbed: ${response.status}` }),
      };
    }

    const data = await response.json();
    const title = data.title?.trim();

    if (!title) {
      return {
        statusCode: 200,
        headers: resHeaders,
        body: JSON.stringify({ success: false, error: 'Title not found' }),
      };
    }

    return {
      statusCode: 200,
      headers: resHeaders,
      body: JSON.stringify({ success: true, title }),
    };
  } catch (error) {
    console.error('youtube_oembed -> error:', error);
    return {
      statusCode: 500,
      headers: resHeaders,
      body: JSON.stringify({ success: false, error: 'Failed to fetch YouTube title' }),
    };
  }
};

module.exports = { handler };
