import Link from 'next/link';
import { redirect } from 'next/navigation';
import PlayerSearch from '@/components/players/PlayerSearch';
import { and, asc, desc, ilike, or, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fplPlayers } from '@/lib/schema';
import { draftable } from '@/lib/pool';
import { readSession } from '@/lib/auth';
import PlayerCard from '@/components/players/PlayerCard';

export const dynamic = 'force-dynamic';

const SORTS: Record<string, { label: string; order: SQL[] }> = {
  draft: { label: 'Draft rank', order: [sql`${fplPlayers.draftRank} asc nulls last`] },
  points: { label: 'Points', order: [desc(fplPlayers.totalPoints)] },
  last: {
    label: 'Last szn',
    order: [sql`${fplPlayers.lastSeasonPoints} desc nulls last`],
  },
  form: { label: 'Form', order: [sql`${fplPlayers.form} desc nulls last`] },
  ppg: { label: 'PPG', order: [sql`${fplPlayers.ppg} desc nulls last`] },
  owned: { label: 'Owned', order: [sql`${fplPlayers.ownership} desc nulls last`] },
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

  // Departed players never show in the scouting list either.
  where.push(draftable());
  const players = await db
    .select()
    .from(fplPlayers)
    .where(and(...where))
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
    <div className="reveal space-y-3 pb-4 pt-1 lg:mx-auto lg:max-w-2xl">
      <h1 className="text-center font-display text-4xl">Players</h1>

      <div className="card space-y-3 p-3.5">
        <PlayerSearch
          initial={q}
          hiddenParams={{
            ...(pos !== 'ALL' ? { pos } : {}),
            ...(sortKey !== 'draft' ? { sort: sortKey } : {}),
            ...(club ? { club } : {}),
          }}
        />

        <div className="flex rounded-xl border border-edge bg-white/[0.02] p-1">
          {POSITIONS.map((p) => (
            <Link
              key={p}
              href={href({ pos: p })}
              className={`min-h-9 flex-1 rounded-lg py-1.5 text-center text-xs font-bold transition-colors ${
                pos === p ? 'bg-accent text-[var(--accent-ink)]' : 'text-muted'
              }`}
            >
              {p}
            </Link>
          ))}
        </div>

        <div>
          <p className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-muted-2">
            Sort by
          </p>
          <div className="-mx-3.5 overflow-x-auto px-3.5">
            <div className="flex w-max gap-1.5">
              {Object.entries(SORTS).map(([key, s]) => (
                <Link
                  key={key}
                  href={href({ sort: key })}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                    sortKey === key
                      ? 'bg-accent text-[var(--accent-ink)]'
                      : 'border border-edge bg-white/[0.02] text-muted'
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-muted-2">
            Club
          </p>
          <div className="-mx-3.5 overflow-x-auto px-3.5">
            <div className="flex w-max gap-1.5">
              <Link
                href={href({ club: '' })}
                className={`rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                  !club
                    ? 'bg-accent text-[var(--accent-ink)]'
                    : 'border border-edge bg-white/[0.02] text-muted'
                }`}
              >
                All
              </Link>
              {clubs.map((c) => (
                <Link
                  key={c.clubShort}
                  href={href({ club: c.clubShort })}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                    club === c.clubShort
                      ? 'bg-accent text-[var(--accent-ink)]'
                      : 'border border-edge bg-white/[0.02] text-muted'
                  }`}
                >
                  {c.clubShort}
                </Link>
              ))}
            </div>
          </div>
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
