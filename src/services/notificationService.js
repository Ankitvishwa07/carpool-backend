const Notification = require('../models/Notification');
const { getIO } = require('../sockets/io');

// Creates a Notification document AND pushes it live over the
// /notifications socket namespace if the recipient is currently connected.
// If they're not connected, the emit is a harmless no-op — they'll see it
// next time they call GET /api/notifications/mine.
async function notify({ recipientId, type, title, body, tripId, requestId, actorId }) {
  const notification = await Notification.create({
    recipientId,
    type,
    title,
    body,
    tripId,
    requestId,
    actorId,
  });

  try {
    const io = getIO();
    io.of('/notifications').to(`user:${recipientId}`).emit('notification', notification);
  } catch (err) {
    // io not initialized (e.g. running inside a script/test) — the DB write
    // already succeeded, so this is safe to swallow
    console.warn('[notificationService] Could not emit live notification:', err.message);
  }

  return notification;
}

module.exports = { notify };