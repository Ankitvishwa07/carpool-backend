const mongoose = require('mongoose');

const RideRequestSchema = new mongoose.Schema(
  {
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
      index: true,
    },
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'cancelled'],
      default: 'pending',
      index: true,
    },

    seatsRequested: {
      type: Number,
      default: 1,
      min: 1,
      max: 8,
    },

    // filled in by the matching engine at request-creation time, so the
    // request list can display "why this was a good match" without
    // recomputing distance/detour on every page load
    matchMeta: {
      distanceMeters: Number, // straight-line rider-origin -> trip-origin distance
      detourMeters: Number, // extra distance the driver would travel to pick up/drop off this rider
      detourSeconds: Number,
    },

    // pickup/dropoff points for this specific rider along the driver's route
    // (may differ from the driver's own origin/destination)
    pickup: {
      type: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number] },
        address: String,
      },
      _id: false,
    },
    dropoff: {
      type: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number] },
        address: String,
      },
      _id: false,
    },

    respondedAt: {
      type: Date,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// A rider shouldn't be able to spam multiple simultaneous pending/accepted
// requests onto the same trip — one live request per (trip, rider) pair.
RideRequestSchema.index(
  { tripId: 1, riderId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['pending', 'accepted'] } },
  }
);

// Common query: "all pending/accepted requests for trips I drive"
RideRequestSchema.index({ tripId: 1, status: 1 });

module.exports = mongoose.model('RideRequest', RideRequestSchema);