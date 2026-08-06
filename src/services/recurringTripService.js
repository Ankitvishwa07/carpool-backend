const Trip = require('../models/Trip');
const { getRoute } = require('./routingService');

const GENERATE_WINDOW_DAYS = 14; // how far ahead concrete trips are materialized

// Given a recurring "template" trip, create concrete Trip instances for the
// next GENERATE_WINDOW_DAYS days that fall on the template's daysOfWeek and
// don't already exist (and aren't past `recurrence.until`).
async function generateOccurrences(templateTrip) {
  if (!templateTrip.isRecurring || !templateTrip.recurrence?.daysOfWeek?.length) {
    return [];
  }

  const { daysOfWeek, until } = templateTrip.recurrence;
  const templateHour = templateTrip.departureTime.getUTCHours();
  const templateMinute = templateTrip.departureTime.getUTCMinutes();
  const durationMs = templateTrip.returnTime
    ? templateTrip.returnTime.getTime() - templateTrip.departureTime.getTime()
    : null;

  const created = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = 1; i <= GENERATE_WINDOW_DAYS; i += 1) {
    const candidateDate = new Date(today);
    candidateDate.setUTCDate(candidateDate.getUTCDate() + i);

    if (!daysOfWeek.includes(candidateDate.getUTCDay())) continue;
    if (until && candidateDate > until) continue;

    const departureTime = new Date(candidateDate);
    departureTime.setUTCHours(templateHour, templateMinute, 0, 0);

    // skip if an occurrence for this template + date already exists
    // (prevents double-booking when the job runs more than once)
    const exists = await Trip.exists({
      seriesParentId: templateTrip._id,
      departureTime,
    });
    if (exists) continue;

    const returnTime = durationMs ? new Date(departureTime.getTime() + durationMs) : undefined;

    created.push({
      driverId: templateTrip.driverId,
      origin: templateTrip.origin,
      destination: templateTrip.destination,
      route: templateTrip.route, // reuse the snapshot, avoids re-hitting the routing API
      departureTime,
      returnTime,
      isRecurring: false, // concrete occurrences are one-off trips, not templates themselves
      seriesParentId: templateTrip._id,
      seatsTotal: templateTrip.seatsTotal,
      notes: templateTrip.notes,
    });
  }

  if (created.length === 0) return [];

  return Trip.insertMany(created);
}

// Runs across every active recurring template, generating upcoming occurrences.
async function generateAllUpcomingOccurrences() {
  const templates = await Trip.find({
    isRecurring: true,
    status: { $ne: 'cancelled' },
  });

  let totalCreated = 0;
  for (const template of templates) {
    const occurrences = await generateOccurrences(template);
    totalCreated += occurrences.length;
  }
  return totalCreated;
}

// Cancelling a whole series: cancels the template plus every future,
// not-yet-departed occurrence generated from it.
async function cancelSeries(templateId, driverId) {
  const template = await Trip.findById(templateId);
  if (!template) throw new Error('Trip not found');
  if (template.driverId.toString() !== driverId.toString()) {
    throw new Error('Not your trip');
  }

  template.status = 'cancelled';
  await template.save();

  await Trip.updateMany(
    { seriesParentId: templateId, departureTime: { $gt: new Date() }, status: { $ne: 'cancelled' } },
    { status: 'cancelled' }
  );

  return template;
}

module.exports = { generateOccurrences, generateAllUpcomingOccurrences, cancelSeries };