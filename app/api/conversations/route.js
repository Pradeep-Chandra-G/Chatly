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

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const conversations = await db
      .collection('conversations')
      .find({ participants: session.user.id })
      .sort({ updatedAt: -1 })
      .toArray();

    // Populate participant details
    const conversationsWithDetails = await Promise.all(
      conversations.map(async (conv) => {
        const otherParticipants = conv.participants.filter(
          (p) => p !== session.user.id
        );
        const participants = await db
          .collection('users')
          .find({ _id: { $in: otherParticipants } })
          .project({ password: 0 })
          .toArray();

        return {
          ...conv,
          participantDetails: participants
        };
      })
    );

    return NextResponse.json({ conversations: conversationsWithDetails });
  } catch (error) {
    console.error('Get conversations error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { participantId, type = 'direct' } = await request.json();

    if (!participantId) {
      return NextResponse.json(
        { error: 'Participant ID is required' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Check if conversation already exists (for direct messages)
    if (type === 'direct') {
      const existingConversation = await db.collection('conversations').findOne({
        type: 'direct',
        participants: { $all: [session.user.id, participantId] }
      });

      if (existingConversation) {
        return NextResponse.json({ conversation: existingConversation });
      }
    }

    // Create new conversation
    const conversationId = uuidv4();
    const newConversation = {
      _id: conversationId,
      type,
      participants: [session.user.id, participantId],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('conversations').insertOne(newConversation);

    // Get participant details
    const participant = await db
      .collection('users')
      .findOne({ _id: participantId }, { projection: { password: 0 } });

    return NextResponse.json({
      conversation: {
        ...newConversation,
        participantDetails: [participant]
      }
    });
  } catch (error) {
    console.error('Create conversation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
