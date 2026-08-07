// Haversine formula: straight-line distance between two lat/lng points, in meters
function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Difference in minutes between a "HH:MM" time-of-day string (what a rider
// searches with) and a trip's actual departureTime (a full Date) — compares
// time-of-day only, ignoring the calendar date.
function getTimeDiffMinutes(hhmm, departureDate) {
  if (!hhmm || !departureDate) return 0;
  const [h1, m1] = hhmm.split(':').map(Number);
  const d = new Date(departureDate);
  if (isNaN(d.getTime())) return 0;
  const tripMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return Math.abs(h1 * 60 + m1 - tripMinutes);
}

module.exports = { getDistanceMeters, getTimeDiffMinutes };