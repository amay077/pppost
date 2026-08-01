// Misskey の接続先ホストと MiAuth セッション識別子を検証する。
// ホストはユーザー入力であり、そのまま外部 URL に埋め込むため、
// 外部要求の前に文字列形式のみで検証する（DNS 解決結果までは判定しない）。

// ドット区切りで 2 ラベル以上、各ラベルは英数字で開始・終了する
const HOST_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

// 全ラベルが数値の IPv4 リテラル
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// ホスト名として妥当なら true。スキーム・パス・クエリを含む入力は
// 英数字・ハイフン・ドット以外の文字を含むため HOST_PATTERN で弾かれる。
const isValidMisskeyHost = (host) => {
  if (typeof host !== 'string' || host.length === 0 || host.length > 253) return false;

  // IPv6 リテラル（`[::1]` のブラケット表記を含む）
  if (host.includes(':')) return false;

  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) return false;

  if (IPV4_PATTERN.test(host)) return false;

  return HOST_PATTERN.test(host);
};

// MiAuth セッション識別子は `check` の URL パスへ埋め込まれるため UUID 形式に限定する
const isValidMiAuthSession = (session) =>
  typeof session === 'string' && UUID_PATTERN.test(session);

// 検証済みホストから接続先のオリジンを組み立てる。スキームは常に https。
const buildMisskeyOrigin = (host) => `https://${host}`;

module.exports = { isValidMisskeyHost, isValidMiAuthSession, buildMisskeyOrigin };
