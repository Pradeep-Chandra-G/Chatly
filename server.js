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

  const userSockets = new Map();
  const userConversations = new Map(); // Track which conversations each user has joined

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("user:online", (userId) => {
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      socket.join(userId);

      // Initialize conversation tracking for this user
      if (!userConversations.has(userId)) {
        userConversations.set(userId, new Set());
      }

      io.emit("user:status", { userId, status: "online" });
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

      // Track that this user has joined this conversation
      if (socket.userId && userConversations.has(socket.userId)) {
        userConversations.get(socket.userId).add(conversationId);
      }

      console.log(
        `User ${socket.userId} joined conversation ${conversationId}`
      );
    });

    socket.on("conversation:leave", (conversationId) => {
      socket.leave(conversationId);

      // Remove from tracking
      if (socket.userId && userConversations.has(socket.userId)) {
        userConversations.get(socket.userId).delete(conversationId);
      }

      console.log(`User ${socket.userId} left conversation ${conversationId}`);
    });

    socket.on("message:send", (data) => {
      console.log(
        "Message sent:",
        data._id,
        "to conversation:",
        data.conversationId
      );

      // Broadcast to conversation room
      io.to(data.conversationId).emit("message:new", data);

      // Check if any online users in this conversation have it open
      // and automatically mark as delivered
      const conversationSockets = io.sockets.adapter.rooms.get(
        data.conversationId
      );

      if (conversationSockets && conversationSockets.size > 1) {
        // More than just the sender is in the room
        // Mark as delivered immediately for online users
        console.log(
          "Message delivered to online users in conversation:",
          data.conversationId
        );

        // Emit delivered status back to the conversation
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
        console.log("Message edited:", messageId);

        // Broadcast the edit to all users in the conversation
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
        console.log("Reaction updated for message:", messageId);
        io.to(conversationId).emit("message:reaction-update", {
          messageId,
          reactions,
        });
      }
    );

    socket.on("message:reaction-update", ({ messageId, reactions }) => {
      console.log("Reaction updated for message:", messageId);
      setMessages((prev) =>
        prev.map((msg) => (msg._id === messageId ? { ...msg, reactions } : msg))
      );
    });

    socket.on("disconnect", () => {
      if (socket.userId) {
        userSockets.delete(socket.userId);
        userConversations.delete(socket.userId);
        io.emit("user:status", { userId: socket.userId, status: "offline" });
      }
      console.log("User disconnected:", socket.id);
    });
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
