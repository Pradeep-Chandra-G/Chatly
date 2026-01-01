import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getDb } from "@/lib/mongodb";

const authOptions = {
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

// POST: Promote to Admin
export async function POST(request, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { groupId } = params;
        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: "User ID required" }, { status: 400 });
        }

        const db = await getDb();
        const conversation = await db.collection("conversations").findOne({ _id: groupId });

        if (!conversation) {
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        const currentAdmins = conversation.admins || [conversation.admin];
        if (!currentAdmins.includes(session.user.id)) {
            return NextResponse.json({ error: "Only admins can promote members" }, { status: 403 });
        }

        if (!conversation.participants.includes(userId)) {
            return NextResponse.json({ error: "User is not in the group" }, { status: 400 });
        }

        await db.collection("conversations").updateOne(
            { _id: groupId },
            { $addToSet: { admins: userId } }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Promote admin error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE: Dismiss as Admin
export async function DELETE(request, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { groupId } = params;
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");

        if (!userId) {
            return NextResponse.json({ error: "User ID required" }, { status: 400 });
        }

        const db = await getDb();
        const conversation = await db.collection("conversations").findOne({ _id: groupId });

        if (!conversation) {
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        const currentAdmins = conversation.admins || [conversation.admin];
        if (!currentAdmins.includes(session.user.id)) {
            return NextResponse.json({ error: "Only admins can dismiss admins" }, { status: 403 });
        }

        // Prevent dismissing the last admin (optional but recommended safety check)
        if (currentAdmins.length === 1 && currentAdmins.includes(userId)) {
            return NextResponse.json({ error: "Cannot dismiss the only admin" }, { status: 400 });
        }

        await db.collection("conversations").updateOne(
            { _id: groupId },
            { $pull: { admins: userId } }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Dismiss admin error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
