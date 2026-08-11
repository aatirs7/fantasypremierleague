import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, desc, ilike, or, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fplPlayers } from '@/lib/schema';
import { readSession } from '@/lib/auth';
import PlayerCard from '@/components/players/PlayerCard';
import PullToRefresh from '@/components/PullToRefresh';

export const dynamic = 'force-dynamic';

const SORTS: Record<string, { label: string; order: SQL[] }> = {
  draft: { label: 'Draft rank', order: [sql`${fplPlayers.draftRank} asc nulls last`] },
  points: { label: 'Points', order: [desc(fplPlayers.totalPoints)] },
  form: { label: 'Form', order: [sql`${fplPlayers.form} desc nulls last`] },
  ppg: { label: 'PPG', order: [sql`${fplPlayers.ppg} desc nulls last`] },
  owned: { label: 'Owned', order: [sql`${fplPlayers.ownership} desc nulls last`] },
  price: { label: 'Price', order: [sql`${fplPlayers.price} desc nulls last`] },
  xg: { label: 'xG', order: [sql`${fplPlayers.xg} desc nulls last`] },
  xa: { label: 'xA', order: [sql`${fplPlayers.xa} desc nulls last`] },
  ict: { label: 'ICT', order: [sql`${fplPlayers.ictIndex} desc nulls last`] },
};

const POSITIONS = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pos?: string; sort?: string; club?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect('/?next=/players');
  const { q = '', pos = 'ALL', sort = 'draft', club = '' } = await searchParams;
  const sortKey = sort in SORTS ? sort : 'draft';

  const where: SQL[] = [];
  if (pos !== 'ALL' && ['GK', 'DEF', 'MID', 'FWD'].includes(pos)) {
    where.push(eq(fplPlayers.position, pos));
  }
  if (club) where.push(eq(fplPlayers.clubShort, club));
  if (q.trim()) {
    const needle = `%${q.trim()}%`;
    where.push(or(ilike(fplPlayers.webName, needle), ilike(fplPlayers.fullName, needle))!);
  }

  const players = await db
    .select()
    .from(fplPlayers)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...SORTS[sortKey].order, asc(fplPlayers.fplId))
    .limit(100);

  const clubs = await db
    .selectDistinct({ clubShort: fplPlayers.clubShort })
    .from(fplPlayers)
    .orderBy(asc(fplPlayers.clubShort));

  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ q, pos, sort: sortKey, club, ...patch });
    for (const [k, v] of [...params.entries()]) {
      if (!v || (k === 'pos' && v === 'ALL') || (k === 'sort' && v === 'draft')) params.delete(k);
    }
    const s = params.toString();
    return s ? `/players?${s}` : '/players';
  };

  return (
    <div className="reveal space-y-3 py-4 lg:mx-auto lg:max-w-2xl">
      <PullToRefresh />
      <h1 className="text-center font-display text-4xl">Players</h1>

      <form action="/players" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search players"
          className="min-h-11 w-full rounded-xl border border-edge bg-white/[0.03] px-3.5 text-sm outline-none placeholder:text-muted-2 focus:border-accent/60"
        />
        {pos !== 'ALL' ? <input type="hidden" name="pos" value={pos} /> : null}
        {sortKey !== 'draft' ? <input type="hidden" name="sort" value={sortKey} /> : null}
        {club ? <input type="hidden" name="club" value={club} /> : null}
      </form>

      <div className="flex gap-1.5">
        {POSITIONS.map((p) => (
          <Link
            key={p}
            href={href({ pos: p })}
            className={`min-h-9 flex-1 rounded-full border px-2 py-1.5 text-center text-xs font-bold ${
              pos === p
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-edge bg-white/[0.02] text-muted'
            }`}
          >
            {p}
          </Link>
        ))}
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5 pb-1">
          {Object.entries(SORTS).map(([key, s]) => (
            <Link
              key={key}
              href={href({ sort: key })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                sortKey === key
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-edge bg-white/[0.02] text-muted'
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5 pb-1">
          <Link
            href={href({ club: '' })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              !club ? 'border-accent bg-accent/10 text-accent' : 'border-edge bg-white/[0.02] text-muted'
            }`}
          >
            All clubs
          </Link>
          {clubs.map((c) => (
            <Link
              key={c.clubShort}
              href={href({ club: c.clubShort })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                club === c.clubShort
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-edge bg-white/[0.02] text-muted'
              }`}
            >
              {c.clubShort}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {players.map((p) => (
          <PlayerCard key={p.fplId} p={p} />
        ))}
        {players.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No players match. Sync may not have run yet.</p>
        ) : null}
      </div>
    </div>
  );
}
