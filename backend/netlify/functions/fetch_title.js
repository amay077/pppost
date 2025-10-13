const fetch = require('node-fetch');
const cheerio = require('cheerio');

const resHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Content-Type': 'application/json',
};

const isValidHttpUrl = (input) => {
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
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
    const url =
      event.httpMethod === 'GET'
        ? event.queryStringParameters?.url
        : event.httpMethod === 'POST' && event.body
          ? JSON.parse(event.body).url
          : undefined;

    if (!url || !isValidHttpUrl(url)) {
      return {
        statusCode: 400,
        headers: resHeaders,
        body: JSON.stringify({ success: false, error: 'A valid http(s) URL is required' }),
      };
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: resHeaders,
        body: JSON.stringify({ success: false, error: `Failed to fetch url: ${response.status}` }),
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html, { decodeEntities: true });

    const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
    const twitterTitle = $('meta[name="twitter:title"]').attr('content')?.trim();
    const rawTitle = $('title').first().text().trim();

    const title = ogTitle || twitterTitle || rawTitle || '';

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
    console.error('fetch_title -> error:', error);
    return {
      statusCode: 500,
      headers: resHeaders,
      body: JSON.stringify({ success: false, error: 'Failed to fetch page title' }),
    };
  }
};

module.exports = { handler };
