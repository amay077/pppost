const fetch = require('node-fetch');

// Cloudflare D1 の HTTP API を叩く薄いラッパ。
// result[0].results（行の配列）を返す。失敗時は console.error してエラーを投げる。
const query = async (sql, params = []) => {
  const accountId = process.env.CF_ACCOUNT_ID;
  const databaseId = process.env.CF_D1_DATABASE_ID;
  const apiToken = process.env.CF_API_TOKEN;

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!res.ok) {
    console.error(`d1 query failed: ${res.status}`, await res.text());
    throw new Error(`D1 query failed: ${res.status}`);
  }

  const json = await res.json();
  if (json.success !== true) {
    console.error(`d1 query returned error:`, JSON.stringify(json.errors));
    throw new Error('D1 query returned error');
  }

  return json.result[0].results;
};

module.exports = { query };
