const fetch = require('node-fetch')
const fs = require('fs');
const { url } = require('inspector');

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
    const { token } = JSON.parse(event.body); // as { refresh_token: string, text: string };

    const { accessToken, accessSecret } = JSON.parse(decrypt(token));
    console.info(`FIXME 後で消す2  -> handler -> refresh_token:`, accessToken, accessSecret);

    const { TwitterApi } = require('twitter-api-v2');
    const twitterClient = new TwitterApi({
      appKey: process.env.PPPOST_TWITTER_APPKEY, 
      appSecret: process.env.PPPOST_TWITTER_APPSECRET,
      accessToken,
      accessSecret, 
    });

    const meRes = await twitterClient.v2.me();
    console.log(`FIXME h_oku 後で消す  -> handler -> meRes:`, meRes);

    // 必要なモジュールをインポート
    const fs = require('fs');
    const { JSDOM } = require('jsdom');

    // HTMLファイルを読み込む
    // const html = fs.readFileSync('/Volumes/extssd/data/dev/oss/pppost/src/pppost-auth/netlify/functions/mytweets.html', 'utf8');

    const myUserName = meRes?.data?.username;
    const url = `https://twilog.togetter.com/${myUserName}`;
    const respo = await fetch(url);
    const html = await respo.text();
    
    // JSDOMを使ってHTMLをパース
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // 結果を格納する配列
    const tweets = [];

    // article.tl-tweet 要素をループ
    const tweetElements = document.querySelectorAll('article.tl-tweet');
    tweetElements.forEach(element => {
      const date = element.getAttribute('data-date');
      const status_id = element.getAttribute('data-status-id');
      const author = element.getAttribute('data-status-author');
      const text = element.querySelector('p.tl-text').textContent;
      const time = element.querySelector('p.tl-posted')?.querySelector('a.tb-tw')?.textContent;

      if (author !== myUserName) {
        return;
      }

      const tweet = {
        text,
        url: `https://x.com/${author}/status/${status_id}`, // https://x.com/amay077/status/1881656999815094621
        posted_at: `${date}T${time}.000Z`, // 2025-01-21T12:30:30.228Z
      };
      tweets.push(tweet);
    });

    // 結果をコンソールに出力
    console.log(tweets);

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(tweets)
    };
    console.info('3. tweets scceeded', response);
    return response;
  } catch (error) {
    console.log(`handler -> error:`, error);
    
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }