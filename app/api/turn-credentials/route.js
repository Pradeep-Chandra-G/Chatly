import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.METERED_API_KEY;
    
    if (!apiKey || apiKey === 'your-metered-api-key-here') {
      // Return default free TURN servers if no API key
      return NextResponse.json({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ]
      });
    }

    // Fetch credentials from Metered.ca
    const response = await fetch(
      `https://whatsapp-clone.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch TURN credentials');
    }

    const turnCredentials = await response.json();
    
    return NextResponse.json({
      iceServers: turnCredentials
    });
  } catch (error) {
    console.error('Error fetching TURN credentials:', error);
    
    // Fallback to free TURN servers
    return NextResponse.json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    });
  }
}
