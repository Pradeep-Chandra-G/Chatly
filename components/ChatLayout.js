'use client';

import { useState, useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { io } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { 
  MessageCircle, 
  Send, 
  Search, 
  LogOut, 
  UserPlus,
  MoreVertical,
  Check,
  CheckCheck
} from 'lucide-react';
import { toast } from 'sonner';
import NewChatDialog from '@/components/NewChatDialog';

let socket;

export default function ChatLayout({ session }) {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Initialize Socket.io
  useEffect(() => {
    socketInitializer();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [session]);

  const socketInitializer = async () => {
    socket = io({
      path: '/socket.io/'
    });

    socket.on('connect', () => {
      console.log('Connected to socket');
      socket.emit('user:online', session.user.id);
    });

    socket.on('user:status', ({ userId, status }) => {
      setOnlineUsers((prev) => {
        const updated = new Set(prev);
        if (status === 'online') {
          updated.add(userId);
        } else {
          updated.delete(userId);
        }
        return updated;
      });
    });

    socket.on('message:new', (message) => {
      if (selectedConversation && message.conversationId === selectedConversation._id) {
        setMessages((prev) => [...prev, message]);
        // Send delivered status
        socket.emit('message:delivered', {
          messageId: message._id,
          conversationId: message.conversationId
        });
      }
      
      // Update conversation list
      loadConversations();
    });

    socket.on('message:status', ({ messageId, status }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId ? { ...msg, status } : msg
        )
      );
    });

    socket.on('user:typing', ({ userId }) => {
      if (selectedConversation) {
        setIsTyping(true);
      }
    });

    socket.on('user:stop-typing', () => {
      setIsTyping(false);
    });
  };

  // Load conversations
  useEffect(() => {
    loadConversations();
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation._id);
      socket?.emit('conversation:join', selectedConversation._id);
    }
  }, [selectedConversation]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const response = await fetch('/api/conversations');
      const data = await response.json();
      if (response.ok) {
        setConversations(data.conversations);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const loadMessages = async (conversationId) => {
    try {
      const response = await fetch(`/api/messages?conversationId=${conversationId}`);
      const data = await response.json();
      if (response.ok) {
        setMessages(data.messages);
        // Mark messages as read
        data.messages.forEach((msg) => {
          if (msg.senderId !== session.user.id && msg.status !== 'read') {
            socket?.emit('message:read', {
              messageId: msg._id,
              conversationId
            });
            // Update in database
            fetch('/api/messages/status', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messageId: msg._id, status: 'read' })
            });
          }
        });
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedConversation) return;

    const messageContent = messageInput.trim();
    setMessageInput('');

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConversation._id,
          content: messageContent
        })
      });

      const data = await response.json();
      if (response.ok) {
        // Emit to socket
        socket.emit('message:send', data.message);
        setMessages((prev) => [...prev, data.message]);
        loadConversations();
      }
    } catch (error) {
      toast.error('Failed to send message');
    }
  };

  const handleTyping = (e) => {
    setMessageInput(e.target.value);
    
    if (selectedConversation) {
      socket?.emit('typing:start', {
        conversationId: selectedConversation._id,
        userId: session.user.id
      });

      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set new timeout
      typingTimeoutRef.current = setTimeout(() => {
        socket?.emit('typing:stop', {
          conversationId: selectedConversation._id,
          userId: session.user.id
        });
      }, 1000);
    }
  };

  const handleNewConversation = (conversation) => {
    setConversations((prev) => [conversation, ...prev]);
    setSelectedConversation(conversation);
    setIsNewChatOpen(false);
  };

  const getOtherParticipant = (conversation) => {
    return conversation.participantDetails?.[0];
  };

  const isUserOnline = (userId) => {
    return onlineUsers.has(userId);
  };

  const getMessageStatusIcon = (message) => {
    if (message.senderId !== session.user.id) return null;
    
    if (message.status === 'read') {
      return <CheckCheck className="w-4 h-4 text-blue-500" />;
    } else if (message.status === 'delivered') {
      return <CheckCheck className="w-4 h-4 text-gray-400" />;
    } else {
      return <Check className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-full md:w-96 border-r border-border flex flex-col">
        {/* Header */}
        <div className="bg-card p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={session.user.image} />
                <AvatarFallback>{session.user.name?.[0]}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold">{session.user.name}</h2>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={() => setIsNewChatOpen(true)}>
                <UserPlus className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => signOut()}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search conversations..." className="pl-9" />
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          {conversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No conversations yet</p>
              <Button
                variant="link"
                className="mt-2"
                onClick={() => setIsNewChatOpen(true)}
              >
                Start a new chat
              </Button>
            </div>
          ) : (
            conversations.map((conv) => {
              const other = getOtherParticipant(conv);
              const isOnline = other && isUserOnline(other._id);
              
              return (
                <div
                  key={conv._id}
                  className={`p-4 hover:bg-accent cursor-pointer transition-colors ${
                    selectedConversation?._id === conv._id ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedConversation(conv)}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar>
                        <AvatarImage src={other?.avatar} />
                        <AvatarFallback>{other?.name?.[0]}</AvatarFallback>
                      </Avatar>
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold truncate">{other?.name}</h3>
                        <span className="text-xs text-muted-foreground">
                          {conv.updatedAt && new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {conv.lastMessage || 'No messages yet'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="bg-card p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={getOtherParticipant(selectedConversation)?.avatar} />
                  <AvatarFallback>
                    {getOtherParticipant(selectedConversation)?.name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-semibold">
                    {getOtherParticipant(selectedConversation)?.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {isTyping
                      ? 'typing...'
                      : isUserOnline(getOtherParticipant(selectedConversation)?._id)
                      ? 'online'
                      : 'offline'}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4 bg-muted/20">
              {messages.map((message) => {
                const isOwn = message.senderId === session.user.id;
                return (
                  <div
                    key={message._id}
                    className={`flex mb-4 ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-2 ${
                        isOwn
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card'
                      }`}
                    >
                      <p className="break-words">{message.content}</p>
                      <div className="flex items-center gap-1 justify-end mt-1">
                        <span className="text-xs opacity-70">
                          {new Date(message.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
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

            {/* Message Input */}
            <form onSubmit={handleSendMessage} className="bg-card p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={handleTyping}
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={!messageInput.trim()}>
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-muted/20">
            <div className="text-center">
              <MessageCircle className="w-20 h-20 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-2xl font-semibold mb-2">WhatsApp Clone</h2>
              <p className="text-muted-foreground mb-4">
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

      {/* New Chat Dialog */}
      <NewChatDialog
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onConversationCreated={handleNewConversation}
      />
    </div>
  );
}
