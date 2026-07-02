const fetch = require('node-fetch')
const fs = require('fs');
const { extractSessionId } = require('../lib/session');
const { getToken } = require('../lib/token-store');

const handler = async (event) => {
  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  try {

    const sessionId = extractSessionId(event);
    if (sessionId == null) {
      return {
        statusCode: 401,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'session required' })
      };
    }

    const stored = await getToken(sessionId, 'mastodon');
    if (stored == null) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'mastodon token not stored' })
      };
    }
    const host = stored.meta.server;
    const token = stored.token.access_token;

    // ユーザーIDを取得
    const respons = await fetch(`https://${host}/api/v1/accounts/verify_credentials`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await respons.json();
    const userId = data.id;

    // 自分の投稿一覧を取得
    const postsResponse = await fetch(`https://${host}/api/v1/accounts/${userId}/statuses`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const posts = await postsResponse.json();
    console.log(posts);

    // const decoder = new TextDecoder();

    // HTMLエンティティをデコードする関数
    const { JSDOM } = require('jsdom');

    // HTMLエンティティをデコードする関数
    function decodeHTMLEntities(htmlString) {
      // JSDOMを使ってHTMLをパース
      const dom = new JSDOM(htmlString);
      const document = dom.window.document;

      // <br> タグを改行文字に変換（textContent 取得前に実行）
      const brElements = document.querySelectorAll('br');
      brElements.forEach(br => {
        const textNode = document.createTextNode('\n');
        br.parentNode.replaceChild(textNode, br);
      });

      // <p>要素のテキストコンテンツを取得
      const pElement = document.querySelector('p');
      return pElement ? pElement.textContent : '';
    }

    const results = posts.map(p => {
      const url = p.url;
      const posted_at = p.created_at;
      // p.content の先頭の <p> と末尾の </p> を削除
      const t = p.content.replace(/^<p>/, '').replace(/<\/p>$/, '');

      // さらに HTMLエンコードされた文字をデコード
      const text = decodeHTMLEntities(p.content);


      return { url, posted_at, text };
    })

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(results)
    };
    console.info('posts mastodon scceeded', response);
    return response;
  } catch (error) {
    console.log(`handler -> error:`, error);
    
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }