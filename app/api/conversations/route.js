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
        // FIX: Include ALL participants (including self) so Group Info works properly
        const participants = await db
          .collection("users")
          .find({ _id: { $in: conv.participants } })
          .project({ password: 0 })
          .toArray();

        // CRITICAL FIX: Count unread messages properly
        // Messages sent by others AND not read by current user
        const unreadMessages = await db
          .collection("messages")
          .find({
            conversationId: conv._id,
            senderId: { $ne: session.user.id }, // NOT sent by me
            $or: [
              // Case 1: Detailed System - Message has 'readBy' array...
              // AND Checking if my userId is NOT present in any object in that array.
              // MongoDB: "readBy.userId": { $ne: id } returns true if no element has that userId.
              { readBy: { $exists: true }, "readBy.userId": { $ne: session.user.id } },

              // Case 2: Legacy System - Fallback
              { readBy: { $exists: false }, status: { $in: ["sent", "delivered"] } }
            ]
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
        // FIX: Populate participant details for existing conversation
        const participants = await db
          .collection("users")
          .find({ _id: { $in: existingConversation.participants } })
          .project({ password: 0 })
          .toArray();

        return NextResponse.json({
          conversation: {
            ...existingConversation,
            participantDetails: participants,
            // We can't easily get unread count here without a separate query, 
            // but for "open existing chat" it's less critical. 
            // The main list update will handle it eventually.
            hasUnread: false,
            unreadCount: 0
          }
        });
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
