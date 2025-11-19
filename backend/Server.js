// backend/server.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const socketIO = require('socket.io');

// App + server
const app = express();
const server = http.createServer(app);
const io = new socketIO.Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' }
});

// ---------- Configuration ----------
const PORT = parseInt(process.env.PORT, 10) || 5000;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ziva-oneroof';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ---------- Middleware ----------
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  })
);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Basic rate limiter (tweak limits for production)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// ---------- Database connection (reusable for serverless) ----------
async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    // already connected
    return;
  }

  const opts = {
    useNewUrlParser: true,
    useUnifiedTopology: true
    // For production, consider adding socketTimeoutMS, serverSelectionTimeoutMS etc.
  };

  await mongoose.connect(MONGO_URI, opts);
  console.log('✔ MongoDB connected');
}

// Try connecting at startup
connectDB().catch(err => {
  console.error('✖ MongoDB connection error:', err);
  // don't exit: server may try reconnect later (or implement retry logic)
});

// (Optional) reconnect logic for long-running processes
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Attempting reconnect...');
  setTimeout(connectDB, 2000);
});

// ---------- Routes (ensure these files exist) ----------
/*
  Create these route files under backend/routes/
  - auth.js
  - customer.js
  - barber.js
  - booking.js
  - payment.js
  - admin.js
  - analytics.js
*/
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customer', require('./routes/customer'));
app.use('/api/barber', require('./routes/barber'));
app.use('/api/booking', require('./routes/booking'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/analytics', require('./routes/analytics'));

// Serve static files if you bundle any admin or client builds into backend/public
app.use('/public', express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK', ts: new Date().toISOString() }));

// ---------- Socket.io (Real-time booking updates) ----------
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // join a booking room for updates
  socket.on('join-booking', (bookingId) => {
    if (!bookingId) return;
    socket.join(`booking-${bookingId}`);
  });

  // broadcast booking update to booking room
  socket.on('booking-update', (data) => {
    if (!data || !data.bookingId) return;
    io.to(`booking-${data.bookingId}`).emit('status-changed', data);
  });

  socket.on('disconnect', () => {
    // debug disconnect
    // console.log('Socket disconnected:', socket.id);
  });
});

// ---------- Error handling ----------
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error'
  });
});

// ---------- Graceful shutdown ----------
async function shutdown(signal) {
  console.log(`Received ${signal}. Closing server...`);
  try {
    server.close(() => {
      console.log('HTTP server closed');
    });
    // close mongoose
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ---------- Start server ----------
server.listen(PORT, async () => {
  // ensure DB connected before accepting traffic (best-effort)
  try {
    await connectDB();
  } catch (err) {
    // already logged in connectDB
  }
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`🔗 API base: http://localhost:${PORT}/api`);
});

module.exports = server;
