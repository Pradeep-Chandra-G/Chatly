import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Import auth options
const authOptions = {
  session: {
    strategy: 'jwt'
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
    }
  },
  secret: process.env.NEXTAUTH_SECRET
};

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileExtension = file.name.split('.').pop();
    const uniqueFilename = `${uuidv4()}.${fileExtension}`;
    const filePath = path.join(uploadsDir, uniqueFilename);

    // Write file
    await writeFile(filePath, buffer);

    // Return file URL
    const fileUrl = `/uploads/${uniqueFilename}`;
    
    return NextResponse.json({
      url: fileUrl,
      filename: file.name,
      size: file.size,
      type: file.type
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}
