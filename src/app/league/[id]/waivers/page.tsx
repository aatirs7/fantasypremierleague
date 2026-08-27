import { redirect } from 'next/navigation';

// Waivers and trades moved into the Market tab. Old links still work.
export default async function Moved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/market?league=${id}`);
}
