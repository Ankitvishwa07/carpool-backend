const User = require('../models/User');
const { hashPassword, comparePassword } = require('../utils/password');
const { isAllowedEmailDomain } = require('../utils/emailDomain');
const generateRandomToken = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');
const { generateAccessToken, generateRefreshToken, hashToken } = require('../utils/token');
const AppError = require('../utils/errors');

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_SESSIONS_PER_USER = 5; // cap concurrent devices, prune oldest first

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: REFRESH_TOKEN_TTL_MS,
  path: '/api/auth',
};

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  isEmailVerified: user.isEmailVerified,
});

const fullProfile = (user) => ({
  ...publicUser(user),
  homeLocation: user.homeLocation,
  workLocation: user.workLocation,
  car: user.car,
  ratingAverage: user.ratingAverage,
  ratingCount: user.ratingCount,
});

// Issues a fresh access token AND appends a new hashed refresh-token session
// entry (one per device/browser), pruning expired/oldest ones so the array
// doesn't grow unbounded. Requires `user` to have been loaded with
// `.select('+refreshTokens')`.
async function issueTokens(user, req, res) {
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken();

  const now = Date.now();
  user.refreshTokens = (user.refreshTokens || []).filter((t) => t.expiresAt.getTime() > now);

  if (user.refreshTokens.length >= MAX_SESSIONS_PER_USER) {
    user.refreshTokens.sort((a, b) => a.createdAt - b.createdAt);
    user.refreshTokens.shift(); // drop the oldest session
  }

  user.refreshTokens.push({
    tokenHash: hashToken(refreshToken),
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
  });

  await user.save();

  res.cookie('refreshToken', refreshToken, refreshCookieOptions);
  return accessToken;
}

// POST /auth/signup
async function signup(req, res, next) {
  try {
    const { name, email, password, role } = req.body;

    if (!isAllowedEmailDomain(email)) {
      throw new AppError('Only company/campus emails are allowed to sign up', 403);
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError('Email already registered', 409);
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = generateRandomToken();

    const user = await User.create({
      name,
      email,
      passwordHash,
      role,
      emailVerificationTokenHash: hashToken(verificationToken),
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
    });

    const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Verify your email',
      html: `<p>Hi ${user.name}, click below to verify your email:</p>
             <a href="${verifyUrl}">${verifyUrl}</a>`,
    });

    res.status(201).json({
      message: 'Signup successful. Please check your email to verify your account.',
      user: publicUser(user),
    });
  } catch (err) {
    next(err);
  }
}

// POST /auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+passwordHash +refreshTokens');
    if (!user) throw new AppError('Invalid email or password', 401);

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) throw new AppError('Invalid email or password', 401);

    if (user.isActive === false) throw new AppError('This account has been disabled', 403);

    const accessToken = await issueTokens(user, req, res);

    res.json({
      message: 'Login successful',
      token: accessToken,
      user: publicUser(user),
    });
  } catch (err) {
    next(err);
  }
}

// POST /auth/refresh — exchange a valid refresh cookie for a new access
// token, rotating that session's refresh token (old one is removed, a new
// one takes its place).
async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) throw new AppError('No refresh token provided', 401);

    const tokenHash = hashToken(refreshToken);
    const user = await User.findOne({ 'refreshTokens.tokenHash': tokenHash }).select(
      '+refreshTokens'
    );

    if (!user) {
      res.clearCookie('refreshToken', { path: '/api/auth' });
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const session = user.refreshTokens.find((t) => t.tokenHash === tokenHash);
    if (!session || session.expiresAt.getTime() < Date.now()) {
      res.clearCookie('refreshToken', { path: '/api/auth' });
      throw new AppError('Invalid or expired refresh token', 401);
    }

    if (user.isActive === false) throw new AppError('This account has been disabled', 403);

    // remove the used session before issuing its replacement (rotation)
    user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);

    const accessToken = await issueTokens(user, req, res);

    res.json({ token: accessToken });
  } catch (err) {
    next(err);
  }
}

// POST /auth/logout — logs out the CURRENT device only
async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await User.updateOne(
        { 'refreshTokens.tokenHash': tokenHash },
        { $pull: { refreshTokens: { tokenHash } } }
      );
    }
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

// GET /auth/me
async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) throw new AppError('User not found', 404);

    res.json({ user: fullProfile(user) });
  } catch (err) {
    next(err);
  }
}

// GET /auth/verify-email
async function verifyEmail(req, res, next) {
  try {
    const { token } = req.query;
    if (!token) throw new AppError('Token is required', 400);

    const user = await User.findOne({
      emailVerificationTokenHash: hashToken(token),
      emailVerificationExpires: { $gt: Date.now() },
    }).select('+emailVerificationTokenHash +emailVerificationExpires');
    if (!user) throw new AppError('Invalid or expired verification link', 400);

    user.isEmailVerified = true;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
}

// POST /auth/forgot-password
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always return the same response whether or not the email exists,
    // so this endpoint can't be used to enumerate registered accounts.
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent' });
    }

    const resetToken = generateRandomToken();
    user.passwordResetTokenHash = hashToken(resetToken);
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Reset your password',
      html: `<p>Click below to reset your password. This link expires in 1 hour.</p>
             <a href="${resetUrl}">${resetUrl}</a>`,
    });

    res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (err) {
    next(err);
  }
}

// POST /auth/reset-password
async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;

    const user = await User.findOne({
      passwordResetTokenHash: hashToken(token),
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetTokenHash +passwordResetExpires +refreshTokens');
    if (!user) throw new AppError('Invalid or expired reset link', 400);

    user.passwordHash = await hashPassword(newPassword);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    // Kill every existing session on every device — forces re-login everywhere
    user.refreshTokens = [];
    await user.save();

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    next(err);
  }
}

// PUT /auth/profile
async function updateProfile(req, res, next) {
  try {
    const { homeLocation, workLocation, hasCar, seatsAvailable, make, model, color } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) throw new AppError('User not found', 404);

    if (homeLocation) {
      user.homeLocation = {
        type: 'Point',
        coordinates: [homeLocation.lng, homeLocation.lat],
        address: homeLocation.address,
      };
    }
    if (workLocation) {
      user.workLocation = {
        type: 'Point',
        coordinates: [workLocation.lng, workLocation.lat],
        address: workLocation.address,
      };
    }

    // car info is nested on the schema — update the sub-fields in place
    // rather than overwriting the whole object, so partial updates work
    user.car = user.car || {};
    if (hasCar !== undefined) user.car.hasCar = hasCar;
    if (seatsAvailable !== undefined) user.car.seatsAvailable = seatsAvailable;
    if (make !== undefined) user.car.make = make;
    if (model !== undefined) user.car.model = model;
    if (color !== undefined) user.car.color = color;

    await user.save();
    res.json({ message: 'Profile updated', user: fullProfile(user) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  signup,
  login,
  refresh,
  logout,
  me,
  verifyEmail,
  forgotPassword,
  resetPassword,
  updateProfile,
};