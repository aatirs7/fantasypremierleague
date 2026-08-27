import { redirect } from 'next/navigation';

// Stats became a tab on the league page. Old links still work.
export default async function Moved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/league/${id}?view=stats`);
}
