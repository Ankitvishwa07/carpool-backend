const User = require('../models/User');
const Trip = require('../models/Trip');
const RideRequest = require('../models/RideRequest');
const Rating = require('../models/Rating');
const AppError = require('../utils/errors');

async function listUsers(req, res, next) {
  try {
    const { flagged, disabled } = req.query;
    const filter = {};
    if (flagged !== undefined) filter.isFlagged = flagged === 'true';
    // disabled=true  -> isActive: false
    // disabled=false -> isActive: true
    if (disabled !== undefined) filter.isActive = disabled === 'true' ? false : true;

    const users = await User.find(filter)
      .select('name email role isFlagged flagReason isActive ratingAverage ratingCount createdAt')
      .sort({ createdAt: -1 });

    res.json({ users });
  } catch (err) {
    next(err);
  }
}

async function flagUser(req, res, next) {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isFlagged: true, flagReason: reason || '' },
      { new: true }
    ).select('name email isFlagged flagReason');

    if (!user) throw new AppError('User not found', 404);
    res.json({ message: 'User flagged', user });
  } catch (err) {
    next(err);
  }
}

async function unflagUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isFlagged: false, flagReason: '' },
      { new: true }
    ).select('name email isFlagged flagReason');

    if (!user) throw new AppError('User not found', 404);
    res.json({ message: 'User unflagged', user });
  } catch (err) {
    next(err);
  }
}

async function disableUser(req, res, next) {
  try {
    if (req.params.id === req.userId.toString()) {
      throw new AppError("You can't disable your own account", 400);
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    ).select('name email isActive');

    if (!user) throw new AppError('User not found', 404);
    res.json({ message: 'User disabled', user });
  } catch (err) {
    next(err);
  }
}

async function enableUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    ).select('name email isActive');

    if (!user) throw new AppError('User not found', 404);
    res.json({ message: 'User enabled', user });
  } catch (err) {
    next(err);
  }
}

async function analytics(req, res, next) {
  try {
    const [userCount, driverCount, tripCount, activeTrips, pendingRequests, avgRatingResult] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: 'driver' }),
        Trip.countDocuments(),
        Trip.countDocuments({ status: 'active' }),
        RideRequest.countDocuments({ status: 'pending' }),
        Rating.aggregate([{ $group: { _id: null, avg: { $avg: '$stars' } } }]),
      ]);

    res.json({
      totalUsers: userCount,
      totalDrivers: driverCount,
      totalTrips: tripCount,
      activeTrips,
      pendingRequests,
      platformAverageRating: avgRatingResult[0] ? Math.round(avgRatingResult[0].avg * 10) / 10 : 0,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, flagUser, unflagUser, disableUser, enableUser, analytics };