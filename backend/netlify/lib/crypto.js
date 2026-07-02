const crypto = require('crypto');

// 鍵は PPPOST_DATA_SECRET の先頭 32 バイト（AES-256-CBC）
const getKey = () => Buffer.from(process.env.PPPOST_DATA_SECRET).subarray(0, 32);

// 暗号化ごとにランダムな IV を生成し、`${ivHex}:${cipherHex}` 形式で返す
const encrypt = (plaintext) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

// `${ivHex}:${cipherHex}` を分解して復号する
const decrypt = (stored) => {
  const [ivHex, cipherHex] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports = { encrypt, decrypt };
