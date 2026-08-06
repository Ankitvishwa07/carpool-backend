const mongoose = require('mongoose');

// Only emails from these domains can sign up — this is what makes it a
// "verified company/campus" carpool app rather than an open one.
// Keep this list in an env var in real deployments; hardcoded here for now.
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

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
      // human-readable label for display (e.g. "123 Main St"), not used in geo queries
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const RefreshTokenSchema = new mongoose.Schema(
  {
    // we store a hash of the refresh token, never the raw token
    tokenHash: { type: String, required: true },
    userAgent: { type: String },
    ip: { type: String },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (email) {
          if (ALLOWED_EMAIL_DOMAINS.length === 0) return true; // no restriction configured
          const domain = email.split('@')[1]?.toLowerCase();
          return ALLOWED_EMAIL_DOMAINS.includes(domain);
        },
        message: 'Email domain is not part of a verified company/campus community',
      },
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned by default in queries
    },

    role: {
      type: String,
      enum: ['rider', 'driver', 'admin'],
      default: 'rider',
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationTokenHash: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },

    // hashed password-reset token, mirrors the email-verification pattern above —
    // the raw token only ever exists in the emailed link, never in the DB
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },

    // --- driver-specific info ---
    car: {
      hasCar: { type: Boolean, default: false },
      make: { type: String, trim: true },
      model: { type: String, trim: true },
      color: { type: String, trim: true },
      seatsAvailable: { type: Number, min: 0, max: 8, default: 0 },
    },

    // --- locations, used by $geoNear / $near matching queries ---
    homeLocation: {
      type: GeoPointSchema,
    },
    workLocation: {
      type: GeoPointSchema,
    },

    // --- ratings, updated whenever a new Rating doc is created for this user ---
    ratingAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },

    refreshTokens: {
      type: [RefreshTokenSchema],
      default: [],
      select: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isFlagged: {
      type: Boolean,
      default: false,
    },
    
    flagReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// Geospatial indexes — required for $geoNear / $near queries used by the matching engine
UserSchema.index({ homeLocation: '2dsphere' });
UserSchema.index({ workLocation: '2dsphere' });

module.exports = mongoose.model('User', UserSchema);