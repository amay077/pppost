const fetch = require('node-fetch');
const cheerio = require('cheerio');

// Need for CORS
const resHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Content-Type': 'application/json',
};

const handler = async (event) => {
  console.info('foursquare_scrape -> event:', event);

  try {
    // GETリクエストのクエリパラメータからURL取得（POSTも互換性のためサポート）
    let url;
    if (event.httpMethod === 'GET') {
      url = event.queryStringParameters?.url;
    } else if (event.httpMethod === 'POST' && event.body) {
      // 後方互換性のためPOSTも引き続きサポート
      const body = JSON.parse(event.body);
      url = body.url;
    } else if (event.httpMethod === 'OPTIONS') {
      // CORS preflight
      return {
        statusCode: 200,
        headers: resHeaders,
        body: ''
      };
    }

    if (!url) {
      return {
        statusCode: 400,
        headers: resHeaders,
        body: JSON.stringify({ error: 'URL parameter is required' }),
      };
    }

    console.log('Fetching Swarm checkin URL:', url);

    // Swarmページを取得
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Swarm page: ${response.status}`);
    }

    const html = await response.text();
    
    // cheerioでHTMLをパース
    const $ = cheerio.load(html);
    
    // OGタグから基本情報を取得
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDescription = $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    
    // タイトルから場所名とカテゴリを抽出（通常 "場所名 - カテゴリ" の形式）
    const titleParts = ogTitle.split(' - ');
    const venueName = titleParts[0]?.trim() || '';
    const category = titleParts[1]?.trim() || '';
    
    // 説明文から場所情報を抽出
    // 英語形式: "checked in at [場所名] in [地域]"
    // 日本語形式: "[カテゴリ] in [地域]"
    let locationParts = [];
    
    // まず英語形式を試す
    const enLocationMatch = ogDescription.match(/checked in at .+ in (.+)$/);
    if (enLocationMatch) {
      locationParts = enLocationMatch[1].split(', ');
    } else {
      // 日本語形式を試す
      const jpLocationMatch = ogDescription.match(/ in (.+)$/);
      if (jpLocationMatch) {
        locationParts = jpLocationMatch[1].split(', ');
      }
    }
    
    // ページ内から追加情報を取得
    let shout = '';
    let checkinTime = '';
    let checkinTimestamp = null;
    
    // コメント（shout）を探す - 複数のセレクタを試す
    const shoutSelectors = [
      '.shout',
      '.comment',
      '.checkinComment',
      '[class*="shout"]',
      '[class*="comment"]'
    ];
    
    for (const selector of shoutSelectors) {
      const shoutElement = $(selector).first();
      if (shoutElement.length > 0) {
        shout = shoutElement.text().trim();
        break;
      }
    }
    
    // チェックイン時刻を探す（data-created-at属性も取得）
    // より具体的なセレクタを追加
    const timeSelectors = [
      '.timestamp.autoupdate[data-created-at]',  // data-created-at属性を持つtimestamp要素を直接指定
      '.timestamp[data-created-at]',
      '.timestamp',
      '.time',
      '.date',
      'time',
      '[class*="time"]',
      '[class*="date"]'
    ];
    
    for (const selector of timeSelectors) {
      const timeElement = $(selector).first();
      if (timeElement.length > 0) {
        checkinTime = timeElement.text().trim();
        
        // data-created-at属性からUNIXタイムスタンプを取得
        const timestamp = timeElement.attr('data-created-at');
        if (timestamp) {
          checkinTimestamp = parseInt(timestamp);
          console.log('Found timestamp:', timestamp);
        }
        break;
      }
    }
    
    // チェックイン時刻に基づいてI'm at/I was atを決定
    let atPhrase = "I'm at";
    if (checkinTimestamp) {
      const now = Math.floor(Date.now() / 1000); // 現在のUNIXタイムスタンプ
      const diffSeconds = now - checkinTimestamp;
      const diffHours = diffSeconds / 3600;
      
      // 3時間以上経過していたら"I was at"を使用
      if (diffHours >= 3) {
        atPhrase = "I was at";
      }
    }
    
    // 投稿テキストの生成
    const shoutPrefix = shout ? `${shout} / ` : '';
    const location = locationParts.length >= 2 
      ? `${locationParts[0]}, ${locationParts[1]}` 
      : locationParts[0] || '';
    
    const postText = `${shoutPrefix}${atPhrase} ${venueName} in ${location} ${url}`;
    
    // レスポンスデータの構築
    const result = {
      success: true,
      data: {
        venueName: venueName,
        category: category,
        city: locationParts[0] || '',
        state: locationParts[1] || '',
        country: locationParts[2] || 'Japan',
        shout: shout,
        checkinTime: checkinTime,
        checkinTimestamp: checkinTimestamp,
        checkinUrl: url,
        ogImage: ogImage,
        postText: postText,
        // 個別のSNS用テキストも生成
        texts: {
          default: postText,
          twitter: postText.length > 280 ? postText.substring(0, 277) + '...' : postText,
          bluesky: postText,
          mastodon: postText
        }
      }
    };

    console.log('Scraped data:', result);

    return {
      statusCode: 200,
      headers: resHeaders,
      body: JSON.stringify(result),
    };
  
  } catch (error) {
    console.error('foursquare_scrape -> error:', error);
    return { 
      statusCode: 500, 
      headers: resHeaders,
      body: JSON.stringify({ 
        success: false,
        error: error.message || 'Failed to scrape Swarm checkin page'
      })
    };
  }
};

module.exports = { handler };