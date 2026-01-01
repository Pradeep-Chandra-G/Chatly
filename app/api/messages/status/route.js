import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getDb } from '@/lib/mongodb';
import CredentialsProvider from "next-auth/providers/credentials";

// Define authOptions locally to ensure session callback populates user.id
const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {},
      async authorize(credentials) { return null; },
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
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
    const now = new Date();

    // Always update global status for legacy clients
    const baseUpdate = { $set: { status } };

    if (status === 'delivered') {
      // Add to deliveredTo if not already present
      await db.collection('messages').updateOne(
        {
          _id: messageId,
          "deliveredTo.userId": { $ne: session.user.id }
        },
        {
          $set: { status },
          $push: { deliveredTo: { userId: session.user.id, at: now } }
        }
      );
      // Note: We run a second update for the legacy status just in case the first one didn't match (user already delivered)
      // but that's fine, we can just force the status update separately or assume it's fine.
      // Actually, simpler: Just try to push. If it fails (already there), fine. 
      // But we MUST update status.
      await db.collection('messages').updateOne({ _id: messageId }, { $set: { status: 'delivered' } });
    }
    else if (status === 'read') {
      // 1. Add to deliveredTo (logic: if you read it, you received it)
      await db.collection('messages').updateOne(
        { _id: messageId, "deliveredTo.userId": { $ne: session.user.id } },
        { $push: { deliveredTo: { userId: session.user.id, at: now } } }
      );

      // 2. Add to readBy
      await db.collection('messages').updateOne(
        { _id: messageId, "readBy.userId": { $ne: session.user.id } },
        {
          $set: { status: 'read' },
          $push: { readBy: { userId: session.user.id, at: now } }
        }
      );

      // Force status update just in case they already read it but we want to ensure eventual consistency?
      // No, if they already read it, status is already read.
      // But for legacy compatibility, we might want to ensure 'status' is 'read' even if specific user update failed.
      await db.collection('messages').updateOne({ _id: messageId }, { $set: { status: 'read' } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update message status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
