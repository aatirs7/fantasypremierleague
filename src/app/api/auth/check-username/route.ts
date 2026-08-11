import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { USERNAME_RE } from '@/lib/auth';

// Debounced availability check for the register form.
export async function GET(req: Request) {
  const username = new URL(req.url).searchParams.get('u') ?? '';
  if (!USERNAME_RE.test(username)) return NextResponse.json({ available: false });
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameLower, username.toLowerCase()))
    .limit(1);
  return NextResponse.json({ available: !row });
}
