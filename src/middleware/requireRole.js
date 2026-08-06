function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ message: 'You do not have permission to do this' });
    }

    next();
  };
}

module.exports = requireRole;