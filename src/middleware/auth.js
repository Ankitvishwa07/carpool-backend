const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ message: 'This account has been disabled' });
    }

    // req.user is the canonical shape controllers/services should use.
    // req.userId / req.userRole kept for backwards compat with older route files.
    req.user = { id: user._id, role: user.role };
    req.userId = user._id;
    req.userRole = user.role;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;