const fetch = require('node-fetch')
const fs = require('fs');

// 復号化関数
function decrypt(encryptedText) {
  const key = Buffer.from(process.env.PPPOST_DATA_SECRET).subarray(0, 32);
  const iv = Buffer.from(process.env.PPPOST_DATA_IV).subarray(0, 16);
  
  const crypto = require('crypto');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const handler = async (event) => {
  console.info(`FIXME 後で消す  -> handler -> event:`, event);

  try {

    const { host, token } = JSON.parse(event.body); // as { refresh_token: string, text: string };

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