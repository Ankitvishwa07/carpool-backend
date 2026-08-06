// Small singleton so services (which run outside any single request/socket
// context, e.g. bookingService) can emit live events without importing the
// whole server bootstrap or passing `io` through every function call.
let ioInstance = null;

function setIO(io) {
  ioInstance = io;
}

function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.io instance not initialized yet — setIO() must run before getIO()');
  }
  return ioInstance;
}

module.exports = { setIO, getIO };