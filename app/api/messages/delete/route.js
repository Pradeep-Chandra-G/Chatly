// app/api/messages/delete/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
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

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messageId } = await request.json();

    if (!messageId) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Find the message and verify ownership
    const message = await db.collection("messages").findOne({ _id: messageId });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Only the sender can delete their message
    if (message.senderId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only delete your own messages" },
        { status: 403 }
      );
    }

    // Delete the message
    await db.collection("messages").deleteOne({ _id: messageId });

    // Check if this was the last message in the conversation
    const lastMessage = await db
      .collection("messages")
      .findOne(
        { conversationId: message.conversationId },
        { sort: { createdAt: -1 } }
      );

    // Update the conversation's lastMessage
    if (lastMessage) {
      // There are other messages, update to the new last message
      const lastMessagePreview =
        lastMessage.type === "text"
          ? lastMessage.content
          : `📎 ${lastMessage.type}`;

      await db.collection("conversations").updateOne(
        { _id: message.conversationId },
        {
          $set: {
            lastMessage: lastMessagePreview,
            updatedAt: new Date(),
          },
        }
      );
    } else {
      // No messages left, clear the last message
      await db.collection("conversations").updateOne(
        { _id: message.conversationId },
        {
          $set: {
            lastMessage: "No messages yet",
            updatedAt: new Date(),
          },
        }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: messageId,
      conversationId: message.conversationId,
      newLastMessage: lastMessage
        ? lastMessage.type === "text"
          ? lastMessage.content
          : `📎 ${lastMessage.type}`
        : "No messages yet",
    });
  } catch (error) {
    console.error("Delete message error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
