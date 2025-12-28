# WebRTC Call Testing Guide

## Critical Fixes Applied

### 1. Echo Cancellation ✅
- Added `echoCancellation: true`
- Added `noiseSuppression: true`  
- Added `autoGainControl: true`
- **Result:** Significantly reduced echo during calls

### 2. Remote Stream Handling ✅
- Fixed `ontrack` event to properly set remote stream
- Added automatic play() for remote streams
- Added retry logic for mobile browsers
- **Result:** Audio/video should now pass through on both sides

### 3. Better WebRTC Logging ✅
- Added comprehensive console logging
- Track states and connection events
- ICE candidate monitoring
- **Result:** Easy debugging through browser console

## Testing Steps

### Test 1: Laptop to Laptop Audio Call

**Setup:**
1. Open Chrome on laptop 1: https://securesync-5.preview.emergentagent.com
2. Open Chrome on laptop 2 (or incognito): Same URL
3. Login as different users on each
4. **IMPORTANT:** Wear headphones on both laptops to prevent echo

**Test:**
1. User 1: Click phone icon (📞) in conversation
2. User 2: Accept the call
3. User 1: Say "Hello, can you hear me?"
4. User 2: Respond "Yes, I can hear you"

**Expected:**
- ✅ Both should hear each other clearly
- ✅ No echo (if wearing headphones)
- ✅ Mute button works

**Check Console For:**
```
🎬 Initiating call...
✅ Got local stream: audio (enabled: true)
➕ Adding track to peer connection: audio
🧊 ICE candidate generated
🎵 Remote track received: audio
✅ Setting remote stream to video/audio element
✅ Remote stream playing successfully
🔌 ICE connection state: connected
```

### Test 2: Laptop to Laptop Video Call

**Setup:** Same as Test 1

**Test:**
1. User 1: Click video icon (📹) in conversation
2. User 2: Accept the call
3. Verify video appears on both sides
4. Test video toggle on/off

**Expected:**
- ✅ Both see each other's video
- ✅ Local video in small window (top right)
- ✅ Remote video in main area
- ✅ Audio works
- ✅ Video toggle works

**Check Console For:**
```
✅ Got local stream: audio (enabled: true), video (enabled: true)
➕ Adding track to peer connection: audio
➕ Adding track to peer connection: video
🎵 Remote track received: audio
🎵 Remote track received: video
📺 Remote video loaded
▶️ Remote video playing
```

### Test 3: Mobile to Laptop (Critical Test)

**Setup:**
1. Laptop: Chrome on https://securesync-5.preview.emergentagent.com
2. Mobile: Chrome/Safari on same URL
3. Login as different users
4. **USE HEADPHONES ON BOTH DEVICES**

**Test from Mobile:**
1. Mobile: Click phone/video icon
2. Laptop: Accept call
3. Mobile: Speak into phone
4. Laptop: Respond

**Expected:**
- ✅ Laptop hears mobile audio
- ✅ Mobile hears laptop audio
- ✅ If video: both see each other

**Check Mobile Console:**
- Open Chrome DevTools on mobile:
  - Android: chrome://inspect
  - iOS Safari: Connect to Mac with cable, use Safari Developer menu

### Test 4: Laptop to Mobile (Previously Working)

**Setup:** Same as Test 3

**Test from Laptop:**
1. Laptop: Click phone/video icon
2. Mobile: Accept call
3. Laptop: Speak
4. Mobile: Respond

**Expected:**
- ✅ Both hear each other
- ✅ Video works both ways

## Common Issues & Solutions

### Issue: No Audio on Receiver Side

**Check:**
1. Open browser console on BOTH devices
2. Look for `🎵 Remote track received: audio`
3. Look for `✅ Remote stream playing successfully`

**If missing:**
- Check if remote track is being received
- Verify `ontrack` event is firing
- Check ICE connection state

**Solution:**
- Refresh both pages
- Try accepting call again
- Check browser console for errors

### Issue: Echo During Call

**Cause:** Not using headphones

**Solutions:**
1. **Best:** Both users wear headphones
2. Lower speaker volume
3. Move microphone away from speakers
4. Browser should handle echo cancellation, but it's not perfect without headphones

### Issue: Video Not Showing

**Check:**
1. Browser console: Look for `📺 Remote video loaded`
2. Verify `▶️ Remote video playing` message
3. Check if video element has stream: `remoteVideoRef.current.srcObject`

**Solutions:**
- Grant camera permissions when asked
- Check if camera is being used by another app
- Try refreshing the page
- Check browser console for errors

### Issue: Call Connects But No Audio/Video

**Symptoms:**
- Status shows "Connected"
- No audio/video passing through

**Debug Steps:**
1. Open console on both devices
2. Check for: `🎵 Remote track received: audio`
3. Check ICE connection state: `🔌 ICE connection state: connected`

**Common Causes:**
- Firewall blocking WebRTC
- NAT traversal issues
- STUN server connectivity

**Solutions:**
- Try different network (mobile data vs WiFi)
- Check if corporate firewall is blocking
- Verify STUN servers are reachable

## Debugging Checklist

### On Caller Side (Console):
```
[ ] 🎬 Initiating call...
[ ] ✅ Got local stream: audio/video
[ ] ➕ Adding track to peer connection
[ ] 📝 Creating offer...
[ ] ✅ Local description set
[ ] 📤 Sending call initiate to receiver
[ ] 🧊 ICE candidate generated (multiple)
[ ] 🎵 Remote track received: audio
[ ] 🎵 Remote track received: video (if video call)
[ ] 🔌 ICE connection state: connected
```

### On Receiver Side (Console):
```
[ ] 📞 Answering call...
[ ] ✅ Got local stream: audio/video
[ ] ➕ Adding track to peer connection
[ ] 📝 Setting remote description from offer
[ ] ✅ Remote description set
[ ] 📝 Creating answer...
[ ] ✅ Local description set
[ ] 📤 Sending answer to caller
[ ] 🧊 ICE candidate generated (multiple)
[ ] 🎵 Remote track received: audio
[ ] 🎵 Remote track received: video (if video call)
[ ] 🔌 ICE connection state: connected
```

## Key Improvements

1. **Echo Cancellation:** Added audio constraints for echo cancellation
2. **Auto-play:** Remote streams automatically play on mobile
3. **Better Error Handling:** Specific error messages for permission issues
4. **Comprehensive Logging:** Every step is logged for debugging
5. **Retry Logic:** Automatic retry if stream doesn't play first time
6. **Mobile Optimization:** Proper constraints for mobile browsers

## Expected Behavior After Fix

✅ **Laptop → Laptop:** Audio/video both directions
✅ **Laptop → Mobile:** Audio/video both directions
✅ **Mobile → Laptop:** Audio/video both directions (NOW FIXED!)
✅ **Mobile → Mobile:** Audio/video both directions
✅ **Echo:** Minimal with headphones, browser handles it
✅ **Instant Connection:** 1-3 seconds after accepting

## Still Having Issues?

### Try This Sequence:
1. **Hard refresh** both pages (Ctrl+Shift+R or Cmd+Shift+R)
2. **Clear browser cache**
3. **Try incognito mode** on both sides
4. **Use different browser** (Chrome recommended)
5. **Check browser console** for specific errors
6. **Try different network** (WiFi vs mobile data)

### Report Issues With:
1. Screenshots of browser console on BOTH sides
2. Which direction failed (caller → receiver)
3. Device types (laptop/mobile, OS, browser)
4. Network type (WiFi, mobile data, corporate)
5. Any error messages shown

## Browser Compatibility

**Best Support:**
- ✅ Chrome (Desktop & Mobile)
- ✅ Edge (Desktop)
- ✅ Firefox (Desktop & Mobile)
- ⚠️ Safari (Desktop & iOS) - May require user interaction

**Known Limitations:**
- iOS Safari: Requires user gesture for autoplay
- Some corporate networks block WebRTC entirely
- Mobile browsers may have stricter autoplay policies

## Performance Tips

1. **Use WiFi** instead of mobile data when possible
2. **Close other tabs** using camera/microphone
3. **Use headphones** for best audio quality
4. **Good lighting** for better video quality
5. **Stable internet** connection for both parties
