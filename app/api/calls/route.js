import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/mongodb';

export async function POST(request) {
  try {
    const session = await getServerSession();
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
    const session = await getServerSession();
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
