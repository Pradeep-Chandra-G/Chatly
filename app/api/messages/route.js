import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/mongodb";

// Import auth options
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

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID is required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Verify user is part of the conversation
    const conversation = await db.collection("conversations").findOne({
      _id: conversationId,
      participants: session.user.id,
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const messages = await db
      .collection("messages")
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .toArray();

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Get messages error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Update app/api/messages/route.js - Replace the POST function with this updated version

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      conversationId,
      content,
      type = "text",
      mediaUrl,
      fileName,
      fileSize,
      replyTo, // New field for message replies
    } = await request.json();

    if (!conversationId || (!content && !mediaUrl)) {
      return NextResponse.json(
        { error: "Conversation ID and content/media are required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Verify user is part of the conversation
    const conversation = await db.collection("conversations").findOne({
      _id: conversationId,
      participants: session.user.id,
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // If this is a reply, fetch the original message
    let replyToMessage = null;
    if (replyTo) {
      replyToMessage = await db.collection("messages").findOne({
        _id: replyTo,
        conversationId: conversationId,
      });

      if (!replyToMessage) {
        return NextResponse.json(
          { error: "Original message not found" },
          { status: 404 }
        );
      }
    }

    // Create message
    const messageId = uuidv4();
    const newMessage = {
      _id: messageId,
      conversationId,
      senderId: session.user.id,
      content: content || "",
      type, // 'text', 'image', 'file', 'audio', 'video'
      mediaUrl,
      fileName,
      fileSize,
      status: "sent",
      createdAt: new Date(),
      // Reply information
      replyTo: replyTo || null,
      replyToMessage: replyToMessage
        ? {
            _id: replyToMessage._id,
            content: replyToMessage.content,
            type: replyToMessage.type,
            senderId: replyToMessage.senderId,
            mediaUrl: replyToMessage.mediaUrl,
            fileName: replyToMessage.fileName,
          }
        : null,
    };

    await db.collection("messages").insertOne(newMessage);

    // Update conversation's last message timestamp
    const lastMessagePreview = type === "text" ? content : `📎 ${type}`;
    await db.collection("conversations").updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessage: lastMessagePreview,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({ message: newMessage });
  } catch (error) {
    console.error("Send message error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
