const Trip = require('../models/Trip');
const Message = require('../models/Message');
const RideRequest = require('../models/RideRequest');
const AppError = require('../utils/errors');
const { findMatches } = require('../services/matchingService');
const { getRoute } = require('../services/routingService');
const { notify } = require('../services/notificationService');

// POST /trips (driver only)
async function create(req, res, next) {
  try {
    const { origin, destination, departureTime, returnTime, isRecurring, recurrence, seatsTotal, notes } =
      req.body;

    const originPoint = { type: 'Point', coordinates: [origin.lng, origin.lat], address: origin.address };
    const destinationPoint = {
      type: 'Point',
      coordinates: [destination.lng, destination.lat],
      address: destination.address,
    };

    // Snapshot the driver's route once at creation time — matchingService
    // compares rider detours against this, and the frontend draws it on
    // the map, so neither needs to hit the routing API again.
    let route;
    try {
      const routed = await getRoute([originPoint.coordinates, destinationPoint.coordinates]);
      route = {
        type: 'LineString',
        coordinates: routed.coordinates,
        distanceMeters: routed.distanceMeters,
        durationSeconds: routed.durationSeconds,
      };
    } catch (err) {
      console.warn('[trips] Failed to compute route snapshot:', err.message);
    }

    const trip = await Trip.create({
      driverId: req.user.id,
      origin: originPoint,
      destination: destinationPoint,
      route,
      departureTime,
      returnTime,
      isRecurring,
      recurrence,
      seatsTotal,
      notes,
    });

    res.status(201).json({ message: 'Trip created', trip });
  } catch (err) {
    next(err);
  }
}

// GET /trips — search for trips near a given origin & destination, within a time window
async function search(req, res, next) {
  try {
    const { originLat, originLng, destLat, destLng, time, radiusKm, windowMinutes } = req.query;

    const trips = await findMatches({ originLat, originLng, destLat, destLng, time, radiusKm, windowMinutes });

    res.json({ trips });
  } catch (err) {
    next(err);
  }
}

// GET /trips/mine — all trips posted by the logged-in driver
async function mine(req, res, next) {
  try {
    const trips = await Trip.find({ driverId: req.user.id });
    res.json({ trips });
  } catch (err) {
    next(err);
  }
}

// GET /trips/:id/messages
async function getMessages(req, res, next) {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) throw new AppError('Trip not found', 404);

    const isDriver = trip.driverId.toString() === req.user.id.toString();
    if (!isDriver) {
      const accepted = await RideRequest.exists({
        tripId: trip._id,
        riderId: req.user.id,
        status: 'accepted',
      });
      if (!accepted) throw new AppError('Not authorized to view this chat', 403);
    }

    const messages = await Message.find({ tripId: req.params.id })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name');
    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

// GET /trips/:id
async function getById(req, res, next) {
  try {
    const trip = await Trip.findById(req.params.id).populate('driverId', 'name ratingAverage');
    if (!trip) throw new AppError('Trip not found', 404);
    res.json({ trip });
  } catch (err) {
    next(err);
  }
}

// PUT /trips/:id (owning driver only)
// NOTE: 'status' is intentionally excluded from allowedFields. Cancellation
// has its own endpoint (DELETE /trips/:id) that notifies accepted riders;
// completion is handled by the completeTrips cron job. Letting status
// through here would silently cancel a trip with zero notifications sent.
async function update(req, res, next) {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) throw new AppError('Trip not found', 404);

    if (trip.driverId.toString() !== req.user.id.toString()) {
      throw new AppError('Not your trip', 403);
    }

    if (trip.status === 'cancelled' || trip.status === 'completed') {
      throw new AppError(`Cannot edit a trip that is already ${trip.status}`, 409);
    }

    const allowedFields = ['departureTime', 'returnTime', 'recurrence', 'seatsTotal', 'notes'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) trip[field] = req.body[field];
    });

    await trip.save();
    res.json({ message: 'Trip updated', trip });
  } catch (err) {
    next(err);
  }
}

// DELETE /trips/:id — cancel a trip. Notifies every accepted rider and
// auto-cancels their (now meaningless) requests so nothing is left
// dangling in an 'accepted' state against a dead trip.
async function cancel(req, res, next) {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) throw new AppError('Trip not found', 404);

    if (trip.driverId.toString() !== req.user.id.toString()) {
      throw new AppError('Not your trip', 403);
    }

    if (trip.status === 'cancelled' || trip.status === 'completed') {
      throw new AppError(`Trip is already ${trip.status}`, 409);
    }

    trip.status = 'cancelled';
    await trip.save();

    // Pull every rider whose request was still live on this trip
    const affectedRequests = await RideRequest.find({
      tripId: trip._id,
      status: { $in: ['pending', 'accepted'] },
    });

    if (affectedRequests.length > 0) {
      await RideRequest.updateMany(
        { _id: { $in: affectedRequests.map((r) => r._id) } },
        { status: 'cancelled', respondedAt: new Date(), cancelledBy: req.user.id }
      );

      await Promise.all(
        affectedRequests.map((r) =>
          notify({
            recipientId: r.riderId,
            type: 'trip_cancelled',
            title: 'Trip cancelled',
            body: 'A trip you had a request on was cancelled by the driver',
            tripId: trip._id,
            requestId: r._id,
            actorId: req.user.id,
          })
        )
      );
    }

    res.json({ message: 'Trip cancelled', trip });
  } catch (err) {
    next(err);
  }
}

// DELETE /trips/:id/series — cancel a recurring template + all its future occurrences
async function cancelSeries(req, res, next) {
  try {
    const trip = await require('../services/recurringTripService').cancelSeries(
      req.params.id,
      req.user.id
    );
    res.json({ message: 'Series cancelled', trip });
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(err.message, err.message === 'Trip not found' ? 404 : 403));
  }
}

// PUT /trips/:id/complete — driver manually marks their own trip as completed
// (the completeTrips cron job normally handles this automatically once
// departure/return time has passed, but a driver may want to close it out
// early — e.g. the trip happened but returnTime was never set)
async function completeTrip(req, res, next) {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) throw new AppError('Trip not found', 404);

    if (trip.driverId.toString() !== req.user.id.toString()) {
      throw new AppError('Not your trip', 403);
    }
    if (!['active', 'full'].includes(trip.status)) {
      throw new AppError(`Cannot complete a trip that is ${trip.status}`, 409);
    }

    trip.status = 'completed';
    await trip.save();
    res.json({ message: 'Trip marked as completed', trip });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, search, mine, getMessages, getById, update, cancel, cancelSeries, completeTrip };

