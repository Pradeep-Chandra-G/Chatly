import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import CredentialsProvider from "next-auth/providers/credentials";

// Re-using the authOptions pattern (ideally should be in a lib file)
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

export async function GET(request, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { messageId } = params;
        if (!messageId) {
            return NextResponse.json({ error: 'Message ID required' }, { status: 400 });
        }

        const db = await getDb();

        // Fetch message
        const message = await db.collection('messages').findOne({ _id: messageId });
        if (!message) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        // Security: Check if user is a participant of the conversation
        const conversation = await db.collection('conversations').findOne({
            _id: message.conversationId,
            participants: session.user.id
        });

        if (!conversation) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        return NextResponse.json(message);
    } catch (error) {
        console.error('Get message error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
