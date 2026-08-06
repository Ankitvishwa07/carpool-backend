const express = require('express');
const authLimiter = require('../middleware/rateLimiter');
const requireAuth = require('../middleware/auth');
const validate = require('../middleware/validate');
const authController = require('../controllers/authController');
const {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../validators/auth.validators');

const router = express.Router();

router.post('/signup', authLimiter, validate(signupSchema), authController.signup);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.get('/verify-email', authController.verifyEmail);
router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);
router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);
router.put('/profile', requireAuth, authController.updateProfile);

module.exports = router;