const express = require("express");
const mongoose = require("mongoose");
const Rating = require("../models/Rating");
const Trip = require("../models/Trip");
const RideRequest = require("../models/RideRequest");
const User = require("../models/User");
const requireAuth = require("../middleware/auth");
const validate = require("../middleware/validate");
const AppError = require("../utils/errors");
const {
  createRatingSchema,
  userIdParamSchema,
} = require("../validators/rating.validators");
const { notify } = require("../services/notificationService");

const router = express.Router();

// Recompute a user's denormalized rating fields from the Rating collection.
// Called after every new rating instead of storing a running average, so a
// single buggy write can never drift the aggregate out of sync with reality.
async function recomputeAggregate(userId) {
  const [result] = await Rating.aggregate([
    { $match: { rateeId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: { _id: "$rateeId", avg: { $avg: "$stars" }, count: { $sum: 1 } },
    },
  ]);

  await User.findByIdAndUpdate(userId, {
    ratingAverage: result ? Math.round(result.avg * 10) / 10 : 0,
    ratingCount: result ? result.count : 0,
  });
}

// Submit a rating after a trip is completed. Either the driver rates a rider
// they accepted, or an accepted rider rates the driver — both directions use
// this same endpoint, distinguished only by who's calling it.

router.post(
  "/",
  requireAuth,
  validate(createRatingSchema),
  async (req, res, next) => {
    try {
      const { tripId, rateeId, stars, comment } = req.body;

      if (rateeId === req.userId.toString()) {
        throw new AppError("You can't rate yourself", 400);
      }

      const trip = await Trip.findById(tripId);
      if (!trip) throw new AppError("Trip not found", 404);
      if (trip.status !== "completed") {
        throw new AppError(
          "Trip must be completed before it can be rated",
          400,
        );
      }

      const isDriver = trip.driverId.toString() === req.userId.toString();
      const isRateeDriver = trip.driverId.toString() === rateeId;

      if (isDriver) {
        const accepted = await RideRequest.findOne({
          tripId,
          riderId: rateeId,
          status: "accepted",
        });
        if (!accepted)
          throw new AppError("That rider was not part of this trip", 403);
      } else if (isRateeDriver) {
        const accepted = await RideRequest.findOne({
          tripId,
          riderId: req.userId,
          status: "accepted",
        });
        if (!accepted)
          throw new AppError("You were not part of this trip", 403);
      } else {
        throw new AppError(
          "You are not eligible to rate this way for this trip",
          403,
        );
      }

      const rating = await Rating.create({
        tripId,
        raterId: req.userId,
        rateeId,
        stars,
        comment,
      });
      await recomputeAggregate(rateeId);

      await notify({
        recipientId: rateeId,
        type: "rating_received",
        title: "You received a new rating",
        body: `You were rated ${stars} star(s)`,
        tripId,
        actorId: req.userId,
      });

      res.status(201).json({ message: "Rating submitted", rating });
    } catch (err) {
      if (err.code === 11000) {
        return next(
          new AppError("You already rated this person for this trip", 409),
        );
      }
      next(err);
    }
  },
);

router.get(
  "/user/:userId",
  requireAuth,
  validate(userIdParamSchema),
  async (req, res, next) => {
    try {
      const ratings = await Rating.find({ rateeId: req.params.userId })
        .sort({ createdAt: -1 })
        .populate("raterId", "name")
        .populate("tripId", "origin destination departureTime");

      res.json({ ratings });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
