const config = require('../config/database');

async function verifyTokenWithSSO(token) {
  const url = config.mockSSO.url;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error('invalid_token');
    err.detail = text;
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/** Express middleware to protect routes using Mock SSO */
module.exports = async function authMiddleware(req, res, next) {
  try {
    const auth = req.get('authorization') || '';
    const m = auth.match(/Bearer\s+(.+)/i);
    if (!m) return res.status(401).json({ error: 'missing_token' });

    const token = m[1].trim();
    const user = await verifyTokenWithSSO(token);

    // Attach user info to request for downstream handlers
    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token' });
  }
};

module.exports.verifyTokenWithSSO = verifyTokenWithSSO;
