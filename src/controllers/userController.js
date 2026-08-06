const User = require('../models/User');
const AppError = require('../utils/errors');

// GET /users/:id — public-ish profile lookup, only non-sensitive fields
async function getById(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select(
      'name role ratingAverage ratingCount createdAt'
    );
    if (!user) throw new AppError('User not found', 404);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { getById };