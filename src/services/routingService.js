const { getRedisClient } = require('../utils/redisClient');
const { getDistanceMeters } = require('../utils/geo');

// /geojson variant returns raw [lng, lat] coordinates directly, so we don't
// need an extra polyline-decoding dependency.
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 1 day — road networks don't change that often

function roundCoord(n) {
  return Math.round(n * 1000) / 1000; // ~110m precision, keeps cache hit rate high for nearby queries
}

function cacheKeyForRoute(coordsList) {
  return `route:${coordsList.map(([lng, lat]) => `${roundCoord(lng)},${roundCoord(lat)}`).join('|')}`;
}

// Falls back to a straight-line haversine estimate (×1.3 to roughly account
// for real road curvature) if no ORS_API_KEY is configured or the API call
// fails — so the app degrades gracefully instead of erroring out when the
// external routing provider is unavailable.
function haversineFallback(coordsList) {
  let distanceMeters = 0;
  for (let i = 0; i < coordsList.length - 1; i++) {
    const [lng1, lat1] = coordsList[i];
    const [lng2, lat2] = coordsList[i + 1];
    distanceMeters += getDistanceMeters(lat1, lng1, lat2, lng2);
  }
  distanceMeters *= 1.3;
  const AVERAGE_SPEED_MPS = 12.5; // ~45 km/h average city driving

  return {
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: Math.round(distanceMeters / AVERAGE_SPEED_MPS),
    coordinates: coordsList,
    estimated: true,
  };
}

/**
 * Gets a driving route through an ordered list of [lng, lat] waypoints.
 * Needs at least 2 points. Cached in Redis since a real ORS call costs API
 * quota and adds latency, and most searches re-query near-identical
 * origin/destination pairs.
 */
async function getRoute(coordsList) {
  if (!coordsList || coordsList.length < 2) {
    throw new Error('getRoute requires at least 2 waypoints');
  }

  if (!process.env.ORS_API_KEY) {
    return haversineFallback(coordsList);
  }

  const cacheKey = cacheKeyForRoute(coordsList);

  try {
    const redis = await getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.warn('[routingService] Redis unavailable, skipping cache read:', err.message);
  }

  try {
    const response = await fetch(ORS_URL, {
      method: 'POST',
      headers: {
        Authorization: process.env.ORS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ coordinates: coordsList }),
    });

    if (!response.ok) {
      throw new Error(`ORS responded with ${response.status}`);
    }

    const data = await response.json();
    const feature = data.features?.[0];
    if (!feature) throw new Error('ORS returned no route');

    const result = {
      distanceMeters: Math.round(feature.properties.summary.distance),
      durationSeconds: Math.round(feature.properties.summary.duration),
      coordinates: feature.geometry.coordinates,
      estimated: false,
    };

    try {
      const redis = await getRedisClient();
      await redis.set(cacheKey, JSON.stringify(result), { EX: CACHE_TTL_SECONDS });
    } catch (err) {
      console.warn('[routingService] Failed to write cache:', err.message);
    }

    return result;
  } catch (err) {
    console.warn('[routingService] ORS request failed, falling back to estimate:', err.message);
    return haversineFallback(coordsList);
  }
}

/**
 * Detour cost of adding a rider pickup/dropoff to a driver's direct route.
 * Always >= 0 — picking someone up never actually shortens the trip.
 */
async function getDetour({ driverOrigin, driverDestination, riderPickup, riderDropoff }) {
  const directRoute = await getRoute([driverOrigin, driverDestination]);
  const withRiderRoute = await getRoute([driverOrigin, riderPickup, riderDropoff, driverDestination]);

  return {
    directRoute,
    withRiderRoute,
    detourMeters: Math.max(0, withRiderRoute.distanceMeters - directRoute.distanceMeters),
    detourSeconds: Math.max(0, withRiderRoute.durationSeconds - directRoute.durationSeconds),
  };
}

module.exports = { getRoute, getDetour };