// app/api/messages/edit/route.js
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

export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messageId, content } = await request.json();

    if (!messageId) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 }
      );
    }

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "Message content cannot be empty" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Find the message and verify ownership
    const message = await db.collection("messages").findOne({ _id: messageId });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Only the sender can edit their message
    if (message.senderId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only edit your own messages" },
        { status: 403 }
      );
    }

    // Don't allow editing media messages (only text messages)
    if (message.type !== "text") {
      return NextResponse.json(
        { error: "Only text messages can be edited" },
        { status: 400 }
      );
    }

    // Update the message
    const updateData = {
      content: content.trim(),
      edited: true,
      editedAt: new Date(),
    };

    await db
      .collection("messages")
      .updateOne({ _id: messageId }, { $set: updateData });

    // Get the updated message
    const updatedMessage = await db
      .collection("messages")
      .findOne({ _id: messageId });

    return NextResponse.json({
      success: true,
      message: updatedMessage,
    });
  } catch (error) {
    console.error("Edit message error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
