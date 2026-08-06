const RideRequest = require('../models/RideRequest');

const STALE_AFTER_MS = 48 * 60 * 60 * 1000; // 48 hours

// A rider who sends a request and never hears back shouldn't block that seat
// forever if the driver just never logs in to respond. Auto-decline old pending ones.
async function expireStaleRequests() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);

  const result = await RideRequest.updateMany(
    { status: 'pending', createdAt: { $lt: cutoff } },
    { status: 'declined', respondedAt: new Date() }
  );

  if (result.modifiedCount > 0) {
    console.log(`[jobs] Expired ${result.modifiedCount} stale pending ride request(s)`);
  }
}

module.exports = expireStaleRequests;