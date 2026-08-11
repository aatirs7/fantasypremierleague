import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Legacy deep link: the draft room lives on the Draft tab now.
export default async function LeagueDraftRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/draft?league=${id}`);
}
