import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const userCount = await db.user.count();
    const hsCount = await db.hsCode.count();
    return NextResponse.json({
      status: 'healthy', db: 'connected', users: userCount, hsCodes: hsCount,
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'degraded', db: 'unreachable', error: err instanceof Error ? err.message : 'unknown' },
      { status: 503 },
    );
  }
}
