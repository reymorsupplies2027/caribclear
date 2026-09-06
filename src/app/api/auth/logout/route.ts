import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';

export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
