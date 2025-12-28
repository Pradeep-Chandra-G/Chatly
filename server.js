const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io/",
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  const userSockets = new Map(); // userId -> socketId
  const onlineUsers = new Set(); // Set of currently online userIds
  const userConversations = new Map(); // userId -> Set of conversationIds

  io.on("connection", (socket) => {
    console.log("🔌 User connected:", socket.id);

    socket.on("user:online", (userId) => {
      console.log(`✅ User ${userId} is now online`);

      // Store socket mapping
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      socket.join(userId);

      // Add to online users
      onlineUsers.add(userId);

      // Initialize conversation tracking
      if (!userConversations.has(userId)) {
        userConversations.set(userId, new Set());
      }

      // CRITICAL FIX 1: Send current online users to the newly connected user
      socket.emit("users:online-list", {
        onlineUsers: Array.from(onlineUsers),
      });
      console.log(
        `📋 Sent online users list to ${userId}:`,
        Array.from(onlineUsers)
      );

      // CRITICAL FIX 2: Broadcast this user's online status to ALL other users
      socket.broadcast.emit("user:status", {
        userId,
        status: "online",
      });
      console.log(`📢 Broadcasted ${userId} online status to all users`);
    });

    // Handle ping to keep connection alive
    socket.on("ping", () => {
      socket.emit("pong");
    });

    socket.on("typing:start", ({ conversationId, userId }) => {
      socket.to(conversationId).emit("user:typing", { userId, conversationId });
    });

    socket.on("typing:stop", ({ conversationId, userId }) => {
      socket
        .to(conversationId)
        .emit("user:stop-typing", { userId, conversationId });
    });

    socket.on("conversation:join", (conversationId) => {
      socket.join(conversationId);

      if (socket.userId && userConversations.has(socket.userId)) {
        userConversations.get(socket.userId).add(conversationId);
      }

      console.log(
        `💬 User ${socket.userId} joined conversation ${conversationId}`
      );
    });

    socket.on("conversation:leave", (conversationId) => {
      socket.leave(conversationId);

      if (socket.userId && userConversations.has(socket.userId)) {
        userConversations.get(socket.userId).delete(conversationId);
      }

      console.log(
        `👋 User ${socket.userId} left conversation ${conversationId}`
      );
    });

    socket.on("message:send", (data) => {
      console.log(
        "📤 Message sent:",
        data._id,
        "to conversation:",
        data.conversationId
      );

      io.to(data.conversationId).emit("message:new", data);

      const conversationSockets = io.sockets.adapter.rooms.get(
        data.conversationId
      );

      if (conversationSockets && conversationSockets.size > 1) {
        console.log(
          "✅ Message delivered to online users in conversation:",
          data.conversationId
        );

        setTimeout(() => {
          io.to(data.conversationId).emit("message:status", {
            messageId: data._id,
            status: "delivered",
          });
        }, 100);
      }
    });

    socket.on("message:delivered", ({ messageId, conversationId }) => {
      io.to(conversationId).emit("message:status", {
        messageId,
        status: "delivered",
      });
    });

    socket.on("message:read", ({ messageId, conversationId }) => {
      io.to(conversationId).emit("message:status", {
        messageId,
        status: "read",
      });
    });

    socket.on(
      "message:edit",
      ({ messageId, conversationId, content, edited, editedAt }) => {
        console.log("✏️ Message edited:", messageId);

        io.to(conversationId).emit("message:edited", {
          messageId,
          content,
          edited,
          editedAt,
        });
      }
    );

    // WebRTC Signaling Events
    socket.on("call:initiate", ({ callId, receiverId, type, offer }) => {
      const receiverSocket = userSockets.get(receiverId);
      if (receiverSocket) {
        io.to(receiverSocket).emit("call:incoming", {
          callId,
          callerId: socket.userId,
          type,
          offer,
        });
      }
    });

    socket.on("call:answer", ({ callId, callerId, answer }) => {
      const callerSocket = userSockets.get(callerId);
      if (callerSocket) {
        io.to(callerSocket).emit("call:answered", { callId, answer });
      }
    });

    socket.on("call:ice-candidate", ({ targetId, candidate }) => {
      const targetSocket = userSockets.get(targetId);
      if (targetSocket) {
        io.to(targetSocket).emit("call:ice-candidate", {
          senderId: socket.userId,
          candidate,
        });
      }
    });

    socket.on("call:reject", ({ callId, callerId }) => {
      const callerSocket = userSockets.get(callerId);
      if (callerSocket) {
        io.to(callerSocket).emit("call:rejected", { callId });
      }
    });

    socket.on("call:end", ({ callId, targetId }) => {
      const targetSocket = userSockets.get(targetId);
      if (targetSocket) {
        io.to(targetSocket).emit("call:ended", { callId });
      }
    });

    socket.on(
      "message:reaction",
      ({ messageId, conversationId, reactions }) => {
        console.log("👍 Reaction updated for message:", messageId);
        io.to(conversationId).emit("message:reaction-update", {
          messageId,
          reactions,
        });
      }
    );

    socket.on("disconnect", () => {
      if (socket.userId) {
        console.log(`❌ User ${socket.userId} disconnected`);

        // CRITICAL FIX 3: Clean up properly
        userSockets.delete(socket.userId);
        onlineUsers.delete(socket.userId);
        userConversations.delete(socket.userId);

        // Broadcast offline status to ALL users
        io.emit("user:status", {
          userId: socket.userId,
          status: "offline",
        });
        console.log(
          `📢 Broadcasted ${socket.userId} offline status to all users`
        );
      }
      console.log("🔌 Socket disconnected:", socket.id);
    });
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
