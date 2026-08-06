const express = require('express');
const requireAuth = require('../middleware/auth');
const validate = require('../middleware/validate');
const requestController = require('../controllers/requestController');
const { createRequestSchema, requestIdParamSchema } = require('../validators/rideRequest.validators');

const router = express.Router();

// Rider requests a seat on a trip (supports seatsRequested, pickup/dropoff points)
router.post('/', requireAuth, validate(createRequestSchema), requestController.create);

// Driver accepts a request — transaction-safe seat booking (services/bookingService.js)
router.put('/:id/accept', requireAuth, validate(requestIdParamSchema), requestController.accept);

// Driver declines a request
router.put('/:id/decline', requireAuth, validate(requestIdParamSchema), requestController.decline);

// Rider cancels their own request — releases the seat if it was already accepted
router.put('/:id/cancel', requireAuth, validate(requestIdParamSchema), requestController.cancel);

// Get incoming requests for a driver's trips
router.get('/incoming', requireAuth, requestController.incoming);

// Get the logged-in rider's own requests
router.get('/mine', requireAuth, requestController.mine);

module.exports = router;