import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

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

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 10MB" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64File = buffer.toString("base64");
    const mimeType = file.type || "application/octet-stream";
    const dataUri = `data:${mimeType};base64,${base64File}`;

    const fileExtension = file.name.split(".").pop().toLowerCase();
    const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
    const resourceType = imageExtensions.includes(fileExtension)
      ? "image"
      : "raw";

    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    const cloudinaryFormData = new FormData();
    cloudinaryFormData.append("file", dataUri);
    cloudinaryFormData.append(
      "upload_preset",
      process.env.CLOUDINARY_UPLOAD_PRESET
    );
    cloudinaryFormData.append("folder", "chatly");

    const cloudinaryResponse = await fetch(cloudinaryUrl, {
      method: "POST",
      body: cloudinaryFormData,
    });

    if (!cloudinaryResponse.ok) {
      throw new Error("Cloudinary upload failed");
    }

    const cloudinaryData = await cloudinaryResponse.json();

    return NextResponse.json({
      url: cloudinaryData.secure_url,
      filename: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
