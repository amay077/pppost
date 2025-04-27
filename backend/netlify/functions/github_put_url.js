// Need for CORS
const resHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Content-Type': 'application/json',
};

function autoId(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < len; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

const handler = async (event) => {
  console.info(`FIXME 後で消す  -> handler -> event:`, event);

  try {
    const branch_name = 'main';
    const token = process.env.PPPOST_GITHUB_ACCESS_TOKEN;
  
    const file = new Date().toISOString();
    const url = `${process.env.PPPOST_GITHUB_REPO_URL}/${file}_${autoId(8)}.data`;

    return {
      statusCode: 200,
      headers: resHeaders,
      body: JSON.stringify({ url, branch_name, token })
    }
  
  } catch (error) {
    console.log(`FIXME 後で消す  -> handler -> error:`, error);
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }