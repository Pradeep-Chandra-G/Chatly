const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    path: '/socket.io/'
  });

  const userSockets = new Map();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('user:online', (userId) => {
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      socket.join(userId);
      io.emit('user:status', { userId, status: 'online' });
    });

    socket.on('typing:start', ({ conversationId, userId }) => {
      socket.to(conversationId).emit('user:typing', { userId, conversationId });
    });

    socket.on('typing:stop', ({ conversationId, userId }) => {
      socket.to(conversationId).emit('user:stop-typing', { userId, conversationId });
    });

    socket.on('conversation:join', (conversationId) => {
      socket.join(conversationId);
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(conversationId);
    });

    socket.on('message:send', (data) => {
      io.to(data.conversationId).emit('message:new', data);
    });

    socket.on('message:delivered', ({ messageId, conversationId }) => {
      io.to(conversationId).emit('message:status', { messageId, status: 'delivered' });
    });

    socket.on('message:read', ({ messageId, conversationId }) => {
      io.to(conversationId).emit('message:status', { messageId, status: 'read' });
    });

    // WebRTC Signaling Events
    socket.on('call:initiate', ({ callId, receiverId, type, offer }) => {
      const receiverSocket = userSockets.get(receiverId);
      if (receiverSocket) {
        io.to(receiverSocket).emit('call:incoming', {
          callId,
          callerId: socket.userId,
          type,
          offer
        });
      }
    });

    socket.on('call:answer', ({ callId, callerId, answer }) => {
      const callerSocket = userSockets.get(callerId);
      if (callerSocket) {
        io.to(callerSocket).emit('call:answered', { callId, answer });
      }
    });

    socket.on('call:ice-candidate', ({ targetId, candidate }) => {
      const targetSocket = userSockets.get(targetId);
      if (targetSocket) {
        io.to(targetSocket).emit('call:ice-candidate', {
          senderId: socket.userId,
          candidate
        });
      }
    });

    socket.on('call:reject', ({ callId, callerId }) => {
      const callerSocket = userSockets.get(callerId);
      if (callerSocket) {
        io.to(callerSocket).emit('call:rejected', { callId });
      }
    });

    socket.on('call:end', ({ callId, targetId }) => {
      const targetSocket = userSockets.get(targetId);
      if (targetSocket) {
        io.to(targetSocket).emit('call:ended', { callId });
      }
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        userSockets.delete(socket.userId);
        io.emit('user:status', { userId: socket.userId, status: 'offline' });
      }
      console.log('User disconnected:', socket.id);
    });
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
