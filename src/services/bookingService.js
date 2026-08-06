const mongoose = require('mongoose');
const Trip = require('../models/Trip');
const RideRequest = require('../models/RideRequest');
const { notify } = require('./notificationService');

class BookingError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'BookingError';
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

async function createRequest({ tripId, riderId, seatsRequested = 1, matchMeta, pickup, dropoff }) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw new BookingError('Trip not found', 404);
  if (trip.status !== 'active') throw new BookingError('Trip is not open for requests', 409);
  if (String(trip.driverId) === String(riderId)) {
    throw new BookingError('Driver cannot request their own trip', 400);
  }
  if (trip.seatsTotal - trip.seatsBooked < seatsRequested) {
    throw new BookingError('Not enough seats available', 409);
  }

  let request;
  try {
    request = await RideRequest.create({
      tripId,
      riderId,
      seatsRequested,
      matchMeta,
      pickup,
      dropoff,
      status: 'pending',
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new BookingError('You already have an active request for this trip', 409);
    }
    throw err;
  }

  await notify({
    recipientId: trip.driverId,
    type: 'request_received',
    title: 'New ride request',
    body: `You have a new request for ${seatsRequested} seat(s) on your trip`,
    tripId,
    requestId: request._id,
    actorId: riderId,
  });

  return request;
}

async function acceptRequest({ requestId, driverId }) {
  const session = await mongoose.startSession();
  try {
    let updatedRequest;

    await session.withTransaction(async () => {
      const request = await RideRequest.findById(requestId).session(session);
      if (!request) throw new BookingError('Request not found', 404);
      if (request.status !== 'pending') {
        throw new BookingError(`Request is already ${request.status}`, 409);
      }

      const trip = await Trip.findById(request.tripId).session(session);
      if (!trip) throw new BookingError('Trip not found', 404);
      if (String(trip.driverId) !== String(driverId)) {
        throw new BookingError('Only the driver can accept requests on this trip', 403);
      }
      if (trip.status !== 'active') {
        throw new BookingError('Trip is no longer accepting riders', 409);
      }

      const seatsRemaining = trip.seatsTotal - trip.seatsBooked;
      if (seatsRemaining < request.seatsRequested) {
        throw new BookingError('Not enough seats remaining to accept this request', 409);
      }

      trip.seatsBooked += request.seatsRequested;
      if (trip.seatsBooked >= trip.seatsTotal) {
        trip.status = 'full';
      }
      await trip.save({ session });

      request.status = 'accepted';
      request.respondedAt = new Date();
      await request.save({ session });

      updatedRequest = request;
    });

    // notify AFTER the transaction commits — never notify on a state change
    // that might still get rolled back
    await notify({
      recipientId: updatedRequest.riderId,
      type: 'request_accepted',
      title: 'Ride request accepted',
      body: 'Your ride request was accepted by the driver',
      tripId: updatedRequest.tripId,
      requestId: updatedRequest._id,
      actorId: driverId,
    });

    return updatedRequest;
  } finally {
    await session.endSession();
  }
}

async function declineRequest({ requestId, driverId }) {
  const request = await RideRequest.findById(requestId);
  if (!request) throw new BookingError('Request not found', 404);
  if (request.status !== 'pending') {
    throw new BookingError(`Request is already ${request.status}`, 409);
  }

  const trip = await Trip.findById(request.tripId);
  if (!trip || String(trip.driverId) !== String(driverId)) {
    throw new BookingError('Only the driver can decline requests on this trip', 403);
  }

  request.status = 'declined';
  request.respondedAt = new Date();
  await request.save();

  await notify({
    recipientId: request.riderId,
    type: 'request_declined',
    title: 'Ride request declined',
    body: 'Your ride request was declined by the driver',
    tripId: request.tripId,
    requestId: request._id,
    actorId: driverId,
  });

  return request;
}

async function cancelRequest({ requestId, userId }) {
  const session = await mongoose.startSession();
  try {
    let updatedRequest;
    let driverIdToNotify = null;

    await session.withTransaction(async () => {
      const request = await RideRequest.findById(requestId).session(session);
      if (!request) throw new BookingError('Request not found', 404);
      if (String(request.riderId) !== String(userId)) {
        throw new BookingError('Only the rider can cancel their own request', 403);
      }
      if (!['pending', 'accepted'].includes(request.status)) {
        throw new BookingError(`Request is already ${request.status}`, 409);
      }

      const wasAccepted = request.status === 'accepted';

      request.status = 'cancelled';
      request.respondedAt = new Date();
      request.cancelledBy = userId;
      await request.save({ session });

      if (wasAccepted) {
        const trip = await Trip.findById(request.tripId).session(session);
        if (trip) {
          trip.seatsBooked = Math.max(0, trip.seatsBooked - request.seatsRequested);
          if (trip.status === 'full' && trip.seatsBooked < trip.seatsTotal) {
            trip.status = 'active';
          }
          await trip.save({ session });
          driverIdToNotify = trip.driverId;
        }
      }

      updatedRequest = request;
    });

    if (driverIdToNotify) {
      await notify({
        recipientId: driverIdToNotify,
        type: 'request_cancelled',
        title: 'Rider cancelled',
        body: 'A rider cancelled their accepted seat on your trip',
        tripId: updatedRequest.tripId,
        requestId: updatedRequest._id,
        actorId: userId,
      });
    }

    return updatedRequest;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  BookingError,
  createRequest,
  acceptRequest,
  declineRequest,
  cancelRequest,
};