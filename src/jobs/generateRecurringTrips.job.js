const { generateAllUpcomingOccurrences } = require('../services/recurringTripService');

// Materializes concrete Trip documents from recurring templates so they show
// up in search/matching. Safe to run repeatedly — generateOccurrences skips
// dates that already have a Trip.
async function generateRecurringTrips() {
  const count = await generateAllUpcomingOccurrences();
  if (count > 0) {
    console.log(`[jobs] Generated ${count} recurring trip occurrence(s)`);
  }
}

module.exports = generateRecurringTrips;