const jwt = require('jsonwebtoken');

// Every authenticated user is auto-joined to a private room keyed by their
// own userId as soon as they connect. notificationService.js emits into
// that room — unlike chat, there's no per-trip "join" step needed here.
function registerNotificationHandlers(io) {
  const notifNamespace = io.of('/notifications');

  notifNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  notifNamespace.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    // socket.io auto-leaves rooms on disconnect — nothing to clean up here
  });
}

module.exports = registerNotificationHandlers;