# WhatsApp Clone - Encrypted Instant Messaging

A fully functional, open-source WhatsApp clone with real-time messaging, built for self-hosting.

## 🚀 Features Implemented

### ✅ Phase 1: Core 1-on-1 Messaging (COMPLETE)

**Authentication:**
- Email/password registration and login
- NextAuth integration
- Google OAuth ready (add credentials to .env)
- Secure password hashing with bcrypt
- Session management

**Real-time Messaging:**
- Instant 1-on-1 messaging via Socket.io
- Message delivery status (sent/delivered/read)
- Typing indicators
- Online/offline status tracking
- Automatic reconnection handling
- Message persistence in MongoDB

**User Interface:**
- Beautiful, responsive design with Tailwind CSS + shadcn/ui
- WhatsApp-like layout (sidebar + chat area)
- User search and discovery
- Conversation list with last message preview
- Message timestamps
- Read receipts (checkmarks)
- Avatar generation (DiceBear)
- Dark mode support ready

**Backend APIs:**
- `/api/auth/register` - User registration
- `/api/auth/[...nextauth]` - NextAuth endpoints
- `/api/users` - Get and search users
- `/api/conversations` - Manage conversations
- `/api/messages` - Send and retrieve messages
- `/api/messages/status` - Update message status

### 🔜 Next Phases (Ready to Build)

**Phase 2: Group Messaging**
- Create and manage groups
- Add/remove members
- Group admin features
- Group notifications

**Phase 3: WebRTC Calling**
- Voice calling (1-on-1)
- Video calling (1-on-1)
- Call signaling via Socket.io
- Call notifications and history

**Phase 4: Media Sharing**
- Image upload and sharing
- File upload and sharing
- Audio messages
- Video sharing

## 🛠️ Technology Stack

- **Frontend:** Next.js 14, React, Tailwind CSS, shadcn/ui
- **Backend:** Next.js API Routes, Custom Node.js server
- **Real-time:** Socket.io (WebSocket)
- **Database:** MongoDB
- **Authentication:** NextAuth.js
- **Encryption:** TLS/HTTPS (Transport Layer Security)

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+
- MongoDB
- Yarn package manager

### Environment Variables

The `.env` file is already configured with:

```env
# Database
MONGO_URL=mongodb://localhost:27017
DB_NAME=whatsapp_clone

# Application URL
NEXT_PUBLIC_BASE_URL=https://your-domain.com

# CORS
CORS_ORIGINS=*

# NextAuth
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-secret-key-change-in-production

# Google OAuth (Optional)
# GOOGLE_CLIENT_ID=your-google-client-id
# GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### Setup Steps

1. **Install Dependencies:**
```bash
yarn install
```

2. **Start MongoDB:**
MongoDB should be running on localhost:27017

3. **Run Development Server:**
```bash
yarn dev
```

The application will be available at http://localhost:3000

4. **Production Build:**
```bash
yarn build
yarn start
```

## 🔐 Security Features

- **TLS Encryption:** All data transmitted over HTTPS
- **Password Hashing:** bcrypt with salt rounds
- **Session Management:** Secure JWT tokens via NextAuth
- **API Authentication:** Protected endpoints require valid sessions
- **CORS Configuration:** Configurable origin restrictions
- **Input Validation:** Server-side validation for all inputs
- **MongoDB Injection Prevention:** Parameterized queries

## 🏗️ Architecture

### Real-time Communication Flow

```
Client <-> Socket.io <-> Server <-> MongoDB
  |                                    |
  └─────── HTTP/HTTPS APIs ───────────┘
```

### Socket.io Events

**Client -> Server:**
- `user:online` - User comes online
- `typing:start` - User starts typing
- `typing:stop` - User stops typing
- `conversation:join` - Join conversation room
- `conversation:leave` - Leave conversation room
- `message:send` - Send new message
- `message:delivered` - Mark message as delivered
- `message:read` - Mark message as read

**Server -> Client:**
- `user:status` - User online/offline status
- `message:new` - New message received
- `message:status` - Message status update
- `user:typing` - User is typing
- `user:stop-typing` - User stopped typing

### Database Schema

**Users Collection:**
```javascript
{
  _id: UUID,
  name: String,
  email: String (unique),
  password: String (hashed),
  avatar: String (URL),
  status: String (online/offline),
  createdAt: Date
}
```

**Conversations Collection:**
```javascript
{
  _id: UUID,
  type: String (direct/group),
  participants: [UUID],
  lastMessage: String,
  createdAt: Date,
  updatedAt: Date
}
```

**Messages Collection:**
```javascript
{
  _id: UUID,
  conversationId: UUID,
  senderId: UUID,
  content: String,
  status: String (sent/delivered/read),
  createdAt: Date
}
```

## 🔄 Self-Hosting Guide

### Option 1: Docker (Recommended)

1. Create a `docker-compose.yml`:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGO_URL=mongodb://mongo:27017
      - DB_NAME=whatsapp_clone
      - NEXTAUTH_SECRET=your-secret-key
    depends_on:
      - mongo
  
  mongo:
    image: mongo:6
    volumes:
      - mongo_data:/data/db
    ports:
      - "27017:27017"

volumes:
  mongo_data:
```

2. Run:
```bash
docker-compose up -d
```

### Option 2: Traditional Server

1. Install Node.js and MongoDB
2. Clone the repository
3. Configure .env file
4. Run with PM2:
```bash
pm2 start yarn --name whatsapp-clone -- start
```

### Option 3: Cloud Platforms

- **Vercel:** Deploy frontend + API routes (requires external MongoDB)
- **Railway:** Full-stack deployment with MongoDB
- **DigitalOcean:** Droplet with Docker setup
- **AWS EC2:** Full control with Docker or PM2

## 🧪 Testing

The backend has been comprehensively tested:

✅ User registration and authentication
✅ User search and discovery
✅ Conversation creation and management
✅ Message sending and retrieval
✅ Message status updates
✅ Real-time Socket.io connections
✅ API security and authorization
✅ Database operations

## 📱 Usage

1. **Register:** Create an account with email and password
2. **Find Users:** Search for other users to chat with
3. **Start Chat:** Click on a user to start a conversation
4. **Send Messages:** Type and send real-time messages
5. **Track Status:** See when messages are delivered and read
6. **Online Status:** See who's currently online

## 🎨 Customization

### Add Google OAuth

1. Get credentials from [Google Cloud Console](https://console.cloud.google.com)
2. Add to `.env`:
```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true
```

### Change Theme Colors

Edit `tailwind.config.js` to customize colors and design system.

### Add Custom Features

The codebase is modular and easy to extend:
- `components/` - React components
- `app/api/` - Backend API routes
- `lib/` - Shared utilities
- `server.js` - Socket.io server

## 🐛 Troubleshooting

### Socket.io not connecting
- Ensure custom server is running (check `server.js`)
- Verify WebSocket support on your hosting platform
- Check CORS settings in `.env`

### Messages not sending
- Verify MongoDB connection
- Check authentication session
- Inspect browser console for errors

### Authentication issues
- Clear browser cookies
- Verify `NEXTAUTH_SECRET` is set
- Check NextAuth logs in terminal

## 🤝 Contributing

This is an open-source project. Contributions welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - Feel free to use for personal or commercial projects.

## 🔮 Roadmap

- [x] User authentication
- [x] 1-on-1 messaging
- [x] Real-time updates
- [x] Message status tracking
- [ ] Group messaging
- [ ] Voice calling
- [ ] Video calling
- [ ] Media sharing
- [ ] Message encryption (E2E)
- [ ] Push notifications
- [ ] Mobile app (React Native)

## 💡 Technical Decisions

**Why Socket.io?**
- Easy to self-host
- Automatic reconnection
- Fallback mechanisms
- Wide browser support
- Great documentation

**Why MongoDB?**
- Flexible schema
- Horizontal scaling
- Rich query capabilities
- Great for real-time apps
- Easy to set up

**Why Next.js?**
- Full-stack framework
- API routes + frontend
- Great developer experience
- Production-ready
- Easy deployment

## 📞 Support

For issues, questions, or feature requests, please open an issue on the repository.

---

Built with ❤️ for the open-source community
