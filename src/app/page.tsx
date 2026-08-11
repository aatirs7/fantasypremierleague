import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import Onboard from '@/components/auth/Onboard';

export const dynamic = 'force-dynamic';

export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await readSession();
  const { next } = await searchParams;
  if (session) redirect(next || '/home');
  return <Onboard next={next} />;
}
