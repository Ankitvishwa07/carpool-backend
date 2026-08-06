const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Trip = require('../models/Trip');
const RideRequest = require('../models/RideRequest');
const Notification = require('../models/Notification');
const { getTripParticipantIds } = require('../utils/tripAccess');
const { notify } = require('../services/notificationService');

async function isAuthorizedForTrip(userId, tripId) {
  if (!mongoose.Types.ObjectId.isValid(tripId)) return false;

  const trip = await Trip.findById(tripId).select('driverId');
  if (!trip) return false;
  if (trip.driverId.toString() === userId.toString()) return true;

  const accepted = await RideRequest.exists({ tripId, riderId: userId, status: 'accepted' });
  return Boolean(accepted);
}

function registerChatHandlers(io) {
  const chatNamespace = io.of('/chat');

  // Authenticate socket connections using the same JWT from HTTP auth
  chatNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.authorizedTrips = new Set();
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  chatNamespace.on('connection', (socket) => {
    console.log(`User ${socket.userId} connected to chat`);

    // Client joins a room specific to one trip — only if they're the driver
    // or an accepted rider on that trip
    socket.on('join_trip', async (tripId) => {
      const authorized = await isAuthorizedForTrip(socket.userId, tripId);
      if (!authorized) {
        return socket.emit('error_message', { message: 'Not authorized for this trip' });
      }
      socket.authorizedTrips.add(tripId);
      socket.join(tripId);
    });

    // Client sends a message
    socket.on('send_message', async ({ tripId, text }) => {
      try {
        if (!text || !text.trim()) return;

        if (!socket.authorizedTrips.has(tripId)) {
          const authorized = await isAuthorizedForTrip(socket.userId, tripId);
          if (!authorized) {
            return socket.emit('error_message', { message: 'Not authorized for this trip' });
          }
          socket.authorizedTrips.add(tripId);
        }

        const message = await Message.create({ tripId, senderId: socket.userId, text: text.trim() });

        // Broadcast to everyone in that trip's room, including sender
        chatNamespace.to(tripId).emit('new_message', {
          _id: message._id,
          tripId,
          senderId: socket.userId,
          text: message.text,
          createdAt: message.createdAt,
        });

        // Also fire a persistent notification for every OTHER participant —
        // covers the case where they're not actively looking at this trip's
        // chat (or aren't connected to the socket at all right now).
        const participantIds = await getTripParticipantIds(tripId);
        const recipients = participantIds.filter((id) => id !== socket.userId.toString());

        await Promise.all(
          recipients.map((recipientId) =>
            notify({
              recipientId,
              type: Notification.TYPES.includes('new_message') ? 'new_message' : undefined,
              title: 'New message',
              body: text.trim().slice(0, 120),
              tripId,
              actorId: socket.userId,
            })
          )
        );
      } catch (err) {
        socket.emit('error_message', { message: 'Failed to send message' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User ${socket.userId} disconnected from chat`);
    });
  });
}

module.exports = registerChatHandlers;