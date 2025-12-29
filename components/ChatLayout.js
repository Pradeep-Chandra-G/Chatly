"use client";

import { useState, useEffect, useRef } from "react";
import { signOut } from "next-auth/react";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MessageContextMenu from "@/components/MessageContextMenu";
import ReplyPreview from "@/components/ReplyPreview";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EditMessageDialog from "@/components/EditMessageDialog";
import UserSettingsDialog from "@/components/UserSettingsDialog";
import DeleteMessageDialog from "@/components/DeleteMessageDialog";
import {
  MessageCircle,
  Send,
  Search,
  LogOut,
  UserPlus,
  Users,
  Phone,
  Video,
  MoreVertical,
  Check,
  CheckCheck,
  FileText,
  Download,
  ArrowLeft,
  X,
  Reply,
  Settings,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import NewChatDialog from "@/components/NewChatDialog";
import CreateGroupDialog from "@/components/CreateGroupDialog";
import CallModal from "@/components/CallModal";
import MediaUpload from "@/components/MediaUpload";

let socket;
let pingInterval;

export default function ChatLayout({ session }) {
  const [conversations, setConversations] = useState([]);
  const [filteredConversations, setFilteredConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const notificationPermission = useRef(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [longPressTimer, setLongPressTimer] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        notificationPermission.current = permission === "granted";
      });
    } else if ("Notification" in window) {
      notificationPermission.current = Notification.permission === "granted";
    }
  }, []);

  // Update tab title with unread count
  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) Chatly - Encrypted Messaging`;
    } else {
      document.title = "Chatly - Encrypted Messaging";
    }
  }, [unreadCount]);

  // Calculate unread count
  useEffect(() => {
    const count = conversations.reduce((total, conv) => {
      return total + (conv.unreadCount || 0);
    }, 0);
    setUnreadCount(count);
  }, [conversations]);

  // Filter conversations based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredConversations(conversations);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = conversations.filter((conv) => {
        const other = getOtherParticipant(conv);
        const name = conv.type === "group" ? conv.name : other?.name;
        const email = other?.email || "";
        return (
          name?.toLowerCase().includes(query) ||
          email.toLowerCase().includes(query) ||
          conv.lastMessage?.toLowerCase().includes(query)
        );
      });
      setFilteredConversations(filtered);
    }
  }, [searchQuery, conversations]);

  // Initialize Socket.io with heartbeat
  useEffect(() => {
    if (socket && socket.connected) {
      console.log("Socket already initialized and connected");
      return;
    }

    socketInitializer();

    return () => {
      console.log("Component unmounting, keeping socket alive");
      if (pingInterval) {
        clearInterval(pingInterval);
      }
    };
  }, []);

  const socketInitializer = async () => {
    if (socket && socket.connected) {
      console.log("Socket already connected, skipping initialization");
      return;
    }

    if (socket) {
      socket.disconnect();
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || window.location.origin;

    socket = io(wsUrl, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      timeout: 20000,
    });

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      socket.emit("user:online", session.user.id);

      if (selectedConversation) {
        socket.emit("conversation:join", selectedConversation._id);
      }

      // Setup heartbeat to keep connection alive
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (socket && socket.connected) {
          socket.emit("ping");
        }
      }, 25000);
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      if (pingInterval) {
        clearInterval(pingInterval);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    // CRITICAL FIX: Handle initial online users list
    socket.on("users:online-list", ({ onlineUsers }) => {
      console.log("📋 Received online users list:", onlineUsers);
      setOnlineUsers(new Set(onlineUsers));
    });

    // CRITICAL FIX: Handle individual user status changes
    socket.on("user:status", ({ userId, status }) => {
      console.log(`👤 User ${userId} is now ${status}`);
      setOnlineUsers((prev) => {
        const updated = new Set(prev);
        if (status === "online") {
          updated.add(userId);
        } else {
          updated.delete(userId);
        }
        console.log("📊 Updated online users:", Array.from(updated));
        return updated;
      });
    });

    socket.on("message:new", (message) => {
      console.log("📨 New message received:", message);

      if (
        message.senderId !== session.user.id &&
        (!selectedConversation ||
          message.conversationId !== selectedConversation._id)
      ) {
        showNotification("New Message", message.content);
      }

      setConversations((prevConversations) => {
        const updated = prevConversations.map((conv) => {
          if (conv._id === message.conversationId) {
            // Determine last message preview
            const lastMessagePreview =
              message.type === "text" ? message.content : `📎 ${message.type}`;

            // Calculate unread count
            const isCurrentChat = selectedConversation?._id === conv._id;
            const isOwnMessage = message.senderId === session.user.id;
            const shouldIncrement = !isCurrentChat && !isOwnMessage;

            return {
              ...conv,
              lastMessage: lastMessagePreview,
              updatedAt: message.createdAt,
              unreadCount: shouldIncrement
                ? (conv.unreadCount || 0) + 1
                : conv.unreadCount || 0,
            };
          }
          return conv;
        });

        // **Sort by most recent message**
        return updated.sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt);
          const dateB = new Date(b.updatedAt || b.createdAt);
          return dateB - dateA;
        });
      });

      // Rest of the handler remains the same...
      setSelectedConversation((currentConv) => {
        if (currentConv && message.conversationId === currentConv._id) {
          setMessages((prevMessages) => {
            if (prevMessages.some((m) => m._id === message._id)) {
              return prevMessages;
            }
            return [...prevMessages, message];
          });

          if (message.senderId !== session.user.id) {
            setTimeout(() => {
              socket.emit("message:read", {
                messageId: message._id,
                conversationId: message.conversationId,
              });

              fetch("/api/messages/status", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  messageId: message._id,
                  status: "read",
                }),
              }).catch(console.error);
            }, 100);
          }
        } else if (message.senderId !== session.user.id) {
          setTimeout(() => {
            socket.emit("message:delivered", {
              messageId: message._id,
              conversationId: message.conversationId,
            });

            fetch("/api/messages/status", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messageId: message._id,
                status: "delivered",
              }),
            }).catch(console.error);
          }, 100);
        }

        return currentConv;
      });

      loadConversations();
    });

    socket.on("message:status", ({ messageId, status }) => {
      console.log(`📝 Message ${messageId} status: ${status}`);
      setMessages((prev) =>
        prev.map((msg) => (msg._id === messageId ? { ...msg, status } : msg))
      );
    });

    socket.on(
      "message:edited",
      ({ messageId, content, edited, editedAt, conversationId }) => {
        console.log("✏️ Message edited received:", messageId, content);

        // Update the message in the messages list
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === messageId ? { ...msg, content, edited, editedAt } : msg
          )
        );

        // Update the conversation's lastMessage in sidebar
        setConversations((prevConversations) =>
          prevConversations.map((conv) =>
            conv._id === conversationId
              ? {
                  ...conv,
                  lastMessage: content,
                  updatedAt: new Date().toISOString(),
                }
              : conv
          )
        );
      }
    );

    socket.on(
      "message:deleted",
      ({ messageId, conversationId, newLastMessage }) => {
        console.log("🗑️ Message deleted received:", messageId);

        // Remove message from the messages list
        setMessages((prev) => prev.filter((msg) => msg._id !== messageId));

        // Update conversation's lastMessage in sidebar
        setConversations((prevConversations) =>
          prevConversations.map((conv) =>
            conv._id === conversationId
              ? {
                  ...conv,
                  lastMessage: newLastMessage,
                  updatedAt: new Date().toISOString(),
                }
              : conv
          )
        );
      }
    );

    socket.on("user:typing", ({ userId }) => {
      console.log(`⌨️ User ${userId} is typing`);
      setIsTyping(true);
    });

    socket.on("user:stop-typing", () => {
      setIsTyping(false);
    });

    socket.on("call:incoming", ({ callId, callerId, type, offer }) => {
      const caller = conversations
        .flatMap((c) => c.participantDetails || [])
        .find((u) => u._id === callerId);

      setActiveCall({
        _id: callId,
        callerId,
        receiverId: session.user.id,
        type,
        offer,
        receiverName: caller?.name || "Unknown",
        receiverAvatar: caller?.avatar,
      });
      setIsIncomingCall(true);
      setIsCallModalOpen(true);

      showNotification(
        `Incoming ${type} call`,
        `From ${caller?.name || "Unknown"}`
      );
    });

    socket.on("call:rejected", ({ callId }) => {
      // Only show toast if we were the caller (the one who got rejected)
      if (activeCall && activeCall._id === callId) {
        toast.error("Call was rejected");
        setIsCallModalOpen(false);
        setActiveCall(null);
      }
    });

    socket.on("call:ended", ({ callId }) => {
      // Only show toast if we didn't end the call ourselves
      // (the other person ended it)
      if (activeCall && activeCall._id === callId) {
        toast.info("Call ended");
        setIsCallModalOpen(false);
        setActiveCall(null);
      }
    });

    socket.on("message:reaction-update", ({ messageId, reactions }) => {
      console.log("👍 Reaction updated for message:", messageId);
      setMessages((prev) =>
        prev.map((msg) => (msg._id === messageId ? { ...msg, reactions } : msg))
      );
    });
  };

  const showNotification = (title, body) => {
    if (notificationPermission.current && document.hidden) {
      try {
        new Notification(title, {
          body,
          icon: "/icon.png",
          badge: "/badge.png",
          tag: "whatsapp-clone-message",
        });
      } catch (error) {
        console.error("Notification error:", error);
      }
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation._id);
      socket?.emit("conversation:join", selectedConversation._id);
      setShowMobileChat(true);

      // Clear unread count for this conversation
      setConversations((prevConversations) =>
        prevConversations.map((conv) =>
          conv._id === selectedConversation._id
            ? { ...conv, unreadCount: 0 }
            : conv
        )
      );
    }

    return () => {
      if (selectedConversation) {
        socket?.emit("conversation:leave", selectedConversation._id);
      }
    };
  }, [selectedConversation?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const response = await fetch("/api/conversations");
      const data = await response.json();
      if (response.ok) {
        // Add unread count to each conversation
        const conversationsWithUnread = data.conversations.map((conv) => ({
          ...conv,
          unreadCount: conv.unreadCount || 0,
        }));
        setConversations(conversationsWithUnread);
      }
    } catch (error) {
      console.error("Error loading conversations:", error);
    }
  };

  const loadMessages = async (conversationId) => {
    try {
      const response = await fetch(
        `/api/messages?conversationId=${conversationId}`
      );
      const data = await response.json();
      if (response.ok) {
        setMessages(data.messages);

        // Mark all unread messages as read
        const unreadMessages = data.messages.filter(
          (msg) => msg.senderId !== session.user.id && msg.status !== "read"
        );

        // Batch mark as read
        for (const msg of unreadMessages) {
          if (socket && socket.connected) {
            socket.emit("message:read", {
              messageId: msg._id,
              conversationId,
            });
          }

          fetch("/api/messages/status", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId: msg._id, status: "read" }),
          }).catch(console.error);
        }
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedConversation) return;

    const messageContent = messageInput.trim();
    const replyToId = replyingTo?._id || null; // Capture this BEFORE clearing state

    // Clear input and reply state immediately for better UX
    setMessageInput("");
    const tempReplyingTo = replyingTo; // Store temporarily
    setReplyingTo(null);

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation._id,
          content: messageContent,
          replyTo: replyToId,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === data.message._id)) {
            return prev;
          }
          return [...prev, data.message];
        });

        if (socket && socket.connected) {
          socket.emit("message:send", data.message);
        }

        loadConversations();
      } else {
        // If send failed, restore the reply state
        setReplyingTo(tempReplyingTo);
        setMessageInput(messageContent);
        toast.error("Failed to send message");
      }
    } catch (error) {
      console.error("Message send error:", error);
      // Restore state on error
      setReplyingTo(tempReplyingTo);
      setMessageInput(messageContent);
      toast.error("Failed to send message");
    }
  };

  const handleTyping = (e) => {
    setMessageInput(e.target.value);

    if (selectedConversation && socket && socket.connected) {
      socket.emit("typing:start", {
        conversationId: selectedConversation._id,
        userId: session.user.id,
      });

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("typing:stop", {
          conversationId: selectedConversation._id,
          userId: session.user.id,
        });
      }, 1000);
    }
  };

  const handleNewConversation = (conversation) => {
    setConversations((prev) => [conversation, ...prev]);
    setSelectedConversation(conversation);
    setIsNewChatOpen(false);
  };

  const handleGroupCreated = (group) => {
    setConversations((prev) => [group, ...prev]);
    setSelectedConversation(group);
    setIsCreateGroupOpen(false);
  };

  const handleMediaUploaded = async (media) => {
    if (!selectedConversation) return;

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation._id,
          content: media.fileName || "Media file",
          type: media.type,
          mediaUrl: media.url,
          fileName: media.fileName,
          fileSize: media.fileSize,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        socket.emit("message:send", data.message);
        setMessages((prev) => [...prev, data.message]);
        loadConversations();
      }
    } catch (error) {
      toast.error("Failed to send media");
    }
  };

  const initiateCall = async (type) => {
    if (!selectedConversation || selectedConversation.type === "group") {
      toast.error("Calls are only available for direct conversations");
      return;
    }

    const otherParticipant = getOtherParticipant(selectedConversation);

    try {
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: otherParticipant._id,
          type,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setActiveCall({
          ...data.call,
          receiverName: otherParticipant.name,
          receiverAvatar: otherParticipant.avatar,
        });
        setIsIncomingCall(false);
        setIsCallModalOpen(true);
      }
    } catch (error) {
      toast.error("Failed to initiate call");
    }
  };

  const getOtherParticipant = (conversation) => {
    return conversation.participantDetails?.[0];
  };

  const isUserOnline = (userId) => {
    return onlineUsers.has(userId);
  };

  const getMessageStatusIcon = (message) => {
    if (message.senderId !== session.user.id) return null;

    if (message.status === "read") {
      return <CheckCheck className="w-4 h-4 text-blue-500" />;
    } else if (message.status === "delivered") {
      return <CheckCheck className="w-4 h-4 text-gray-400" />;
    } else {
      return <Check className="w-4 h-4 text-gray-400" />;
    }
  };

  const handleBackToList = () => {
    setShowMobileChat(false);
    setSelectedConversation(null);
  };

  const SidebarContent = () => (
    <>
      <div className="bg-card p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={session.user.image} />
              <AvatarFallback>{session.user.name?.[0]}</AvatarFallback>
            </Avatar>
            <div className="hidden sm:block">
              <h2 className="font-semibold text-sm">{session.user.name}</h2>
              <p className="text-xs text-muted-foreground">Online</p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsNewChatOpen(true)}
            >
              <UserPlus className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsCreateGroupOpen(true)}
            >
              <Users className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => signOut()}
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-8 w-8"
              onClick={() => setSearchQuery("")}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-sm">
              {searchQuery ? "No conversations found" : "No conversations yet"}
            </p>
            {!searchQuery && (
              <Button
                variant="link"
                className="mt-2"
                onClick={() => setIsNewChatOpen(true)}
              >
                Start a new chat
              </Button>
            )}
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const other = getOtherParticipant(conv);
            const isOnline = other && isUserOnline(other._id);
            const isSelected = selectedConversation?._id === conv._id;
            const hasUnread = (conv.unreadCount || 0) > 0;

            return (
              <div
                key={conv._id}
                className={`p-3 sm:p-4 hover:bg-accent cursor-pointer transition-colors relative ${
                  isSelected ? "bg-accent border-l-4 border-primary" : ""
                }`}
                onClick={() => setSelectedConversation(conv)}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10 sm:h-12 sm:w-12">
                      <AvatarImage
                        src={
                          conv.type === "group" ? conv.avatar : other?.avatar
                        }
                      />
                      <AvatarFallback>
                        {conv.type === "group"
                          ? conv.name?.[0]
                          : other?.name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    {conv.type === "direct" && isOnline && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background"></div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3
                          className={`font-semibold truncate text-sm sm:text-base ${
                            hasUnread ? "text-foreground" : ""
                          }`}
                        >
                          {conv.type === "group" ? conv.name : other?.name}
                        </h3>
                        {conv.type === "group" && (
                          <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {conv.updatedAt &&
                            new Date(conv.updatedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                        </span>

                        {/* UNREAD BADGE */}
                        {hasUnread && (
                          <div className="bg-primary text-primary-foreground text-xs font-semibold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                            {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                          </div>
                        )}
                      </div>
                    </div>

                    <p
                      className={`text-sm truncate ${
                        hasUnread
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {conv.lastMessage || "No messages yet"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </ScrollArea>
    </>
  );

  const handleReaction = async (messageId, emoji) => {
    try {
      const response = await fetch("/api/messages/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });

      const data = await response.json();
      if (response.ok && socket && socket.connected) {
        socket.emit("message:reaction", {
          messageId,
          conversationId: selectedConversation._id,
          reactions: data.reactions,
        });

        // Update local state
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === messageId ? { ...msg, reactions: data.reactions } : msg
          )
        );
      }
    } catch (error) {
      console.error("Reaction error:", error);
      toast.error("Failed to add reaction");
    }
  };

  // Helper function to group reactions by emoji
  const groupReactions = (reactions = []) => {
    const grouped = {};
    reactions.forEach((reaction) => {
      if (!grouped[reaction.emoji]) {
        grouped[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
        };
      }
      grouped[reaction.emoji].count++;
      grouped[reaction.emoji].users.push({
        userId: reaction.userId,
        userName: reaction.userName,
      });
    });
    return Object.values(grouped);
  };

  const handleContextMenu = (e, message) => {
    e.preventDefault();
    const isOwn = message.senderId === session.user.id;

    setContextMenu({
      message,
      position: { x: e.clientX, y: e.clientY },
      isOwnMessage: isOwn,
    });
  };

  const handleLongPressStart = (e, message) => {
    const touch = e.touches[0];
    const isOwn = message.senderId === session.user.id;

    const timer = setTimeout(() => {
      // Trigger haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      setContextMenu({
        message,
        position: { x: touch.clientX, y: touch.clientY },
        isOwnMessage: isOwn,
      });
    }, 500); // 500ms long press

    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleReplyToMessage = (message) => {
    // Find sender name from conversations
    let senderName = "Unknown";

    if (message.senderId === session.user.id) {
      senderName = "You";
    } else {
      const sender = conversations
        .flatMap((c) => c.participantDetails || [])
        .find((u) => u._id === message.senderId);
      senderName = sender?.name || "Unknown";
    }

    setReplyingTo({
      ...message,
      senderName: senderName,
    });

    // Focus on message input
    setTimeout(() => {
      const input = document.querySelector(
        'input[placeholder="Type a message..."]'
      );
      if (input) {
        input.focus();
      }
    }, 100);
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const handleEditMessage = (message) => {
    // Only allow editing text messages
    if (message.type !== "text") {
      toast.error("Only text messages can be edited");
      return;
    }

    // Only allow editing own messages
    if (message.senderId !== session.user.id) {
      toast.error("You can only edit your own messages");
      return;
    }

    setEditingMessage(message);
    setIsEditDialogOpen(true);
    closeContextMenu();
  };

  // 5. ADD handleMessageEdited FUNCTION (new function)
  const handleMessageEdited = (editedMessage) => {
    // Update local state
    setMessages((prev) =>
      prev.map((msg) => (msg._id === editedMessage._id ? editedMessage : msg))
    );

    // Emit socket event to update for other users
    if (socket && socket.connected) {
      socket.emit("message:edit", {
        messageId: editedMessage._id,
        conversationId: selectedConversation._id,
        content: editedMessage.content,
        edited: editedMessage.edited,
        editedAt: editedMessage.editedAt,
      });
    }

    // **NEW: Update sidebar if this was the last message**
    setConversations((prevConversations) =>
      prevConversations.map((conv) => {
        if (conv._id === selectedConversation._id) {
          // Check if this message is the last one
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg._id === editedMessage._id) {
            return {
              ...conv,
              lastMessage: editedMessage.content,
              updatedAt: new Date().toISOString(),
            };
          }
        }
        return conv;
      })
    );
  };

  const handleDeleteMessage = (message) => {
    setDeletingMessage(message);
    setIsDeleteDialogOpen(true);
    closeContextMenu();
  };

  const confirmDeleteMessage = async () => {
    if (!deletingMessage) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/messages/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: deletingMessage._id,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        // Remove message from local state
        setMessages((prev) =>
          prev.filter((msg) => msg._id !== deletingMessage._id)
        );

        // Update sidebar
        setConversations((prevConversations) =>
          prevConversations.map((conv) =>
            conv._id === selectedConversation._id
              ? {
                  ...conv,
                  lastMessage: data.newLastMessage,
                  updatedAt: new Date().toISOString(),
                }
              : conv
          )
        );

        // Emit socket event to notify other users
        if (socket && socket.connected) {
          socket.emit("message:delete", {
            messageId: deletingMessage._id,
            conversationId: selectedConversation._id,
            newLastMessage: data.newLastMessage,
          });
        }

        toast.success("Message deleted");
        setIsDeleteDialogOpen(false);
        setDeletingMessage(null);
      } else {
        toast.error(data.error || "Failed to delete message");
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete message");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="hidden md:flex md:w-80 lg:w-96 border-r border-border flex-col">
        <SidebarContent />
      </div>

      <div
        className={`${
          showMobileChat ? "hidden" : "flex"
        } md:hidden w-full flex-col`}
      >
        <SidebarContent />
      </div>

      <div
        className={`${
          !showMobileChat ? "hidden md:flex" : "flex"
        } flex-1 flex-col`}
      >
        {selectedConversation ? (
          <>
            <div className="bg-card p-3 sm:p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden h-9 w-9 flex-shrink-0"
                  onClick={handleBackToList}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage
                    src={
                      selectedConversation.type === "group"
                        ? selectedConversation.avatar
                        : getOtherParticipant(selectedConversation)?.avatar
                    }
                  />
                  <AvatarFallback>
                    {selectedConversation.type === "group"
                      ? selectedConversation.name?.[0]
                      : getOtherParticipant(selectedConversation)?.name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold flex items-center gap-2 text-sm sm:text-base truncate">
                    {selectedConversation.type === "group"
                      ? selectedConversation.name
                      : getOtherParticipant(selectedConversation)?.name}
                    {selectedConversation.type === "group" && (
                      <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground truncate">
                    {selectedConversation.type === "group"
                      ? `${
                          selectedConversation.participants?.length || 0
                        } members`
                      : isTyping
                      ? "typing..."
                      : isUserOnline(
                          getOtherParticipant(selectedConversation)?._id
                        )
                      ? "online"
                      : "offline"}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {selectedConversation.type === "direct" && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => initiateCall("voice")}
                    >
                      <Phone className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => initiateCall("video")}
                    >
                      <Video className="w-5 h-5" />
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-3 sm:p-4 bg-muted/20">
              {messages.map((message) => {
                const isOwn = message.senderId === session.user.id;
                const groupedReactions = groupReactions(message.reactions);

                return (
                  <div
                    key={message._id}
                    id={`msg-${message._id}`}
                    className={`flex mb-3 sm:mb-4 ${
                      isOwn ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div className="flex flex-col max-w-[85%] sm:max-w-[70%]">
                      <div
                        className={`rounded-lg px-3 sm:px-4 py-2 cursor-pointer select-none ${
                          isOwn
                            ? "bg-primary text-primary-foreground"
                            : "bg-card"
                        }`}
                        onContextMenu={(e) => handleContextMenu(e, message)}
                        onTouchStart={(e) => handleLongPressStart(e, message)}
                        onTouchEnd={handleLongPressEnd}
                        onTouchMove={handleLongPressEnd}
                      >
                        {/* Show quoted/replied message if exists */}
                        {message.replyToMessage && (
                          <div
                            className="bg-black/10 dark:bg-white/10 border-l-2 border-primary/50 rounded px-2 py-1 mb-2 cursor-pointer hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
                            onClick={() => {
                              // Scroll to the original message
                              const originalMsg = document.getElementById(
                                `msg-${message.replyToMessage._id}`
                              );
                              if (originalMsg) {
                                originalMsg.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                                originalMsg.classList.add("highlight-message");
                                setTimeout(() => {
                                  originalMsg.classList.remove(
                                    "highlight-message"
                                  );
                                }, 2000);
                              }
                            }}
                          >
                            <p className="text-xs font-semibold opacity-80 mb-1">
                              {message.replyToMessage.senderId ===
                              session.user.id
                                ? "You"
                                : "Reply"}
                            </p>
                            {message.replyToMessage.type === "image" ? (
                              <div className="flex items-center gap-2 text-xs opacity-70">
                                <ImageIcon className="w-3 h-3" />
                                <span>Photo</span>
                              </div>
                            ) : message.replyToMessage.type === "file" ? (
                              <div className="flex items-center gap-2 text-xs opacity-70">
                                <FileText className="w-3 h-3" />
                                <span>
                                  {message.replyToMessage.fileName || "File"}
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs opacity-70 line-clamp-2">
                                {message.replyToMessage.content}
                              </p>
                            )}
                          </div>
                        )}

                        {message.type === "image" && message.mediaUrl && (
                          <div className="mb-2">
                            <img
                              src={message.mediaUrl}
                              alt="Shared image"
                              className="rounded-lg max-w-full h-auto max-h-48 sm:max-h-64 object-cover cursor-pointer"
                              onClick={() =>
                                window.open(message.mediaUrl, "_blank")
                              }
                            />
                          </div>
                        )}
                        {message.type === "file" && message.mediaUrl && (
                          <a
                            href={message.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 sm:p-3 bg-muted/20 rounded-lg hover:bg-muted/30 transition-colors mb-2"
                          >
                            <FileText className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate text-sm">
                                {message.fileName || "File"}
                              </p>
                              <p className="text-xs opacity-70">
                                {message.fileSize
                                  ? `${(message.fileSize / 1024).toFixed(2)} KB`
                                  : "Download"}
                              </p>
                            </div>
                            <Download className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                          </a>
                        )}

                        {message.content && (
                          <div>
                            <p className="break-words text-sm sm:text-base">
                              {message.content}
                            </p>
                            {message.edited && (
                              <p className="text-xs opacity-50 italic mt-1">
                                (edited)
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-1 justify-end mt-1">
                          <span className="text-xs opacity-70">
                            {new Date(message.createdAt).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </span>
                          {getMessageStatusIcon(message)}
                        </div>
                      </div>

                      {/* Render reactions below message */}
                      {groupedReactions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 px-2">
                          {groupedReactions.map((reaction, idx) => {
                            const hasUserReacted = reaction.users.some(
                              (u) => u.userId === session.user.id
                            );
                            return (
                              <button
                                key={idx}
                                onClick={() =>
                                  handleReaction(message._id, reaction.emoji)
                                }
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                                  hasUserReacted
                                    ? "bg-primary/20 border border-primary"
                                    : "bg-accent hover:bg-accent/80"
                                }`}
                                title={reaction.users
                                  .map((u) => u.userName)
                                  .join(", ")}
                              >
                                <span>{reaction.emoji}</span>
                                <span className="text-xs">
                                  {reaction.count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </ScrollArea>

            <form
              onSubmit={handleSendMessage}
              className="bg-card p-3 sm:p-4 border-t border-border"
            >
              {replyingTo && (
                <ReplyPreview replyTo={replyingTo} onCancel={cancelReply} />
              )}
              <div className="flex gap-2">
                <MediaUpload
                  onMediaUploaded={handleMediaUploaded}
                  disabled={!selectedConversation}
                />
                <Input
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={handleTyping}
                  className="flex-1 text-sm sm:text-base"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
                  disabled={!messageInput.trim()}
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-muted/20 p-4">
            <div className="text-center max-w-md">
              <MessageCircle className="w-16 h-16 sm:w-20 sm:h-20 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl sm:text-2xl font-semibold mb-2">Chatly</h2>
              <p className="text-muted-foreground mb-4 text-sm sm:text-base">
                Select a conversation to start messaging
              </p>
              <Button onClick={() => setIsNewChatOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Start New Chat
              </Button>
            </div>
          </div>
        )}
      </div>

      <NewChatDialog
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onConversationCreated={handleNewConversation}
        currentUserId={session.user.id}
      />

      <CreateGroupDialog
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onGroupCreated={handleGroupCreated}
      />

      <UserSettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onProfileUpdated={() => {
          loadConversations();
        }}
      />

      <EditMessageDialog
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setEditingMessage(null);
        }}
        message={editingMessage}
        onMessageEdited={handleMessageEdited}
      />

      <DeleteMessageDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setDeletingMessage(null);
        }}
        onConfirm={confirmDeleteMessage}
        isDeleting={isDeleting}
      />

      {activeCall && (
        <CallModal
          isOpen={isCallModalOpen}
          onClose={() => {
            setIsCallModalOpen(false);
            setActiveCall(null);
          }}
          call={activeCall}
          socket={socket}
          currentUserId={session.user.id}
          isIncoming={isIncomingCall}
        />
      )}
      {contextMenu && (
        <MessageContextMenu
          message={contextMenu.message}
          position={contextMenu.position}
          onClose={closeContextMenu}
          onReaction={(emoji) => handleReaction(contextMenu.message._id, emoji)}
          onReply={() => handleReplyToMessage(contextMenu.message)}
          onEdit={() => handleEditMessage(contextMenu.message)}
          onDelete={() => handleDeleteMessage(contextMenu.message)}
          isOwnMessage={contextMenu.isOwnMessage}
          existingReactions={contextMenu.message.reactions || []}
          currentUserId={session.user.id}
        />
      )}
    </div>
  );
}
