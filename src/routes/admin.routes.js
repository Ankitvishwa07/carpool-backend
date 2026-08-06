const express = require('express');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const adminController = require('../controllers/adminController');
const {
  userIdParamSchema,
  flagUserSchema,
  listUsersQuerySchema,
} = require('../validators/admin.validators');

const router = express.Router();

// Every route below requires an authenticated admin
router.use(requireAuth, requireRole('admin'));

router.get('/users', validate(listUsersQuerySchema), adminController.listUsers);
router.put('/users/:id/flag', validate(flagUserSchema), adminController.flagUser);
router.put('/users/:id/unflag', validate(userIdParamSchema), adminController.unflagUser);
router.put('/users/:id/disable', validate(userIdParamSchema), adminController.disableUser);
router.put('/users/:id/enable', validate(userIdParamSchema), adminController.enableUser);
router.get('/analytics', adminController.analytics);

module.exports = router;