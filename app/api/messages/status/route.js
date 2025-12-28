import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getDb } from '@/lib/mongodb';

export async function PATCH(request) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messageId, status } = await request.json();

    if (!messageId || !status) {
      return NextResponse.json(
        { error: 'Message ID and status are required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    await db.collection('messages').updateOne(
      { _id: messageId },
      { $set: { status } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update message status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
