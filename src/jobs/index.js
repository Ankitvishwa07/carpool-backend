const cron = require('node-cron');
const expireStaleRequests = require('./expireStaleRequests.job');
const generateRecurringTrips = require('./generateRecurringTrips.job');
const completeTrips = require('./completeTrips.job');

function startJobs() {
  // Every hour, on the hour
  cron.schedule('0 * * * *', () => {
    expireStaleRequests().catch((err) => console.error('[jobs] expireStaleRequests failed:', err));
  });

  // Every 15 minutes — mark trips complete once they've actually happened,
  // so the ratings flow (which requires status === 'completed') unblocks
  // promptly instead of sitting stale for up to an hour
  cron.schedule('*/15 * * * *', () => {
    completeTrips().catch((err) => console.error('[jobs] completeTrips failed:', err));
  });

  // Once a day at 02:00 — materialize the next window of recurring trip occurrences
  cron.schedule('0 2 * * *', () => {
    generateRecurringTrips().catch((err) => console.error('[jobs] generateRecurringTrips failed:', err));
  });

  console.log('[jobs] Scheduled jobs started');
}

module.exports = startJobs;