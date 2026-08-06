const mongoose = require('mongoose');

const GeoPointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      // [longitude, latitude] — GeoJSON order, NOT lat/lng
      type: [Number],
      required: true,
      validate: {
        validator: (coords) => coords.length === 2,
        message: 'coordinates must be [longitude, latitude]',
      },
    },
    address: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

// Snapshot of the driver's route as a GeoJSON LineString, so the matching
// engine can measure a rider's detour distance against the actual path
// (via the routing API), not just straight-line origin/destination.
const RouteSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['LineString'],
      default: 'LineString',
    },
    coordinates: {
      // array of [lng, lat] pairs, e.g. from OpenRouteService directions response
      type: [[Number]],
      default: undefined,
    },
    distanceMeters: Number,
    durationSeconds: Number,
  },
  { _id: false }
);

const RecurrencePatternSchema = new mongoose.Schema(
  {
    // days of week this trip repeats on: 0 = Sunday ... 6 = Saturday
    daysOfWeek: {
      type: [Number],
      validate: {
        validator: (arr) => arr.every((d) => d >= 0 && d <= 6),
        message: 'daysOfWeek entries must be 0-6',
      },
      default: [],
    },
    // last date (inclusive) this recurring series generates trips for
    until: {
      type: Date,
    },
  },
  { _id: false }
);

const TripSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    origin: {
      type: GeoPointSchema,
      required: true,
    },
    destination: {
      type: GeoPointSchema,
      required: true,
    },

    returnTime: {
      type: Date,
    },
    
    route: {
      type: RouteSchema,
    },

    // the actual calendar date+time this specific trip departs
    departureTime: {
      type: Date,
      required: true,
      index: true,
    },
    // rough estimated arrival, used for time-window overlap matching against riders
    estimatedArrivalTime: {
      type: Date,
    },

    seatsTotal: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    seatsBooked: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ['active', 'full', 'completed', 'cancelled'],
      default: 'active',
      index: true,
    },

    // --- recurring trips ---
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrence: {
      type: RecurrencePatternSchema,
    },
    // if this trip was generated from a recurring series, points back to the
    // original "template" trip so the series can be edited/cancelled together
    seriesParentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// Geospatial indexes for $geoNear / $near proximity matching
TripSchema.index({ origin: '2dsphere' });
TripSchema.index({ destination: '2dsphere' });

// Common compound query: "active trips departing around this time"
TripSchema.index({ status: 1, departureTime: 1 });

// Keeps seatsBooked in bounds — belt-and-suspenders alongside the
// transaction-safe booking logic that will live in the service layer
TripSchema.pre('save', function (next) {
  if (this.seatsBooked > this.seatsTotal) {
    return next(new Error('seatsBooked cannot exceed seatsTotal'));
  }
  next();
});

module.exports = mongoose.model('Trip', TripSchema);