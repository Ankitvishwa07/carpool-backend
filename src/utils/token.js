const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function generateAccessToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

// Opaque random string, NOT a JWT. We only ever store its hash in the DB, so a
// leaked database dump alone can't be replayed as a valid refresh token.
function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { generateAccessToken, generateRefreshToken, hashToken };