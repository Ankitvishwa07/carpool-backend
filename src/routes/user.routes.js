const express = require('express');
const requireAuth = require('../middleware/auth');
const validate = require('../middleware/validate');
const userController = require('../controllers/userController');
const { userIdParamSchema } = require('../validators/user.validators');

const router = express.Router();

router.get('/:id', requireAuth, validate(userIdParamSchema), userController.getById);

module.exports = router;