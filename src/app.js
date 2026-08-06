const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const authRoutes = require('./routes/auth.routes');
const tripRoutes = require('./routes/trip.routes');
const rideRequestRoutes = require('./routes/rideRequest.routes');
const ratingRoutes = require('./routes/rating.routes');
const notificationRoutes = require('./routes/notification.routes');
const userRoutes = require('./routes/user.routes');
const adminRoutes = require('./routes/admin.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Pure Express app — no DB connection, no cron jobs, no .listen(), no
// socket.io server. This is what Supertest imports directly in tests, and
// what server.js wraps with all the runtime bootstrapping.
const app = express();

app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running' });
});

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(mongoSanitize());

app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/requests', rideRequestRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;