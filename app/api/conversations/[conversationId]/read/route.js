import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getDb } from "@/lib/mongodb";
import CredentialsProvider from "next-auth/providers/credentials";

const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {},
      async authorize(credentials) {
        return null;
      },
    }),
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

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId } = params;
    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const now = new Date();

    console.log(
      `[READ] User ${session.user.id} marking conv ${conversationId} as read`
    );

    // 1. Upsert the conversation state (Cursor for Unread Counts)
    await db.collection("conversation_states").updateOne(
      {
        userId: session.user.id,
        conversationId: conversationId,
      },
      {
        $set: {
          lastReadAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    // 2. Sync `readBy` arrays for "Detailed Read Receipts"
    // DIAGNOSTIC DUMP
    try {
      const dumpMsgs = await db
        .collection("messages")
        .find({ conversationId })
        .limit(3)
        .toArray();
      console.log("===[DIAGNOSTIC DUMP]===");
      console.log(`Current User: ${session.user.id}`);
      console.log(`Conversation: ${conversationId}`);
      dumpMsgs.forEach((msg, i) => {
        console.log(`Msg[${i}] ID: ${msg._id}`);
        console.log(`   Sender: ${msg.senderId}`);
        console.log(`   ReadBy: ${JSON.stringify(msg.readBy)}`);
        // Check match manually
        const isMeInList = msg.readBy?.some(
          (rb) => rb.userId == session.user.id
        );
        console.log(`   Me In List? ${isMeInList}`);
      });
      console.log("========================");
    } catch (dumpErr) {
      console.error("Dump failed:", dumpErr);
    }

    // Run the update unconditionally on string match
    const updateResult = await db.collection("messages").updateMany(
      {
        conversationId: conversationId,
        senderId: { $ne: session.user.id },
        $or: [
          // Messages without readBy array
          { readBy: { $exists: false } },
          // Messages where I haven't read yet
          { "readBy.userId": { $ne: session.user.id } },
        ],
      },
      {
        $addToSet: {
          readBy: { userId: session.user.id, at: now },
        },
        $set: { status: "read" },
      }
    );
    console.log(
      `[UPDATE RESULT] Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}`
    );

    // 3. Mark "deliveredTo" if missing (cleanup)

    // 3. Mark "deliveredTo" if missing (cleanup)
    await db.collection("messages").updateMany(
      {
        conversationId: conversationId,
        senderId: { $ne: session.user.id },
        "deliveredTo.userId": { $ne: session.user.id },
      },
      {
        $addToSet: {
          deliveredTo: { userId: session.user.id, at: now },
        },
        $set: { status: "delivered" }, // Legacy support
      }
    );

    return NextResponse.json({ success: true, lastReadAt: now });
  } catch (error) {
    console.error("Mark read error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
