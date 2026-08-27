import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ArrowLeftRight, Search, Swords } from 'lucide-react';
import { db } from '@/lib/db';
import { leagues } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import { myLeagues, resolveActiveLeagueId } from '@/lib/leagues';
import RememberLeague from '@/components/RememberLeague';
import WaiversHub from '@/components/waivers/WaiversHub';
import TradeHub from '@/components/trades/TradeHub';

export const dynamic = 'force-dynamic';

// Everything that changes who owns whom, in one tab: claim an unowned
// player, or deal with another manager. Before the draft this is the draft
// room's front door instead, because nothing can be traded yet.
export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; view?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect('/?next=/market');
  const { league: explicit, view } = await searchParams;
  const leagueId = await resolveActiveLeagueId(session.userId, explicit);
  const mine = await myLeagues(session.userId);

  if (!leagueId) {
    return (
      <div className="reveal space-y-4 pb-4 pt-1 text-center lg:mx-auto lg:max-w-2xl">
        <h1 className="font-display text-4xl">Market</h1>
        <p className="text-sm text-muted">Join a league to trade and claim players.</p>
        <Link href="/home" className="font-semibold text-accent">
          Go home
        </Link>
      </div>
    );
  }

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
  const tab = view === 'trades' ? 'trades' : 'waivers';

  const switcher =
    mine.length > 1 ? (
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5">
          {mine.map((l) => (
            <Link
              key={l.id}
              href={`/market?league=${l.id}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                l.id === leagueId
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-edge text-muted'
              }`}
            >
              {l.name}
            </Link>
          ))}
        </div>
      </div>
    ) : null;

  if (league?.draftStatus !== 'complete') {
    return (
      <div className="reveal space-y-4 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
        <RememberLeague leagueId={leagueId} />
        <h1 className="text-center font-display text-4xl">Market</h1>
        {switcher}
        <div className="tile space-y-3 p-5 text-center">
          <Swords className="mx-auto h-7 w-7 text-accent" strokeWidth={1.6} />
          <p className="text-sm text-muted">
            The market opens once your draft is done. Until then every player is still on the
            board.
          </p>
          <Link href={`/draft?league=${leagueId}`} className="btn-primary w-full">
            Go to the draft room
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="reveal space-y-4 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
      <RememberLeague leagueId={leagueId} />
      <header className="text-center">
        <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
          {league.name}
        </p>
        <h1 className="font-display text-4xl">Market</h1>
      </header>
      {switcher}

      <div className="flex justify-center gap-6 border-b border-edge">
        <Link href="/market" data-active={tab === 'waivers'} className="tab-underline">
          <span className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />
            Free agents
          </span>
        </Link>
        <Link href="/market?view=trades" data-active={tab === 'trades'} className="tab-underline">
          <span className="flex items-center gap-1.5">
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Trades
          </span>
        </Link>
      </div>

      {tab === 'waivers' ? (
        <WaiversHub leagueId={leagueId} myUserId={session.userId} />
      ) : (
        <TradeHub leagueId={leagueId} myUserId={session.userId} />
      )}
    </div>
  );
}
