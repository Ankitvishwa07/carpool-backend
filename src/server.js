require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const registerChatHandlers = require('./sockets/chat');
const registerNotificationHandlers = require('./sockets/notifications');
const { setIO } = require('./sockets/io');
const startJobs = require('./jobs');

const PORT = process.env.PORT || 5000;

connectDB();
startJobs();

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL, credentials: true },
});

setIO(io); // must run before any bookingService/rating/chat code can notify()
registerChatHandlers(io);
registerNotificationHandlers(io);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});