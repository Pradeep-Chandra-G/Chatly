// app/api/upload/avatar/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { uploadAvatar, deleteFromCloudinary } from "@/lib/cloudinary";
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

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Check if it's an image
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Please upload an image file" },
        { status: 400 }
      );
    }

    // Check file size (max 5MB for avatars)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image size must be less than 5MB" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Get user's current avatar to delete old one
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: session.user.id });

    // Delete old avatar from Cloudinary if exists
    if (user?.avatarPublicId) {
      try {
        await deleteFromCloudinary(user.avatarPublicId);
        console.log("Old avatar deleted:", user.avatarPublicId);
      } catch (error) {
        console.error("Failed to delete old avatar:", error);
        // Continue anyway, not critical
      }
    }

    // Upload new avatar to Cloudinary
    const uploadResult = await uploadAvatar(buffer, session.user.id);

    // Update user's avatar in database
    await db.collection("users").updateOne(
      { _id: session.user.id },
      {
        $set: {
          avatar: uploadResult.url,
          avatarPublicId: uploadResult.publicId,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      url: uploadResult.url,
      publicId: uploadResult.publicId,
      success: true,
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }
}
