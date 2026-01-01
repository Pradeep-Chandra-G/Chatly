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

export async function PATCH(request, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { groupId } = params;
        const updates = await request.json();
        const db = await getDb();

        const conversation = await db.collection("conversations").findOne({ _id: groupId });

        if (!conversation) {
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        const { admins, settings } = conversation;
        const isAdmin = admins?.includes(session.user.id) || conversation.admin === session.user.id;

        // Permission Check: Edit Info
        // If specific fields (name, description, avatar) are being updated, check permission
        if (updates.name || updates.description || updates.avatar) {
            if (settings?.editInfo === "admins" && !isAdmin) {
                return NextResponse.json({ error: "Only admins can edit group info" }, { status: 403 });
            }
        }

        // Permission Check: Update Settings
        // Only admins can change settings
        if (updates.settings && !isAdmin) {
            return NextResponse.json({ error: "Only admins can change group settings" }, { status: 403 });
        }

        // Sanitize update fields to prevent overwriting critical data like participants directly via this route
        const safeUpdates = {};
        if (updates.name) safeUpdates.name = updates.name;
        if (updates.description !== undefined) safeUpdates.description = updates.description;
        if (updates.avatar) safeUpdates.avatar = updates.avatar;
        if (updates.settings) {
            safeUpdates.settings = { ...conversation.settings, ...updates.settings };
        }

        safeUpdates.updatedAt = new Date();

        await db.collection("conversations").updateOne(
            { _id: groupId },
            { $set: safeUpdates }
        );

        const updatedGroup = await db.collection("conversations").findOne({ _id: groupId });

        return NextResponse.json({ group: updatedGroup });

    } catch (error) {
        console.error("Update group error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
