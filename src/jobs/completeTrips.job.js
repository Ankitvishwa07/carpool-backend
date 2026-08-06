const Trip = require('../models/Trip');

// A trip has definitively happened once its scheduled end time is in the
// past. We use returnTime if the driver set one (round trip), otherwise
// fall back to departureTime + COMPLETION_BUFFER_MS as a reasonable proxy
// for "the ride is over." Only 'active' or 'full' trips transition —
// cancelled trips stay cancelled.
const COMPLETION_BUFFER_MS = 2 * 60 * 60 * 1000; // 2 hours after departure

async function completeTrips() {
  const now = new Date();

  // Trips WITH a returnTime: complete once returnTime has passed
  const withReturn = await Trip.updateMany(
    {
      status: { $in: ['active', 'full'] },
      returnTime: { $lt: now },
    },
    { status: 'completed' }
  );

  // Trips WITHOUT a returnTime: complete once departureTime + buffer has passed
  const cutoff = new Date(now.getTime() - COMPLETION_BUFFER_MS);
  const withoutReturn = await Trip.updateMany(
    {
      status: { $in: ['active', 'full'] },
      returnTime: { $exists: false },
      departureTime: { $lt: cutoff },
    },
    { status: 'completed' }
  );

  const total = withReturn.modifiedCount + withoutReturn.modifiedCount;
  if (total > 0) {
    console.log(`[jobs] Marked ${total} trip(s) as completed`);
  }
}

module.exports = completeTrips;