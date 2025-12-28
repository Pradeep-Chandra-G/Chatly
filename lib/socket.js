import { Server } from 'socket.io';

let io;

export function initSocket(server) {
  if (io) return io;

  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGINS || '*',
      methods: ['GET', 'POST']
    },
    path: '/socket.io/'
  });

  const userSockets = new Map(); // userId -> socketId mapping

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User authentication and online status
    socket.on('user:online', (userId) => {
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      socket.join(userId); // Join personal room
      
      // Broadcast online status to all connected users
      io.emit('user:status', { userId, status: 'online' });
    });

    // Typing indicators
    socket.on('typing:start', ({ conversationId, userId }) => {
      socket.to(conversationId).emit('user:typing', { userId, conversationId });
    });

    socket.on('typing:stop', ({ conversationId, userId }) => {
      socket.to(conversationId).emit('user:stop-typing', { userId, conversationId });
    });

    // Join conversation room
    socket.on('conversation:join', (conversationId) => {
      socket.join(conversationId);
    });

    // Leave conversation room
    socket.on('conversation:leave', (conversationId) => {
      socket.leave(conversationId);
    });

    // New message
    socket.on('message:send', (data) => {
      // Broadcast to conversation room
      io.to(data.conversationId).emit('message:new', data);
    });

    // Message status updates
    socket.on('message:delivered', ({ messageId, conversationId }) => {
      io.to(conversationId).emit('message:status', { messageId, status: 'delivered' });
    });

    socket.on('message:read', ({ messageId, conversationId }) => {
      io.to(conversationId).emit('message:status', { messageId, status: 'read' });
    });

    // Disconnect
    socket.on('disconnect', () => {
      if (socket.userId) {
        userSockets.delete(socket.userId);
        io.emit('user:status', { userId: socket.userId, status: 'offline' });
      }
      console.log('User disconnected:', socket.id);
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}
