const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('./config');

let io;

const initializeSocket = (server) => {
  io = socketIo(server, {
    cors: config.socket.cors,
    pingTimeout: config.socket.pingTimeout,
    pingInterval: config.socket.pingInterval,
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token =
      socket.handshake.auth.token ||
      (socket.handshake.headers.authorization && socket.handshake.headers.authorization.replace('Bearer ', ''));

    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      socket.userId = decoded.sub;
      socket.tenantId = decoded.tenantId;
      next();
    } catch (err) {
      return next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id} (User: ${socket.userId}, Tenant: ${socket.tenantId})`);

    // Join tenant-specific room for activity updates
    if (socket.tenantId) {
      socket.join(`tenant:${socket.tenantId}`);
      console.log(`👥 User joined tenant room: tenant:${socket.tenantId}`);
    }

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

const emitActivityUpdate = (tenantId, activityData) => {
  if (io) {
    io.to(`tenant:${tenantId}`).emit('activity-update', activityData);
    console.log(`📡 Emitted activity update to tenant:${tenantId}`);
  }
};

module.exports = {
  initializeSocket,
  getIO,
  emitActivityUpdate,
};
