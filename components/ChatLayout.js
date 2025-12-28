"use client";

import { useState, useEffect, useRef } from "react";
import { signOut } from "next-auth/react";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
      document.title = `(${unreadCount}) WhatsApp Clone`;
    } else {
      document.title = "WhatsApp Clone";
    }
  }, [unreadCount]);

  // Calculate unread count
  useEffect(() => {
    const count = conversations.filter((conv) => {
      return conv.lastMessage && conv._id !== selectedConversation?._id;
    }).length;
    setUnreadCount(count);
  }, [conversations, selectedConversation]);

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

    socket = io({
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

    socket.on("user:status", ({ userId, status }) => {
      console.log(`User ${userId} is now ${status}`);
      setOnlineUsers((prev) => {
        const updated = new Set(prev);
        if (status === "online") {
          updated.add(userId);
        } else {
          updated.delete(userId);
        }
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

      setSelectedConversation((currentConv) => {
        if (currentConv && message.conversationId === currentConv._id) {
          setMessages((prevMessages) => {
            if (prevMessages.some((m) => m._id === message._id)) {
              return prevMessages;
            }
            return [...prevMessages, message];
          });

          // If message is from someone else and we're viewing the chat, mark as read
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
          // Message is for a conversation we're not viewing
          // Mark as delivered since we're online
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
      console.log(`Message ${messageId} status: ${status}`);
      setMessages((prev) =>
        prev.map((msg) => (msg._id === messageId ? { ...msg, status } : msg))
      );
    });

    socket.on("user:typing", ({ userId }) => {
      console.log(`User ${userId} is typing`);
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
      toast.error("Call was rejected");
      setIsCallModalOpen(false);
      setActiveCall(null);
    });

    socket.on("call:ended", ({ callId }) => {
      toast.info("Call ended");
      setIsCallModalOpen(false);
      setActiveCall(null);
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
        setConversations(data.conversations);
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

        const unreadMessages = data.messages.filter(
          (msg) => msg.senderId !== session.user.id && msg.status !== "read"
        );

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
    setMessageInput("");

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation._id,
          content: messageContent,
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
      }
    } catch (error) {
      console.error("Message send error:", error);
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

            return (
              <div
                key={conv._id}
                className={`p-3 sm:p-4 hover:bg-accent cursor-pointer transition-colors ${
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
                        <h3 className="font-semibold truncate text-sm sm:text-base">
                          {conv.type === "group" ? conv.name : other?.name}
                        </h3>
                        {conv.type === "group" && (
                          <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {conv.updatedAt &&
                          new Date(conv.updatedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
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
                      className="h-9 w-9 hidden sm:flex"
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
                return (
                  <div
                    key={message._id}
                    className={`flex mb-3 sm:mb-4 ${
                      isOwn ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] rounded-lg px-3 sm:px-4 py-2 ${
                        isOwn ? "bg-primary text-primary-foreground" : "bg-card"
                      }`}
                    >
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
                        <p className="break-words text-sm sm:text-base">
                          {message.content}
                        </p>
                      )}

                      <div className="flex items-center gap-1 justify-end mt-1">
                        <span className="text-xs opacity-70">
                          {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {getMessageStatusIcon(message)}
                      </div>
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
              <h2 className="text-xl sm:text-2xl font-semibold mb-2">
                WhatsApp Clone
              </h2>
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
      />

      <CreateGroupDialog
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onGroupCreated={handleGroupCreated}
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
    </div>
  );
}
