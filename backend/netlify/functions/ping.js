const handler = async (event) => {
  return {
    statusCode: 200,
    body: `Ponged at  ${new Date().toISOString()}`
  }
}

module.exports = { handler }