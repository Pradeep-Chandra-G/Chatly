import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/mongodb';

// Import auth options
const authOptions = {
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET
};

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { receiverId, type } = await request.json();

    if (!receiverId || !type) {
      return NextResponse.json(
        { error: 'Receiver ID and call type are required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const callId = uuidv4();

    const newCall = {
      _id: callId,
      callerId: session.user.id,
      receiverId,
      type, // 'voice' or 'video'
      status: 'ringing',
      startedAt: new Date(),
      endedAt: null
    };

    await db.collection('calls').insertOne(newCall);

    return NextResponse.json({ call: newCall });
  } catch (error) {
    console.error('Create call error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { callId, status } = await request.json();

    if (!callId || !status) {
      return NextResponse.json(
        { error: 'Call ID and status are required' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Verify ownership
    const call = await db.collection('calls').findOne({ _id: callId });
    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (call.callerId !== session.user.id && call.receiverId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized to modify this call' }, { status: 403 });
    }

    const updateData = { status };

    if (status === 'ended' || status === 'rejected') {
      updateData.endedAt = new Date();
    }

    await db.collection('calls').updateOne(
      { _id: callId },
      { $set: updateData }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update call error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
