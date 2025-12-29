// app/api/conversations/route.js - FIXED VERSION
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/mongodb";

const authOptions = {
  session: {
    strategy: "jwt",
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
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDb();
    const conversations = await db
      .collection("conversations")
      .find({ participants: session.user.id })
      .sort({ updatedAt: -1 })
      .toArray();

    // Populate participant details and count unread messages
    const conversationsWithDetails = await Promise.all(
      conversations.map(async (conv) => {
        const otherParticipants = conv.participants.filter(
          (p) => p !== session.user.id
        );
        const participants = await db
          .collection("users")
          .find({ _id: { $in: otherParticipants } })
          .project({ password: 0 })
          .toArray();

        // CRITICAL FIX: Count unread messages properly
        // Messages sent by others AND not read by current user
        const unreadMessages = await db
          .collection("messages")
          .find({
            conversationId: conv._id,
            senderId: { $ne: session.user.id }, // NOT sent by me
            status: { $in: ["sent", "delivered"] }, // NOT read yet
          })
          .toArray();

        const unreadCount = unreadMessages.length;

        console.log(
          `📊 Conversation ${conv._id}: ${unreadCount} unread messages`
        );

        return {
          ...conv,
          participantDetails: participants,
          hasUnread: unreadCount > 0,
          unreadCount: unreadCount,
        };
      })
    );

    return NextResponse.json({ conversations: conversationsWithDetails });
  } catch (error) {
    console.error("Get conversations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { participantId, type = "direct" } = await request.json();

    if (!participantId) {
      return NextResponse.json(
        { error: "Participant ID is required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Check if conversation already exists (for direct messages)
    if (type === "direct") {
      const existingConversation = await db
        .collection("conversations")
        .findOne({
          type: "direct",
          participants: { $all: [session.user.id, participantId] },
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
      updatedAt: new Date(),
    };

    await db.collection("conversations").insertOne(newConversation);

    // Get participant details
    const participant = await db
      .collection("users")
      .findOne({ _id: participantId }, { projection: { password: 0 } });

    return NextResponse.json({
      conversation: {
        ...newConversation,
        participantDetails: [participant],
        unreadCount: 0,
        hasUnread: false,
      },
    });
  } catch (error) {
    console.error("Create conversation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
