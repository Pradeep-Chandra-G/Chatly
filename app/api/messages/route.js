import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/mongodb';

export async function GET(request) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    
    // Verify user is part of the conversation
    const conversation = await db.collection('conversations').findOne({
      _id: conversationId,
      participants: session.user.id
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const messages = await db
      .collection('messages')
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .toArray();

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {\n    const session = await getServerSession();\n    if (!session?.user) {\n      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });\n    }\n\n    const { conversationId, content, type = 'text', mediaUrl, fileName, fileSize } = await request.json();\n\n    if (!conversationId || (!content && !mediaUrl)) {\n      return NextResponse.json(\n        { error: 'Conversation ID and content/media are required' },\n        { status: 400 }\n      );\n    }\n\n    const db = await getDb();\n\n    // Verify user is part of the conversation\n    const conversation = await db.collection('conversations').findOne({\n      _id: conversationId,\n      participants: session.user.id\n    });\n\n    if (!conversation) {\n      return NextResponse.json(\n        { error: 'Conversation not found' },\n        { status: 404 }\n      );\n    }\n\n    // Create message\n    const messageId = uuidv4();\n    const newMessage = {\n      _id: messageId,\n      conversationId,\n      senderId: session.user.id,\n      content: content || '',\n      type, // 'text', 'image', 'file', 'audio', 'video'\n      mediaUrl,\n      fileName,\n      fileSize,\n      status: 'sent',\n      createdAt: new Date()\n    };\n\n    await db.collection('messages').insertOne(newMessage);\n\n    // Update conversation's last message timestamp\n    const lastMessagePreview = type === 'text' ? content : `📎 ${type}`;\n    await db.collection('conversations').updateOne(\n      { _id: conversationId },\n      { \n        $set: { \n          lastMessage: lastMessagePreview,\n          updatedAt: new Date() \n        } \n      }\n    );\n\n    return NextResponse.json({ message: newMessage });\n  } catch (error) {\n    console.error('Send message error:', error);\n    return NextResponse.json(\n      { error: 'Internal server error' },\n      { status: 500 }\n    );\n  }\n}
