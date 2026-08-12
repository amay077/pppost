// Need for CORS
const resHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Content-Type': 'application/json',
};

const handler = async (event) => {
  return {
    statusCode: 200,
    headers: resHeaders,
    body: JSON.stringify({ build_at: '{{built_at}}' })
  }
}

module.exports = { handler }