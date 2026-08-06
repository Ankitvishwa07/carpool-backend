// src/utils/tripAccess.js
const Trip = require('../models/Trip');
const RideRequest = require('../models/RideRequest');

// Returns true if userId is allowed in this trip's chat:
// either the driver, or a rider whose request was accepted.
async function isTripParticipant(tripId, userId) {
  const trip = await Trip.findById(tripId);
  if (!trip) return false;

  if (trip.driverId.toString() === userId.toString()) return true;

  const acceptedRequest = await RideRequest.findOne({
    tripId,
    riderId: userId,
    status: 'accepted',
  });

  return !!acceptedRequest;
}

// All userIds allowed in a trip's chat: the driver plus every accepted
// rider. Used to fan out chat notifications to everyone except the sender.
async function getTripParticipantIds(tripId) {
  const trip = await Trip.findById(tripId).select('driverId');
  if (!trip) return [];

  const acceptedRiderIds = await RideRequest.find({ tripId, status: 'accepted' }).distinct(
    'riderId'
  );

  return [trip.driverId.toString(), ...acceptedRiderIds.map((id) => id.toString())];
}

module.exports = { isTripParticipant, getTripParticipantIds };