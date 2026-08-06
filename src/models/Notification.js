const mongoose = require('mongoose');
const { Schema } = mongoose;

const NOTIFICATION_TYPES = [
  'request_received',
  'request_accepted',
  'request_declined',
  'request_cancelled',
  'new_message',
  'rating_received',
  'trip_cancelled',
];

const notificationSchema = new Schema(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip' },
    requestId: { type: Schema.Types.ObjectId, ref: 'RideRequest' },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' }, // who triggered this event
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
Notification.TYPES = NOTIFICATION_TYPES;

module.exports = Notification;