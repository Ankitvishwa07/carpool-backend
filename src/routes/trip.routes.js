const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const tripController = require('../controllers/tripController');
const {
  createTripSchema,
  updateTripSchema,
  tripIdParamSchema,
  searchTripsSchema,
} = require('../validators/trip.validators');

const router = express.Router();

router.post(
  '/',
  requireAuth,
  requireRole('driver', 'admin'),
  validate(createTripSchema),
  tripController.create
);
router.get('/', requireAuth, validate(searchTripsSchema), tripController.search);
router.get('/mine', requireAuth, tripController.mine);
router.get('/:id/messages', requireAuth, validate(tripIdParamSchema), tripController.getMessages);
router.get('/:id', requireAuth, validate(tripIdParamSchema), tripController.getById);
router.put('/:id', requireAuth, validate(updateTripSchema), tripController.update);
router.delete('/:id', requireAuth, validate(tripIdParamSchema), tripController.cancel);
router.delete('/:id/series', requireAuth, validate(tripIdParamSchema), tripController.cancelSeries);
router.put('/:id/complete', requireAuth, validate(tripIdParamSchema), tripController.completeTrip);

module.exports = router;