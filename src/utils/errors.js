class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // marks "expected" errors (bad input, 404, etc.) vs real bugs
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;