const express = require('express');
const { z } = require('zod');
const requireAuth = require('../middleware/auth');
const validate = require('../middleware/validate');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

const idParamSchema = z.object({
  params: z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format') }),
});

router.get('/mine', requireAuth, notificationController.mine);
router.put('/:id/read', requireAuth, validate(idParamSchema), notificationController.markRead);
router.put('/read-all', requireAuth, notificationController.markAllRead);

module.exports = router;