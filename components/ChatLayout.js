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
  Users,
  Phone,
  Video,
  MoreVertical,
  Check,
  CheckCheck,
  Image as ImageIcon,
  FileText,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import NewChatDialog from '@/components/NewChatDialog';
import CreateGroupDialog from '@/components/CreateGroupDialog';
import CallModal from '@/components/CallModal';
import MediaUpload from '@/components/MediaUpload';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

let socket;

export default function ChatLayout({ session }) {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
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

    // Call event listeners
    socket.on('call:incoming', ({ callId, callerId, type, offer }) => {
      // Get caller details
      const caller = conversations
        .flatMap(c => c.participantDetails || [])
        .find(u => u._id === callerId);
      
      setActiveCall({
        _id: callId,
        callerId,
        receiverId: session.user.id,
        type,
        offer,
        receiverName: caller?.name || 'Unknown',
        receiverAvatar: caller?.avatar
      });
      setIsIncomingCall(true);
      setIsCallModalOpen(true);
      
      // Play ringtone (you can add audio here)
      toast.info(`Incoming ${type} call from ${caller?.name || 'Unknown'}`);
    });

    socket.on('call:rejected', ({ callId }) => {
      toast.error('Call was rejected');
      setIsCallModalOpen(false);
      setActiveCall(null);
    });

    socket.on('call:ended', ({ callId }) => {
      toast.info('Call ended');
      setIsCallModalOpen(false);
      setActiveCall(null);
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

  const handleGroupCreated = (group) => {
    setConversations((prev) => [group, ...prev]);
    setSelectedConversation(group);
    setIsCreateGroupOpen(false);
  };

  const handleMediaUploaded = async (media) => {
    if (!selectedConversation) return;

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConversation._id,
          content: media.fileName || 'Media file',
          type: media.type,
          mediaUrl: media.url,
          fileName: media.fileName,
          fileSize: media.fileSize
        })
      });

      const data = await response.json();
      if (response.ok) {
        socket.emit('message:send', data.message);
        setMessages((prev) => [...prev, data.message]);
        loadConversations();
      }
    } catch (error) {
      toast.error('Failed to send media');
    }
  };

  const initiateCall = async (type) => {
    if (!selectedConversation || selectedConversation.type === 'group') {
      toast.error('Calls are only available for direct conversations');
      return;
    }

    const otherParticipant = getOtherParticipant(selectedConversation);
    
    try {
      const response = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: otherParticipant._id,
          type
        })
      });

      const data = await response.json();
      if (response.ok) {
        setActiveCall({
          ...data.call,
          receiverName: otherParticipant.name,
          receiverAvatar: otherParticipant.avatar
        });
        setIsIncomingCall(false);
        setIsCallModalOpen(true);
      }
    } catch (error) {
      toast.error('Failed to initiate call');
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
              <Button variant="ghost" size="icon" onClick={() => setIsCreateGroupOpen(true)}>
                <Users className="w-5 h-5" />
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
                        <AvatarImage src={conv.type === 'group' ? conv.avatar : other?.avatar} />
                        <AvatarFallback>
                          {conv.type === 'group' ? conv.name?.[0] : other?.name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {conv.type === 'direct' && isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">
                            {conv.type === 'group' ? conv.name : other?.name}
                          </h3>
                          {conv.type === 'group' && (
                            <Users className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
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
                  <AvatarImage 
                    src={selectedConversation.type === 'group' 
                      ? selectedConversation.avatar 
                      : getOtherParticipant(selectedConversation)?.avatar
                    } 
                  />
                  <AvatarFallback>
                    {selectedConversation.type === 'group'
                      ? selectedConversation.name?.[0]
                      : getOtherParticipant(selectedConversation)?.name?.[0]
                    }
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-semibold flex items-center gap-2">
                    {selectedConversation.type === 'group'
                      ? selectedConversation.name
                      : getOtherParticipant(selectedConversation)?.name
                    }
                    {selectedConversation.type === 'group' && (
                      <Users className="w-4 h-4 text-muted-foreground" />
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedConversation.type === 'group'
                      ? `${selectedConversation.participants?.length || 0} members`
                      : isTyping
                      ? 'typing...'
                      : isUserOnline(getOtherParticipant(selectedConversation)?._id)
                      ? 'online'
                      : 'offline'
                    }
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {selectedConversation.type === 'direct' && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => initiateCall('voice')}>
                      <Phone className="w-5 h-5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => initiateCall('video')}>
                      <Video className="w-5 h-5" />
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </div>
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
                      {/* Media Content */}
                      {message.type === 'image' && message.mediaUrl && (
                        <div className="mb-2">
                          <img
                            src={message.mediaUrl}
                            alt="Shared image"
                            className="rounded-lg max-w-full h-auto max-h-64 object-cover cursor-pointer"
                            onClick={() => window.open(message.mediaUrl, '_blank')}
                          />
                        </div>
                      )}
                      {message.type === 'file' && message.mediaUrl && (
                        <a
                          href={message.mediaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-3 bg-muted/20 rounded-lg hover:bg-muted/30 transition-colors mb-2"
                        >
                          <FileText className="w-8 h-8" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{message.fileName || 'File'}</p>
                            <p className="text-xs opacity-70">
                              {message.fileSize ? `${(message.fileSize / 1024).toFixed(2)} KB` : 'Download'}
                            </p>
                          </div>
                          <Download className="w-5 h-5" />
                        </a>
                      )}
                      
                      {/* Text Content */}
                      {message.content && (
                        <p className="break-words">{message.content}</p>
                      )}
                      
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
                <MediaUpload
                  onMediaUploaded={handleMediaUploaded}
                  disabled={!selectedConversation}
                />
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

      {/* Create Group Dialog */}
      <CreateGroupDialog
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onGroupCreated={handleGroupCreated}
      />

      {/* Call Modal */}
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
