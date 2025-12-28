import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getDb } from '@/lib/mongodb';

export async function GET(request) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';

    const db = await getDb();
    const query = search
      ? {
          $and: [
            { _id: { $ne: session.user.id } },
            {
              $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
              ]
            }
          ]
        }
      : { _id: { $ne: session.user.id } };

    const users = await db
      .collection('users')
      .find(query)
      .project({ password: 0 })
      .limit(20)
      .toArray();

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
