const Trip = require('../models/Trip');
const { getDistanceMeters, getTimeDiffMinutes } = require('../utils/geo');
const { getDetour } = require('./routingService');

// Cap how many candidates get the real (slower, quota-limited) routing-API
// detour calculation — the rest fall back to a straight-line-only score.
// Keeps a search fast even when hundreds of trips match the geo/time filter.
const MAX_ROUTED_CANDIDATES = 10;

/**
 * Finds and ranks candidate trips for a rider.
 */
async function findMatches({
  originLat,
  originLng,
  destLat,
  destLng,
  time,
  radiusKm = 5,
  windowMinutes = 30,
  riderPickup, // optional [lng, lat] — defaults to origin if omitted
  riderDropoff, // optional [lng, lat] — defaults to destination if omitted
}) {
  const radiusMeters = radiusKm * 1000;

  // Step 1: geo filter (DB-level, uses 2dsphere index)
  const candidates = await Trip.find({
    status: 'active',
    origin: {
      $near: {
        $geometry: { type: 'Point', coordinates: [originLng, originLat] },
        $maxDistance: radiusMeters,
      },
    },
  }).populate('driverId', 'name ratingAverage');

  // Step 2: destination filter + time overlap filter (cheap, in-memory)
  const filtered = candidates
    .map((trip) => {
      const destDistance = getDistanceMeters(
        destLat,
        destLng,
        trip.destination.coordinates[1],
        trip.destination.coordinates[0]
      );
      const originDistance = getDistanceMeters(
        originLat,
        originLng,
        trip.origin.coordinates[1],
        trip.origin.coordinates[0]
      );
      return { trip, destDistance, originDistance };
    })
    .filter(({ destDistance }) => destDistance <= radiusMeters)
    .filter(({ trip }) => {
      if (!time) return true;
      return getTimeDiffMinutes(time, trip.departureTime) <= windowMinutes;
    });

  filtered.sort((a, b) => a.originDistance - b.originDistance);
  const routedCandidates = filtered.slice(0, MAX_ROUTED_CANDIDATES);
  const unroutedCandidates = filtered.slice(MAX_ROUTED_CANDIDATES);

  const pickup = riderPickup || [originLng, originLat];
  const dropoff = riderDropoff || [destLng, destLat];

  // Step 3: real detour scoring for the closest candidates only
  const scoredRouted = await Promise.all(
    routedCandidates.map(async ({ trip, originDistance }) => {
      let detourMeters = null;

      try {
        const detour = await getDetour({
          driverOrigin: trip.origin.coordinates,
          driverDestination: trip.destination.coordinates,
          riderPickup: pickup,
          riderDropoff: dropoff,
        });
        detourMeters = detour.detourMeters;
      } catch (err) {
        console.warn('[matchingService] Detour calc failed, using distance-only score:', err.message);
      }

      return buildScoredResult(trip, originDistance, detourMeters);
    })
  );

  const scoredUnrouted = unroutedCandidates.map(({ trip, originDistance }) =>
    buildScoredResult(trip, originDistance, null)
  );

  const scored = [...scoredRouted, ...scoredUnrouted];
  scored.sort((a, b) => a.matchScore - b.matchScore); // lower = better match

  return scored;
}

// Weighted score: closer pickup, higher driver rating, and smaller detour
// all pull the score DOWN (lower = better). Distances are scaled to km;
// rating is 0-5, scaled up to be comparable in magnitude.
function buildScoredResult(trip, originDistanceMeters, detourMeters) {
  const rating = trip.driverId?.ratingAverage || 0;
  const detourComponent = detourMeters !== null ? detourMeters / 1000 : originDistanceMeters / 1000;

  const matchScore = originDistanceMeters / 1000 + detourComponent * 0.5 - rating * 2;

  return {
    ...trip.toObject(),
    matchDistanceMeters: Math.round(originDistanceMeters),
    detourMeters,
    matchScore: Math.round(matchScore * 100) / 100,
  };
}

module.exports = { findMatches };