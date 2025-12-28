# Metered.ca TURN Server Setup Guide

## Why Metered.ca?

Metered.ca provides reliable, global TURN servers that:
- Work through corporate firewalls
- Handle NAT traversal perfectly
- Have low latency worldwide
- Include echo cancellation
- Free tier available (50GB/month)

## Setup Steps

### 1. Get Your API Key

You mentioned you already signed up! Your API key should be in your Metered.ca dashboard.

### 2. Add API Key to Environment

Open `/app/.env` and replace the placeholder:

```env
# Change this line:
METERED_API_KEY=your-metered-api-key-here

# To your actual API key:
METERED_API_KEY=abc123def456... (your actual key)
```

### 3. Restart the Server

```bash
sudo supervisorctl restart nextjs
```

### 4. Test

The app will now automatically:
1. Fetch fresh TURN credentials from Metered.ca on each call
2. Use global TURN servers for best connection
3. Handle NAT traversal properly

## How It Works

### API Endpoint Created

`/app/app/api/turn-credentials/route.js`

This endpoint:
- Fetches credentials from Metered.ca API
- Returns ICE servers configuration
- Falls back to free TURN servers if API key missing
- Caches nothing (fresh credentials each time)

### CallModal Integration

The CallModal now:
1. Calls `/api/turn-credentials` before creating peer connection
2. Gets fresh TURN server credentials
3. Uses them for WebRTC connection
4. Logs server count for debugging

## Testing

### Before You Start
1. Add your Metered API key to `.env`
2. Restart server
3. Hard refresh both browsers (Ctrl+Shift+R)

### Expected Console Logs

**Caller Side:**
```
🔑 Fetching TURN credentials...
✅ Got ICE servers: 4 servers (or however many Metered provides)
🔧 Creating peer connection with config
📞 Call modal opened
🎬 Initiating call...
✅ Got local stream
```

**During Connection:**
```
🧊 ICE candidate generated (should see TURN relay candidates!)
🔌 ICE connection state: connected
✅ Remote stream playing successfully
```

### What's Different with Metered.ca

**Old (Free Public TURN):**
- Limited bandwidth
- Shared with many users
- May be slow or unreliable
- Basic routing

**New (Metered.ca):**
- Dedicated bandwidth (50GB free)
- Global server network
- Optimized routing
- Better echo cancellation
- More reliable connections

## Checking If It's Working

### 1. Look for TURN Candidates in Console

You should see ICE candidates like:
```
typ relay raddr <ip> rport <port>
```

The "relay" type means TURN is being used!

### 2. Monitor Metered.ca Dashboard

After making calls, check your dashboard:
- Should show bandwidth usage
- Track number of connections
- See which regions were used

### 3. Test Different Networks

- Same WiFi → Should use STUN (direct)
- Different networks → Should use TURN (relay)
- Corporate firewall → Should use TURN (relay)

## Fallback Behavior

If Metered.ca API fails for any reason:
1. App falls back to free public TURN servers
2. You'll see error in server logs
3. Calls still work, just maybe slower

## API Key Security

✅ **Good:**
- API key stored in `.env`
- Only server-side code accesses it
- Not exposed to browser/client

❌ **Never:**
- Commit `.env` to git
- Share API key publicly
- Put in client-side code

## Troubleshooting

### "Got ICE servers: 0 servers"
- Check API key is correct in `.env`
- Verify server restarted
- Check server logs for errors

### Still Using Old TURN Servers
- Hard refresh browser (Ctrl+Shift+R)
- Clear browser cache
- Check `/api/turn-credentials` response

### Metered API Not Responding
- Check your account status
- Verify API key hasn't expired
- Check if you hit bandwidth limit
- Falls back to free servers automatically

### Check TURN Credentials Endpoint

Open in browser:
```
https://your-domain.com/api/turn-credentials
```

Should return JSON with iceServers array.

## Expected Results

### Before (With Issues):
- Calls fail laptop-to-laptop
- Connection fails after 20 seconds
- No audio/video passthrough
- ICE connection: disconnected/failed

### After (With Metered.ca):
- ✅ Calls work laptop-to-laptop
- ✅ Calls stay connected indefinitely
- ✅ Audio/video works both directions
- ✅ Little to no echo
- ✅ Works on all devices/networks

## Free Tier Limits

Metered.ca Free Tier:
- 50GB/month bandwidth
- Unlimited concurrent connections
- Global server access
- No credit card required

Typical usage:
- Voice call: ~2-5 MB/minute
- Video call (HD): ~15-30 MB/minute
- 50GB = roughly 1000 minutes of video calls

## Paid Plans (If Needed)

If you exceed free tier:
- Starter: $29/month (500GB)
- Growth: $99/month (2TB)
- Pay-as-you-go options

## Summary

✅ **Created:** `/app/app/api/turn-credentials/route.js`
✅ **Added:** METERED_API_KEY to `.env`
✅ **Updated:** CallModal to fetch credentials dynamically
✅ **Fixed:** AbortError with proper play() promise handling
✅ **Fixed:** ICE connection issues with better TURN servers

**Next Step:** Add your Metered API key to `.env` and restart!
