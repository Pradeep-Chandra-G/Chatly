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

    const { name, members } = await request.json();

    if (!name || !members || members.length === 0) {
      return NextResponse.json(
        { error: 'Group name and members are required' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Create group conversation
    const groupId = uuidv4();
    const allMembers = [session.user.id, ...members];
    
    const newGroup = {
      _id: groupId,
      type: 'group',
      name,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${name}`,
      participants: allMembers,
      admin: session.user.id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('conversations').insertOne(newGroup);

    // Get participant details
    const participantDetails = await db
      .collection('users')
      .find({ _id: { $in: allMembers } })
      .project({ password: 0 })
      .toArray();

    return NextResponse.json({
      group: {
        ...newGroup,
        participantDetails
      }
    });
  } catch (error) {
    console.error('Create group error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
