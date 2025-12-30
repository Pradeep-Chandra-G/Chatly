// app/api/upload/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { uploadMessageImage, uploadDocument } from "@/lib/cloudinary";

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
    const conversationId = formData.get("conversationId");

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 10MB" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let uploadResult;

    // Determine file type and upload accordingly
    if (file.type.startsWith("image/")) {
      // Upload image
      uploadResult = await uploadMessageImage(
        buffer,
        session.user.id,
        conversationId || "general"
      );

      return NextResponse.json({
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        filename: file.name,
        size: uploadResult.bytes,
        type: file.type,
        width: uploadResult.width,
        height: uploadResult.height,
      });
    } else {
      // Upload document
      uploadResult = await uploadDocument(
        buffer,
        session.user.id,
        conversationId || "general",
        file.name
      );

      return NextResponse.json({
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        filename: file.name,
        size: uploadResult.bytes,
        type: file.type,
      });
    }
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }
}
