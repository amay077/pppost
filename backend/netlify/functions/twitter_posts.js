const fetch = require('node-fetch')
const fs = require('fs');
const { url } = require('inspector');
const cheerio = require('cheerio'); // cheerioモジュールを追加

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

/**
 * 相対的な日時文字列を絶対的なYYYY-MM-DD HH:MM:SS 形式に変換する
 * @param {string} relativeTimeString - 例: "9分前", "昨日 0:07", "6月5日(木) 23:20", "18:02"
 * @returns {string | null} 変換された日時文字列、または変換できなかった場合はnull
 */
function convertRelativeTimeToAbsolute(relativeTimeString) {
  // 基準となる現在日時 (JST) - 実行時の正確な時間ではなく、指示された時間を固定値として使用
  // Saturday, June 7, 2025 at 8:00:23 PM JST
  const now = new Date('2025-06-07T20:00:23+09:00');
  let targetDate = new Date(now); // 計算用に現在日時をコピー

  // 1. "N分前" のパターン
  const minutesAgoMatch = relativeTimeString.match(/^(\d+)分前$/);
  if (minutesAgoMatch) {
      const minutes = parseInt(minutesAgoMatch[1], 10);
      targetDate.setMinutes(now.getMinutes() - minutes);
      targetDate.setSeconds(0); // 秒は不明なので00とする
      return formatDateTime(targetDate);
  }

  // 2. "昨日 HH:MM" のパターン
  const yesterdayMatch = relativeTimeString.match(/^昨日 (\d{1,2}):(\d{2})$/);
  if (yesterdayMatch) {
      const hours = parseInt(yesterdayMatch[1], 10);
      const minutes = parseInt(yesterdayMatch[2], 10);
      targetDate.setDate(now.getDate() - 1); // 現在の日付から1日戻す
      targetDate.setHours(hours);
      targetDate.setMinutes(minutes);
      targetDate.setSeconds(0); // 秒は不明なので00とする
      return formatDateTime(targetDate);
  }

  // 3. "MM月DD日(曜日) HH:MM" のパターン
  const dateMatch = relativeTimeString.match(/^(\d{1,2})月(\d{1,2})日\(.\) (\d{1,2}):(\d{2})$/);
  if (dateMatch) {
      const month = parseInt(dateMatch[1], 10); // 月 (1-indexed)
      const day = parseInt(dateMatch[2], 10);   // 日
      const hours = parseInt(dateMatch[3], 10);  // 時
      const minutes = parseInt(dateMatch[4], 10); // 分

      targetDate.setMonth(month - 1); // Dateオブジェクトの月は0-indexedなので-1
      targetDate.setDate(day);
      targetDate.setHours(hours);
      targetDate.setMinutes(minutes);
      targetDate.setSeconds(0); // 秒は不明なので00とする

      // 年の調整: 取得した日時が現在日時よりも未来の場合、前年の日付とみなす
      // (例: 現在が2025/01/05で「12月30日」の場合、2024/12/30と判断)
      // ここで「月」と「日」を比較して未来かを判断する
      const currentYearCheckDate = new Date(now.getFullYear(), month - 1, day, hours, minutes, 0);

      if (currentYearCheckDate > now) {
          targetDate.setFullYear(now.getFullYear() - 1);
      } else {
          targetDate.setFullYear(now.getFullYear());
      }
      return formatDateTime(targetDate);
  }

  // 4. "HH:MM" のパターン (時刻のみ)
  const timeOnlyMatch = relativeTimeString.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnlyMatch) {
      const hours = parseInt(timeOnlyMatch[1], 10);
      const minutes = parseInt(timeOnlyMatch[2], 10);
      targetDate.setHours(hours);
      targetDate.setMinutes(minutes);
      targetDate.setSeconds(0); // 秒は不明なので00とする

      // 時刻が現在の時刻より未来の場合、前日の時刻とみなす
      // (例: 現在が20:00で「18:00」の場合、今日の18:00。現在が08:00で「18:00」の場合、昨日の18:00)
      if (targetDate > now && hours > now.getHours()) {
           // 時間が未来だが、日付は今日であるべき（例：現在10:00で18:00は今日）
           // 何もしない
      } else if (targetDate > now) {
          // 時間は未来だが、現在の時刻より前の時間（例：現在20:00で08:00の場合、これは昨日の08:00）
          targetDate.setDate(now.getDate() - 1);
      }
      return formatDateTime(targetDate);
  }

  // どのパターンにもマッチしなかった場合
  return null;
}

/**
 * 日時オブジェクトを YYYY-MM-DD HH:MM:SS 形式にフォーマットする
 * @param {Date} date - 日時オブジェクト
 * @returns {string} フォーマットされた日時文字列
 */
function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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

    const myUserName = meRes?.data?.username;
    
    // Yahoo!リアルタイム検索のURLを構築
    const searchQuery = `id:${myUserName}`;
    const yahooRealtimeUrl = `https://search.yahoo.co.jp/realtime/search?p=${encodeURIComponent(searchQuery)}&ei=UTF-8&ifr=tl_sc`;
    
    // Yahoo!リアルタイム検索にGETリクエストを送信
    const response = await fetch(yahooRealtimeUrl);
    const html = await response.text();
    
    // HTML解析
    const $ = cheerio.load(html);
    
    // 結果を格納する配列
    const tweets = [];
    
    // ツイートを抽出
    $('.Tweet_TweetContainer__aezGm.Tweet_overall__a5p_9').each((index, element) => {
      const authorIDElement = $(element).find('.Tweet_authorID__JKhEb');
      if (authorIDElement.text().trim() === `@${myUserName}`) {
        // パーマリンク（URL）を取得
        const timeElement = $(element).find('.Tweet_time__GS_jw a');
        const tweetUrl = timeElement.attr('href');
        
        // 投稿内容を取得（返信先のテキストを除外）
        const contentElement = $(element).find('.Tweet_body__3tH8T');
        let content = contentElement.clone();
        content.find('.Tweet__reply').remove(); // 返信先を削除
        const text = content.text().trim();
        
        // ツイートIDを抽出
        // URLからツイートIDを取得（例: https://x.com/amay077/status/1931291445606150303）
        const statusMatch = tweetUrl.match(/status\/(\d+)/);
        const statusId = statusMatch ? statusMatch[1] : '';
        
        // 投稿時刻を取得
        const relativeTimeString = timeElement.text().trim();
        const posted_at = convertRelativeTimeToAbsolute(relativeTimeString);
        console.log(`${relativeTimeString} -> ${posted_at}`);
        
        const tweet = {
          text,
          url: `https://x.com/${myUserName}/status/${statusId}`,
          posted_at,
        };
        
        tweets.push(tweet);
      }
    });

    console.log(tweets);

    const responseObj = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(tweets)
    };
    console.info('3. tweets succeeded', responseObj);
    return responseObj;
  } catch (error) {
    console.log(`handler -> error:`, error);
    
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }