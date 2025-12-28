# 🚀 Quick Start Guide - WhatsApp Clone

## Testing the Application

### 1. Open the Application
Visit: https://securesync-5.preview.emergentagent.com

### 2. Create Your First User
1. Click on the "Register" tab
2. Fill in:
   - Name: Your name
   - Email: your@email.com
   - Password: minimum 6 characters
3. Click "Create account"

### 3. Create a Second User (for testing)
Open an incognito/private window and create another user to test messaging and calls.

### 4. Start Chatting
1. Log in with your first user
2. Click the "+" (New Chat) button
3. Search for and select the other user
4. Start sending messages!

## Features to Test

### ✅ Real-time 1-on-1 Messaging
- Open two browser windows (one regular, one incognito)
- Log in as different users
- Send messages back and forth
- Notice instant delivery!

### ✅ Message Status
Watch the checkmarks:
- ✓ Gray check: Message sent
- ✓✓ Gray checks: Message delivered
- ✓✓ Blue checks: Message read

### ✅ Typing Indicators
- Start typing in one window
- See "typing..." appear in the other window

### ✅ Online Status
- User avatars show green dot when online
- Status updates in real-time

### ✅ Group Chats
1. Click the group icon (👥) in the sidebar
2. Enter a group name
3. Select multiple members to add
4. Start chatting with the whole group!
5. Only the group creator (admin) can add/remove members

### ✅ Voice & Video Calls
1. Open a 1-on-1 conversation
2. Click the phone icon (📞) for voice call
3. Click the video icon (📹) for video call
4. Accept the call in the other window
5. During call:
   - Toggle mute/unmute
   - Toggle video on/off (for video calls)
   - End call

**Note:** Browser may ask for microphone/camera permissions - click Allow

### ✅ Media Sharing
1. Click the paperclip icon (📎) next to message input
2. Choose "Image" or "Document"
3. Select a file (max 10MB)
4. File uploads and sends automatically
5. Click images to view full size
6. Click download icon on files to download

### ✅ User Search
- Use the search bar to find users
- Search by name or email

## What's Working

✅ User registration and authentication
✅ Real-time 1-on-1 messaging
✅ Message delivery tracking
✅ Online/offline status
✅ Typing indicators
✅ Conversation history
✅ User search and discovery
✅ Group chat creation
✅ Group member management
✅ Voice calling (WebRTC)
✅ Video calling (WebRTC)
✅ Image sharing
✅ Document sharing
✅ Responsive design
✅ Socket.io real-time updates

## Advanced Features

### Group Management
- **Create Group:** Click 👥 icon, name group, select members
- **Group Info:** See member count in chat header
- **Admin Controls:** Only admin can add/remove members
- **Group Messages:** All members receive messages in real-time

### Call Features
- **Voice Calls:** Crystal clear audio with WebRTC
- **Video Calls:** HD video with local preview
- **Call Controls:** Mute, video toggle, end call
- **Call Notifications:** See incoming calls with accept/reject options
- **Call History:** All calls tracked in database

### Media Features
- **Image Upload:** Share photos with preview in chat
- **File Upload:** Share documents with download capability
- **File Info:** See filename and size
- **Max Size:** 10MB per file
- **Supported Formats:** 
  - Images: JPG, PNG, GIF, WebP
  - Documents: PDF, DOC, DOCX, TXT, ZIP

## Tips & Tricks

1. **Test Calls:** Use headphones to prevent echo during testing
2. **Multiple Users:** Use different browsers (Chrome + Firefox) or incognito windows
3. **File Size:** Keep files under 10MB for best performance
4. **Group Chats:** Test with 3+ users for full experience
5. **Mobile:** Works great on mobile browsers too!

## Troubleshooting

### Can't log in?
- Make sure you registered first
- Check email and password are correct
- Try clearing browser cookies

### Messages not appearing?
- Check both users are logged in
- Refresh the page
- Check browser console for errors

### Socket.io not connecting?
- Check server logs: `tail -f /var/log/supervisor/nextjs.out.log`
- Verify WebSocket support
- Try a different browser

### Calls not working?
- Grant microphone/camera permissions
- Check browser supports WebRTC (Chrome, Firefox, Edge, Safari)
- Ensure both users are in a 1-on-1 conversation (calls don't work in groups yet)
- Try refreshing the page
- Check firewall settings

### File upload failing?
- Ensure file is under 10MB
- Check supported file formats
- Verify server storage is available
- Try a smaller file first

## Self-Hosting

Want to host this yourself?

### Quick Deploy Options:
1. **Railway** - One-click deploy with MongoDB
2. **Vercel** - Frontend + API (need external MongoDB)
3. **DigitalOcean** - Full control with Docker
4. **AWS EC2** - Professional hosting

### Requirements:
- Node.js 18+
- MongoDB
- Domain with HTTPS (for production)

See `README.md` for detailed setup instructions.

## Development

Want to add features?

```bash
# Install dependencies
yarn install

# Run development server
yarn dev

# Build for production
yarn build
yarn start
```

The codebase is well-organized:
- `app/page.js` - Main application entry
- `components/AuthPage.js` - Login/register UI
- `components/ChatLayout.js` - Main chat interface
- `components/NewChatDialog.js` - User search and chat creation
- `app/api/` - All backend API routes
- `server.js` - Socket.io server
- `lib/` - Shared utilities

## Contributing

Found a bug or want to add a feature? Contributions are welcome!

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 🎉 Enjoy Your WhatsApp Clone!

You now have a fully functional real-time messaging application. It's open source, self-hostable, and ready for events, private communities, or any use case where you need secure, instant messaging.

**Questions?** Open an issue on the repository!
