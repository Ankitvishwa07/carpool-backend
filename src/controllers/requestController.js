const bookingService = require('../services/bookingService');
const RideRequest = require('../models/RideRequest');
const Trip = require('../models/Trip');

// POST /requests
// Body: { tripId, seatsRequested?, pickup?, dropoff? }
async function create(req, res, next) {
  try {
    const { tripId, seatsRequested, pickup, dropoff } = req.body;

    const request = await bookingService.createRequest({
      tripId,
      riderId: req.user.id,
      seatsRequested,
      pickup,
      dropoff,
      // matchMeta would normally be computed by the matching engine at
      // search time and passed through from the frontend's selected result;
      // left undefined here until that piece is wired in.
    });

    return res.status(201).json({ request });
  } catch (err) {
    return next(err);
  }
}

// PUT /requests/:id/accept
async function accept(req, res, next) {
  try {
    const request = await bookingService.acceptRequest({
      requestId: req.params.id,
      driverId: req.user.id,
    });
    return res.json({ request });
  } catch (err) {
    return next(err);
  }
}

// PUT /requests/:id/decline
async function decline(req, res, next) {
  try {
    const request = await bookingService.declineRequest({
      requestId: req.params.id,
      driverId: req.user.id,
    });
    return res.json({ request });
  } catch (err) {
    return next(err);
  }
}

// PUT /requests/:id/cancel
async function cancel(req, res, next) {
  try {
    const request = await bookingService.cancelRequest({
      requestId: req.params.id,
      userId: req.user.id,
    });
    return res.json({ request });
  } catch (err) {
    return next(err);
  }
}

// GET /requests/incoming — requests made on trips the current user drives
async function incoming(req, res, next) {
  try {
    const myTripIds = await Trip.find({ driverId: req.user.id }).distinct('_id');
    const requests = await RideRequest.find({ tripId: { $in: myTripIds } })
      .populate('tripId')
      .populate('riderId', 'name ratingAverage ratingCount')
      .sort({ createdAt: -1 });

    return res.json({ requests });
  } catch (err) {
    return next(err);
  }
}

// GET /requests/mine — requests the current user made as a rider
async function mine(req, res, next) {
  try {
    const requests = await RideRequest.find({ riderId: req.user.id })
      .populate({
        path: 'tripId',
        populate: { path: 'driverId', select: 'name ratingAverage ratingCount' },
      })
      .sort({ createdAt: -1 });

    return res.json({ requests });
  } catch (err) {
    return next(err);
  }
}

module.exports = { create, accept, decline, cancel, incoming, mine };