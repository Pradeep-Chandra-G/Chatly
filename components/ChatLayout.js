"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  memo,
  useCallback,
  useLayoutEffect,
} from "react";
import { signOut } from "next-auth/react";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  ArrowDown,
  Check,
  CheckCheck,
  FileText,
  Download,
  ArrowLeft,
  X,
  Reply,
  Settings,
  Image as ImageIcon,
  Filter,
  SortAsc,
  SortDesc,
  Clock,
  Loader2, // Added Loader2 for the loading spinner
} from "lucide-react";
import { toast } from "sonner";
import NewChatDialog from "@/components/NewChatDialog";
import CreateGroupDialog from "@/components/CreateGroupDialog";
import CallModal from "@/components/CallModal";
import MediaUpload from "@/components/MediaUpload";
import GroupInfoDialog from "@/components/GroupInfoDialog";
import MessageInfoDialog from "@/components/MessageInfoDialog";

let socket;
let pingInterval;

// --- Helper Functions (Moved outside to be accessible by both components) ---

const getOtherParticipant = (conversation, currentUserId) => {
  if (!conversation?.participantDetails) return null;

  const other = conversation.participantDetails.find(
    (p) => String(p._id) !== String(currentUserId)
  );

  if (!other) {
    return conversation.participantDetails[0];
  }
  return other;
};

const SearchInput = ({ value, onChange, onClear }) => {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
      <Input
        placeholder="Search conversations..."
        className="pl-9"
        value={value}
        onChange={onChange}
        autoComplete="off"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 h-8 w-8"
          onClick={onClear}
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
};

// --- Sidebar Component (Defined OUTSIDE to prevent re-renders/focus loss) ---

const SidebarContent = memo(
  ({
    sessionUser,
    conversations,
    searchQuery,
    onSearchChange,
    onSearchClear,
    showUnreadOnly,
    onToggleUnreadOnly,
    sortBy,
    onSetSortBy,
    selectedConversation,
    onSelectConversation,
    isUserOnline,
    onOpenSettings,
    onOpenNewChat,
    onOpenCreateGroup,
    onSignOut,
  }) => {
    // Logic for filtering conversations moved INSIDE the component
    const filteredAndSortedConversations = useMemo(() => {
      let filtered = [...conversations];

      // Apply unread filter
      if (showUnreadOnly) {
        filtered = filtered.filter(
          (conv) => conv.hasUnread && conv.unreadCount > 0
        );
      }

      // Apply search filter with scoring
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();

        filtered = filtered
          .map((conv) => {
            const other = getOtherParticipant(conv, sessionUser.id);
            const name =
              (conv.type === "group" ? conv.name : other?.name) || "";
            const email = other?.email || "";
            const lastMessage = conv.lastMessage || "";

            let score = 0;
            const nameLower = name.toLowerCase();
            const emailLower = email.toLowerCase();
            const messageLower = lastMessage.toLowerCase();

            // Higher priority for name matches
            if (nameLower.includes(query)) score += 10;
            if (nameLower.startsWith(query)) score += 5;

            // Medium priority for email matches
            if (emailLower.includes(query)) score += 3;

            // Lower priority for message matches
            if (messageLower.includes(query)) score += 1;

            return { ...conv, searchScore: score };
          })
          .filter((conv) => conv.searchScore > 0)
          .sort((a, b) => b.searchScore - a.searchScore);
      }

      // Apply sorting (only if not searching)
      if (!searchQuery.trim()) {
        switch (sortBy) {
          case "nameAsc":
            filtered.sort((a, b) => {
              const nameA = (
                a.type === "group"
                  ? a.name
                  : getOtherParticipant(a, sessionUser.id)?.name || ""
              ).toLowerCase();
              const nameB = (
                b.type === "group"
                  ? b.name
                  : getOtherParticipant(b, sessionUser.id)?.name || ""
              ).toLowerCase();
              return nameA.localeCompare(nameB);
            });
            break;
          case "nameDesc":
            filtered.sort((a, b) => {
              const nameA = (
                a.type === "group"
                  ? a.name
                  : getOtherParticipant(a, sessionUser.id)?.name || ""
              ).toLowerCase();
              const nameB = (
                b.type === "group"
                  ? b.name
                  : getOtherParticipant(b, sessionUser.id)?.name || ""
              ).toLowerCase();
              return nameB.localeCompare(nameA);
            });
            break;
          case "lastMessage":
          default:
            // Already sorted by updatedAt from backend
            break;
        }
      }

      return filtered;
    }, [conversations, searchQuery, showUnreadOnly, sortBy]);

    return (
      <>
        <div className="bg-card p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={sessionUser.image} />
                <AvatarFallback>{sessionUser.name?.[0]}</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <h2 className="font-semibold text-sm">{sessionUser.name}</h2>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={onOpenSettings}
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={onOpenNewChat}
              >
                <UserPlus className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={onOpenCreateGroup}
              >
                <Users className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={onSignOut}
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <SearchInput
            value={searchQuery}
            onChange={onSearchChange}
            onClear={onSearchClear}
          />
        </div>

        {/* Filter and Sort Bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
          <Button
            variant={showUnreadOnly ? "default" : "ghost"}
            size="sm"
            className="h-8 text-xs"
            onClick={onToggleUnreadOnly}
          >
            <Filter className="w-3 h-3 mr-1" />
            Unread
            {showUnreadOnly &&
              conversations.filter((c) => c.hasUnread).length > 0 && (
                <span className="ml-1 bg-primary-foreground text-primary rounded-full px-1.5 text-xs font-semibold">
                  {conversations.filter((c) => c.hasUnread).length}
                </span>
              )}
          </Button>

          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant={sortBy === "nameAsc" ? "default" : "ghost"}
              size="sm"
              className="h-8 px-2"
              onClick={() =>
                onSetSortBy(sortBy === "nameAsc" ? "lastMessage" : "nameAsc")
              }
              title="Sort A-Z"
            >
              <SortAsc className="w-4 h-4" />
            </Button>
            <Button
              variant={sortBy === "nameDesc" ? "default" : "ghost"}
              size="sm"
              className="h-8 px-2"
              onClick={() =>
                onSetSortBy(sortBy === "nameDesc" ? "lastMessage" : "nameDesc")
              }
              title="Sort Z-A"
            >
              <SortDesc className="w-4 h-4" />
            </Button>
            <Button
              variant={sortBy === "lastMessage" ? "default" : "ghost"}
              size="sm"
              className="h-8 px-2"
              onClick={() => onSetSortBy("lastMessage")}
              title="Sort by recent"
            >
              <Clock className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {filteredAndSortedConversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-sm">
                {searchQuery
                  ? "No conversations found"
                  : "No conversations yet"}
              </p>
              {!searchQuery && (
                <Button variant="link" className="mt-2" onClick={onOpenNewChat}>
                  Start a new chat
                </Button>
              )}
            </div>
          ) : (
            filteredAndSortedConversations.map((conv) => {
              const other = getOtherParticipant(conv, sessionUser.id);
              const isOnline = other && isUserOnline(other._id);
              const isSelected = selectedConversation?._id === conv._id;
              const hasUnread = conv.hasUnread && !isSelected; // Don't show unread if selected
              const unreadCount = isSelected ? 0 : conv.unreadCount || 0;

              return (
                <div
                  key={conv._id}
                  className={`p-3 sm:p-4 hover:bg-accent cursor-pointer transition-colors relative ${
                    isSelected ? "bg-accent border-l-4 border-primary" : ""
                  }`}
                  onClick={() => onSelectConversation(conv)}
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
                          {hasUnread && unreadCount > 0 && (
                            <div className="bg-primary text-primary-foreground text-xs font-semibold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                              {unreadCount > 99 ? "99+" : unreadCount}
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
  }
);

// --- Main Component ---

export default function ChatLayout({ session }) {
  const [conversations, setConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [userLastSeen, setUserLastSeen] = useState(new Map());
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);
  const messageInputRef = useRef(null);
  const lastReadMessageIdRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const selectedConversationRef = useRef(selectedConversation);
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
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [sortBy, setSortBy] = useState("lastMessage");
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [newMessagesBelow, setNewMessagesBelow] = useState(0);
  const [isMessageInfoOpen, setIsMessageInfoOpen] = useState(false);
  const [selectedMessageForInfo, setSelectedMessageForInfo] = useState(null);

  // Sync selectedConversation with conversations state
  useEffect(() => {
    if (selectedConversation) {
      const updated = conversations.find(
        (c) => c._id === selectedConversation._id
      );
      if (updated && updated !== selectedConversation) {
        setSelectedConversation(updated);
      }
    }
  }, [conversations, selectedConversation]);

  // Group UI State
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [isLeaveGroupAlertOpen, setIsLeaveGroupAlertOpen] = useState(false);

  const handleLeaveGroup = async () => {
    if (!selectedConversation) return;

    try {
      // Note: We use the server-side session ID, but we can pass it as a query param or body for validation if needed.
      // The API we fixed checks for (memberId === session.user.id).
      const response = await fetch(
        `/api/groups/${selectedConversation._id}/members?memberId=${session.user.id}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        toast.success("You have left the group");
        setSelectedConversation(null);
        setIsLeaveGroupAlertOpen(false);
        setConversations((prev) =>
          prev.filter((c) => c._id !== selectedConversation._id)
        );
        setShowMobileChat(false);
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to leave group");
      }
    } catch (error) {
      console.error("Leave group error:", error);
      toast.error("Failed to leave group");
    }
  };

  // New states for pagination and scroll
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Refs for scroll management
  const scrollViewportRef = useRef(null);
  const prevScrollHeightRef = useRef(0);
  const shouldMaintainScrollRef = useRef(false);

  // Search Handlers (Moved BACK INSIDE the component where they belong)
  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery("");
  }, []);

  // --- SCROLL MANAGEMENT WITH useLayoutEffect ---
  // This hook runs synchronously after DOM updates but before the browser paints.
  // It effectively restores the scroll position when new messages are added at the top.
  useLayoutEffect(() => {
    if (shouldMaintainScrollRef.current && scrollViewportRef.current) {
      const container = scrollViewportRef.current;
      const newScrollHeight = container.scrollHeight;
      const heightDifference = newScrollHeight - prevScrollHeightRef.current;

      // Adjust scrollTop by the amount of new content added to the top
      if (heightDifference > 0) {
        container.scrollTop = heightDifference + container.scrollTop;
      }

      shouldMaintainScrollRef.current = false;
    }
  }, [messages]);

  // handleScroll logic moved to line ~1050 to consolidate functionality

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

  const isUserOnline = (userId) => {
    return onlineUsers.has(userId);
  };

  const formatLastSeen = (userId) => {
    if (isUserOnline(userId)) {
      return "online";
    }

    const lastSeen = userLastSeen.get(userId);
    if (!lastSeen) return "offline";

    const now = new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffMs = now - lastSeenDate;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    return lastSeenDate.toLocaleDateString();
  };

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

    socket.on("user:last-seen", ({ userId, lastSeen }) => {
      console.log(`👁️ User ${userId} last seen:`, lastSeen);
      setUserLastSeen((prev) => {
        const updated = new Map(prev);
        updated.set(userId, lastSeen);
        return updated;
      });
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    socket.on("users:online-list", ({ onlineUsers }) => {
      console.log("📋 Received online users list:", onlineUsers);
      setOnlineUsers(new Set(onlineUsers));
    });

    socket.on("user:status", ({ userId, status }) => {
      console.log(`👤 User ${userId} is now ${status}`);
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

    socket.on("conversation:unread-updated", ({ conversationId, userId }) => {
      if (userId !== session.user.id) {
        // Someone else read my messages
        setConversations((prev) =>
          prev.map((conv) =>
            conv._id === conversationId
              ? { ...conv, unreadCount: 0, hasUnread: false }
              : conv
          )
        );
      }
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

      // Handling New Conversations (Real-time DM creation)
      // Check if we already have this conversation in our list
      const knowsConversation = conversations.some(
        (c) => c._id === message.conversationId
      );

      if (!knowsConversation) {
        console.log("🆕 New conversation detected! Fetching...");
        // Force immediate fetch of conversations to populate the sidebar
        loadConversations();
      } else {
        // Just refresh to update last message preview / unread counts
        // Pass current conversation ID if we are looking at it, to prevent ghost unread count
        const currentId = selectedConversationRef.current?._id;
        const isViewing = currentId === message.conversationId;
        loadConversations(isViewing ? currentId : null);
      }

      // Mark as Read logic (Visibility Based)
      if (
        selectedConversationRef.current &&
        selectedConversationRef.current._id === message.conversationId
      ) {
        if (message.senderId !== session.user.id) {
          // Check if user is effectively viewing the bottom
          // We use the helper defined below (hoisting works for functions but better to be safe)
          // Since we can't easily access the helper from here due to closure scope of socket listener,
          // we rely on the IntersectionObserver to handle the read receipt if we scroll to bottom.
          // HERE we only decide whether to SCROLL.

          // Note: We need to access the ref directly here
          const viewport = scrollViewportRef.current;

          let isAtBottom = true;
          if (viewport) {
            const diff =
              viewport.scrollHeight -
              viewport.scrollTop -
              viewport.clientHeight;
            isAtBottom = diff < 300;
          }

          if (isAtBottom) {
            // User is watching the chat flow.
            setTimeout(() => scrollToBottom("smooth"), 100);
          } else {
            setShowScrollBottom(true);
            setNewMessagesBelow((prev) => prev + 1);
          }
        }
      }

      setSelectedConversation((currentConv) => {
        if (currentConv && message.conversationId === currentConv._id) {
          setMessages((prevMessages) => {
            if (prevMessages.some((m) => m._id === message._id)) {
              return prevMessages;
            }
            return [...prevMessages, message];
          });
          // Legacy unconditional scroll REMOVED from here.
        }
        return currentConv;
      });
    });

    socket.on("message:status", ({ messageId, status }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg._id === messageId ? { ...msg, status } : msg))
      );
    });

    socket.on(
      "message:edited",
      ({
        messageId,
        content,
        edited,
        editedAt,
        conversationId,
        isLastMessage,
      }) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === messageId ? { ...msg, content, edited, editedAt } : msg
          )
        );

        if (isLastMessage) {
          setConversations((prevConversations) =>
            prevConversations.map((conv) => {
              if (conv._id === conversationId) {
                const isCurrentlyViewing =
                  selectedConversation?._id === conversationId;

                if (!isCurrentlyViewing) {
                  return {
                    ...conv,
                    lastMessage: content,
                    updatedAt: new Date().toISOString(),
                    unreadCount: (conv.unreadCount || 0) + 1,
                    hasUnread: true,
                  };
                }

                return {
                  ...conv,
                  lastMessage: content,
                  updatedAt: new Date().toISOString(),
                };
              }
              return conv;
            })
          );
        }
      }
    );

    socket.on(
      "message:deleted",
      ({ messageId, conversationId, newLastMessage }) => {
        setMessages((prev) => prev.filter((msg) => msg._id !== messageId));

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

    socket.on("user:typing", ({ userId, conversationId }) => {
      if (conversationId === selectedConversationRef.current?._id) {
        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          newSet.add(userId);
          return newSet;
        });
      }
    });

    socket.on("user:stop-typing", ({ userId, conversationId }) => {
      if (conversationId === selectedConversationRef.current?._id) {
        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
      }
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
      if (activeCall && activeCall._id === callId) {
        toast.error("Call was rejected");
        setIsCallModalOpen(false);
        setActiveCall(null);
      }
    });

    socket.on("call:ended", ({ callId }) => {
      if (activeCall && activeCall._id === callId) {
        toast.info("Call ended");
        setIsCallModalOpen(false);
        setActiveCall(null);
      }
    });

    socket.on("message:reaction-update", ({ messageId, reactions }) => {
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
      setHasMore(true); // Reset hasMore
      setMessages([]); // Clear previous messages immediately
      lastReadMessageIdRef.current = null; // Reset read tracker
      loadMessages(selectedConversation._id, false); // Load new ones
      socket?.emit("conversation:join", selectedConversation._id);
      setShowMobileChat(true);

      setConversations((prevConversations) =>
        prevConversations.map((conv) =>
          conv._id === selectedConversation._id
            ? { ...conv, unreadCount: 0, hasUnread: false }
            : conv
        )
      );

      // Auto-focus the input
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 50); // Small delay to ensure render
    }

    return () => {
      if (selectedConversation) {
        socket?.emit("conversation:leave", selectedConversation._id);
      }
    };
    return () => {
      if (selectedConversation) {
        socket?.emit("conversation:leave", selectedConversation._id);
      }
    };
  }, [selectedConversation?._id]);

  // Update ref whenever selectedConversation changes
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  const loadConversations = async () => {
    try {
      const response = await fetch("/api/conversations");
      const data = await response.json();
      if (response.ok) {
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

  // Visibility-Based Read Receipt Logic
  useEffect(() => {
    if (!messagesEndRef.current || !selectedConversation) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // User has scrolled to the bottom (latest messages are visible)
          // We can now safely mark the conversation as read
          if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (
              lastMsg.senderId !== session.user.id &&
              lastMsg.status !== "read"
            ) {
              // Prevent duplicate calls for the same message loop
              if (lastReadMessageIdRef.current !== lastMsg._id) {
                lastReadMessageIdRef.current = lastMsg._id;
                markAsRead(selectedConversation._id, messages);
              }
            }
          }
        }
      },
      { threshold: 0.5 } // Trigger when 50% visible (or closer)
    );

    observer.observe(messagesEndRef.current);

    return () => {
      observer.disconnect();
    };
  }, [messages, selectedConversation]);

  const scrollToBottom = (behavior = "auto") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
      setNewMessagesBelow(0);
    }
  };

  const isUserAtBottom = () => {
    if (!scrollViewportRef.current) return true; // Default safely
    const { scrollTop, scrollHeight, clientHeight } = scrollViewportRef.current;

    // Threshold ~300px (3-4 messages)
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 300;

    // Sync state
    setShowScrollBottom(!isAtBottom);
    if (isAtBottom) {
      setNewMessagesBelow(0);
    }
    return isAtBottom;
  };

  const handleScroll = () => {
    if (!scrollViewportRef.current) return;

    const { scrollTop } = scrollViewportRef.current;

    // Logic 1: Load more messages (Upper Infinite Scroll)
    if (scrollTop < 50 && hasMore && !isLoadingMore && messages.length > 0) {
      loadMessages(selectedConversation._id, true);
    }

    // Logic 2: Check Bottom Visibility (triggers Button & Badge Reset)
    isUserAtBottom();
  };

  const markAsRead = async (conversationId, messages) => {
    // 1. Identify unread messages from OTHERS
    const unreadMessages = messages.filter(
      (m) => m.senderId !== session.user.id && m.status !== "read"
    );

    if (unreadMessages.length === 0) return;

    console.log(`👀 Marking ${unreadMessages.length} messages as read`);

    // 2. Optimistic UI Update (Safety Net)
    // We don't wait for API to update local unread counts in sidebar
    setConversations((prev) =>
      prev.map((c) =>
        c._id === conversationId
          ? { ...c, unreadCount: 0, hasUnread: false }
          : c
      )
    );

    try {
      // 3. API Call
      const res = await fetch(`/api/conversations/${conversationId}/read`, {
        method: "POST",
      });
      const data = await res.json();
      console.log("✅ API Mark Read Success:", data);

      // 4. Socket Emission (Crucial for Sender Blue Ticks)
      if (socket && socket.connected) {
        socket.emit("messages:mark-read", {
          messageIds: unreadMessages.map((m) => m._id),
          conversationId,
        });
      }
    } catch (error) {
      console.error("Failed to mark read:", error);
    }
  };

  const loadMessages = async (conversationId, isLoadMore = false) => {
    try {
      if (isLoadMore) {
        setIsLoadingMore(true);
        // Capture snapshot of current scroll height before adding new items
        if (scrollViewportRef.current) {
          prevScrollHeightRef.current = scrollViewportRef.current.scrollHeight;
          shouldMaintainScrollRef.current = true;
        }
      }

      // If loading more, get the createdAt of the OLDEST message we currently have
      const beforeTimestamp =
        isLoadMore && messages.length > 0 ? messages[0].createdAt : null;

      const url = new URL("/api/messages", window.location.origin);
      url.searchParams.append("conversationId", conversationId);
      url.searchParams.append("limit", "50");
      if (beforeTimestamp) {
        url.searchParams.append("before", beforeTimestamp);
      }

      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        if (isLoadMore) {
          // React state update triggers re-render.
          // useLayoutEffect will catch this and restore scroll position.
          setMessages((prev) => [...data.messages, ...prev]);
          setHasMore(data.hasMore);
        } else {
          // Initial load
          setMessages(data.messages);
          setHasMore(data.hasMore);
          // Scroll to bottom for initial load
          setTimeout(() => scrollToBottom("auto"), 100);

          // Note: We REMOVED the direct markAsRead() call here.
          // Because scrollToBottom() will bring the endRef into view,
          // triggering the IntersectionObserver, which will then call markAsRead().
          // This ensures "Visibility-Based" reading.
        }

        // Mark conversation as read (Updates Cursor & Syncs Receipts)
        // if (data.messages.length > 0 && !isLoadMore) {
        //   fetch(`/api/conversations/${conversationId}/read`, { method: "POST" })
        //     .then(res => res.json())
        //     .then(data => {
        //       console.log("✅ Marked conversation as read:", data);
        //       // Update local unread count immediately for UI responsiveness
        //       setConversations(prev => prev.map(c =>
        //         c._id === conversationId ? { ...c, unreadCount: 0, hasUnread: false } : c
        //       ));

        //       // NOTIFY SERVER via Socket so Sender sees Blue Ticks
        //       if (socket && socket.connected) {
        //         // Filter for messages that genuinely need a read receipt sent
        //         // (Messages not from me, and not already marked read in the UI data)
        //         const unreadMsgIds = data.messages
        //           ? data.messages
        //             .filter(m => m.senderId !== session.user.id && m.status !== 'read')
        //             .map(m => m._id)
        //           : [];

        //         if (unreadMsgIds.length > 0) {
        //           socket.emit("messages:mark-read", {
        //             messageIds: unreadMsgIds,
        //             conversationId,
        //           });
        //         }
        //       }
        //     })
        //     .catch(err => console.error("Failed to mark read:", err));
        // }
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedConversation) return;

    const messageContent = messageInput.trim();
    const replyToId = replyingTo?._id || null;

    setMessageInput("");
    const tempReplyingTo = replyingTo;
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

        // Scroll to bottom after sending
        setTimeout(
          () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
          100
        );

        if (socket && socket.connected) {
          socket.emit("message:send", {
            ...data.message,
            participants: selectedConversation.participants,
          });
        }

        loadConversations();
      } else {
        setReplyingTo(tempReplyingTo);
        setMessageInput(messageContent);
        toast.error("Failed to send message");
      }
    } catch (error) {
      console.error("Message send error:", error);
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
    // FIX: Check if conversation already exists in the list
    const exists = conversations.some((c) => c._id === conversation._id);

    if (!exists) {
      setConversations((prev) => [conversation, ...prev]);
    }

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
        setMessages((prev) => [...prev, data.message]);
        setTimeout(
          () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
          100
        );

        if (socket && socket.connected) {
          socket.emit("message:send", {
            ...data.message,
            participants: selectedConversation.participants,
          });
        }

        loadConversations();
      } else {
        toast.error(data.error || "Failed to send media");
      }
    } catch (error) {
      console.error("❌ Media upload error:", error);
      toast.error("Failed to send media");
    }
  };

  const initiateCall = async (type) => {
    if (!selectedConversation || selectedConversation.type === "group") {
      toast.error("Calls are only available for direct conversations");
      return;
    }

    const otherParticipant = getOtherParticipant(
      selectedConversation,
      session.user.id
    );

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

  const getMessageStatusIcon = (message) => {
    if (message.senderId !== session.user.id) return null;

    // Check explicit status OR if readBy has people (Sender is always in readBy, so > 1 means someone else read it)
    const isRead =
      message.status === "read" ||
      (message.readBy && message.readBy.length > 1);

    if (isRead) {
      return <CheckCheck className="w-4 h-4 text-blue-500" />;
    } else if (
      message.status === "delivered" ||
      (message.deliveredTo && message.deliveredTo.length > 1)
    ) {
      return <CheckCheck className="w-4 h-4 text-gray-400" />;
    } else {
      return <Check className="w-4 h-4 text-gray-400" />;
    }
  };

  const handleBackToList = () => {
    setShowMobileChat(false);
    setSelectedConversation(null);
  };

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
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      setContextMenu({
        message,
        position: { x: touch.clientX, y: touch.clientY },
        isOwnMessage: isOwn,
      });
    }, 500);

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
    if (message.type !== "text") {
      toast.error("Only text messages can be edited");
      return;
    }

    if (message.senderId !== session.user.id) {
      toast.error("You can only edit your own messages");
      return;
    }

    setEditingMessage(message);
    setIsEditDialogOpen(true);
    closeContextMenu();
  };

  const handleMessageEdited = (editedMessage, isLastMessage) => {
    setMessages((prev) =>
      prev.map((msg) => (msg._id === editedMessage._id ? editedMessage : msg))
    );

    if (socket && socket.connected) {
      socket.emit("message:edit", {
        messageId: editedMessage._id,
        conversationId: selectedConversation._id,
        content: editedMessage.content,
        edited: editedMessage.edited,
        editedAt: editedMessage.editedAt,
        isLastMessage: isLastMessage,
      });
    }

    if (isLastMessage) {
      setConversations((prevConversations) =>
        prevConversations.map((conv) => {
          if (conv._id === selectedConversation._id) {
            return {
              ...conv,
              lastMessage: editedMessage.content,
              updatedAt: new Date().toISOString(),
            };
          }
          return conv;
        })
      );
    }
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
        setMessages((prev) =>
          prev.filter((msg) => msg._id !== deletingMessage._id)
        );

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
        <SidebarContent
          sessionUser={session.user}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onSearchClear={handleSearchClear}
          conversations={conversations}
          selectedConversation={selectedConversation}
          onSelectConversation={setSelectedConversation}
          showUnreadOnly={showUnreadOnly}
          onToggleUnreadOnly={() => setShowUnreadOnly(!showUnreadOnly)}
          sortBy={sortBy}
          onSetSortBy={setSortBy}
          isUserOnline={isUserOnline}
          getOtherParticipant={getOtherParticipant} // Passed as prop
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenNewChat={() => setIsNewChatOpen(true)}
          onOpenCreateGroup={() => setIsCreateGroupOpen(true)}
          onSignOut={signOut}
        />
      </div>

      <div
        className={`${
          showMobileChat ? "hidden" : "flex"
        } md:hidden w-full flex-col`}
      >
        <SidebarContent
          sessionUser={session.user}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onSearchClear={handleSearchClear}
          conversations={conversations}
          selectedConversation={selectedConversation}
          onSelectConversation={setSelectedConversation}
          showUnreadOnly={showUnreadOnly}
          onToggleUnreadOnly={() => setShowUnreadOnly(!showUnreadOnly)}
          sortBy={sortBy}
          onSetSortBy={setSortBy}
          isUserOnline={isUserOnline}
          getOtherParticipant={getOtherParticipant} // Passed as prop
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenNewChat={() => setIsNewChatOpen(true)}
          onOpenCreateGroup={() => setIsCreateGroupOpen(true)}
          onSignOut={signOut}
        />
      </div>

      <div
        className={`${
          !showMobileChat ? "hidden md:flex" : "flex"
        } flex-1 flex-col relative`}
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
                        : getOtherParticipant(
                            selectedConversation,
                            session.user.id
                          )?.avatar
                    }
                  />
                  <AvatarFallback>
                    {selectedConversation.type === "group"
                      ? selectedConversation.name?.[0]
                      : getOtherParticipant(
                          selectedConversation,
                          session.user.id
                        )?.name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold flex items-center gap-2 text-sm sm:text-base truncate">
                    {selectedConversation.type === "group"
                      ? selectedConversation.name
                      : getOtherParticipant(
                          selectedConversation,
                          session.user.id
                        )?.name}
                    {selectedConversation.type === "group" && (
                      <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground truncate">
                    {selectedConversation.type === "group"
                      ? `${
                          selectedConversation.participantDetails?.length ||
                          selectedConversation.participants?.length ||
                          0
                        } members`
                      : typingUsers.size > 0
                      ? "typing..."
                      : formatLastSeen(
                          getOtherParticipant(
                            selectedConversation,
                            session.user.id
                          )?._id
                        )}
                  </p>
                  {/* Enhanced Typing Indicator for Groups */}
                  {selectedConversation.type === "group" &&
                    typingUsers.size > 0 && (
                      <p className="text-xs text-primary animate-pulse">
                        {(() => {
                          const writers = Array.from(typingUsers).map((id) => {
                            const member =
                              selectedConversation.participantDetails?.find(
                                (p) => p._id === id
                              );
                            return member
                              ? member.name.split(" ")[0]
                              : "Someone";
                          });
                          if (writers.length === 1)
                            return `${writers[0]} is typing...`;
                          if (writers.length === 2)
                            return `${writers.join(" and ")} are typing...`;
                          if (writers.length === 3)
                            return `${writers[0]}, ${writers[1]} and ${writers[2]} are typing...`;
                          return `${writers.slice(0, 2).join(", ")} and ${
                            writers.length - 2
                          } others are typing...`;
                        })()}
                      </p>
                    )}
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

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {selectedConversation.type === "group" && (
                      <>
                        <DropdownMenuItem
                          onClick={() => setIsGroupInfoOpen(true)}
                        >
                          <Users className="w-4 h-4 mr-2" />
                          Group Info
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-500 focus:text-red-500 focus:bg-red-50 dark:focus:bg-red-950/50"
                          onClick={() => setIsLeaveGroupAlertOpen(true)}
                        >
                          <LogOut className="w-4 h-4 mr-2" />
                          Leave Group
                        </DropdownMenuItem>
                      </>
                    )}
                    {selectedConversation.type === "direct" && (
                      <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
                        <Settings className="w-4 h-4 mr-2" />
                        Settings
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* MAIN CHAT AREA - REPLACED SCROLLAREA WITH NATIVE DIV */}
            <div
              ref={scrollViewportRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-3 sm:p-4 bg-muted/20"
              style={{ display: "flex", flexDirection: "column" }}
            >
              {/* Loading Indicator for pagination */}
              <div className="flex justify-center h-6 min-h-[24px]">
                {isLoadingMore && (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                )}
              </div>

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
                        {/* Reply preview */}
                        {message.replyToMessage && (
                          <div
                            className="bg-black/10 dark:bg-white/10 border-l-2 border-primary/50 rounded px-2 py-1 mb-2 cursor-pointer hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
                            onClick={() => {
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

                        {/* IMAGE MESSAGE */}
                        {message.type === "image" && message.mediaUrl && (
                          <div className="mb-2">
                            <img
                              src={message.mediaUrl}
                              alt="Shared image"
                              className="rounded-lg max-w-full h-auto max-h-48 sm:max-h-64 object-cover cursor-pointer"
                              onClick={() =>
                                window.open(message.mediaUrl, "_blank")
                              }
                              onError={(e) => {
                                console.error(
                                  "❌ Image failed to load:",
                                  message.mediaUrl
                                );
                                e.target.style.display = "none";
                                const errorDiv = document.createElement("div");
                                errorDiv.className = "text-xs text-red-500 p-2";
                                errorDiv.textContent = "Failed to load image";
                                e.target.parentNode.appendChild(errorDiv);
                              }}
                            />
                          </div>
                        )}

                        {/* FILE MESSAGE */}
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

                        {/* TEXT CONTENT */}
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

                        {/* TIMESTAMP & STATUS */}
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

                      {/* REACTIONS */}
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
            </div>

            {/* FIXED FLOATING BUTTON */}
            {showScrollBottom && (
              <div className="absolute bottom-24 right-6 z-50">
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-full shadow-lg animate-in fade-in zoom-in duration-200 relative bg-background/90 backdrop-blur border border-border"
                  onClick={() => scrollToBottom("smooth")}
                >
                  <ArrowDown className="w-5 h-5" />
                  {newMessagesBelow > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full shadow-sm animate-bounce">
                      {newMessagesBelow}
                    </span>
                  )}
                </Button>
              </div>
            )}

            {selectedConversation.type === "group" &&
            selectedConversation.settings?.sendMessages === "admins" &&
            !(
              selectedConversation.admins?.includes(session.user.id) ||
              selectedConversation.admin === session.user.id
            ) ? (
              <div className="bg-muted p-4 text-center text-sm text-muted-foreground border-t border-border">
                Only admins can send messages in this group
              </div>
            ) : (
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
                    conversationId={selectedConversation?._id}
                    disabled={!selectedConversation}
                  />
                  <Input
                    ref={messageInputRef}
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
            )}
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
        existingParticipantIds={conversations
          .filter((c) => c.type === "direct")
          .flatMap((c) => c.participants)
          .filter((id) => id !== session.user.id)}
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

      {/* Group Info Dialog */}
      <GroupInfoDialog
        isOpen={isGroupInfoOpen}
        onClose={() => setIsGroupInfoOpen(false)}
        conversation={selectedConversation}
        currentUserId={session.user.id}
        onUpdateGroup={(updatedGroup) => {
          setConversations((prev) =>
            prev.map((c) => (c._id === updatedGroup._id ? updatedGroup : c))
          );
          setSelectedConversation(updatedGroup);
        }}
        onLeaveGroup={handleLeaveGroup}
      />

      {/* Leave Group Alert */}
      <AlertDialog
        open={isLeaveGroupAlertOpen}
        onOpenChange={setIsLeaveGroupAlertOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Group?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave "{selectedConversation?.name}"? You
              will no longer be able to send or receive messages in this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveGroup}
              className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
            >
              Leave Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          onInfo={
            selectedConversation.type === "group"
              ? () => {
                  setSelectedMessageForInfo(contextMenu.message);
                  setIsMessageInfoOpen(true);
                  closeContextMenu();
                }
              : undefined
          }
          onEdit={() => handleEditMessage(contextMenu.message)}
          onDelete={() => handleDeleteMessage(contextMenu.message)}
          isOwnMessage={contextMenu.isOwnMessage}
          existingReactions={contextMenu.message.reactions || []}
          currentUserId={session.user.id}
        />
      )}
      <MessageInfoDialog
        isOpen={isMessageInfoOpen}
        onClose={() => {
          setIsMessageInfoOpen(false);
          setSelectedMessageForInfo(null);
        }}
        message={selectedMessageForInfo}
        participantDetails={selectedConversation?.participantDetails}
      />
    </div>
  );
}
