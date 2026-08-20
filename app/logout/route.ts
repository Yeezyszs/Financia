import { NextResponse } from 'next/server';
import { userClient } from '@/src/infrastructure/config/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await userClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url));
}
