const mongoose = require('mongoose');
const { Schema } = mongoose;

const ratingSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    raterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rateeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

// One rating per (trip, rater, ratee) triple — stops a rider from spamming
// five different 1-star ratings against the same driver for the same trip
ratingSchema.index({ tripId: 1, raterId: 1, rateeId: 1 }, { unique: true });

module.exports = mongoose.model('Rating', ratingSchema);