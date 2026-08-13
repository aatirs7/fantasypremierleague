import { Crown, Frown, Skull, Trophy } from 'lucide-react';
import { AWARD_LABELS, recentAwards, type AwardKind } from '@/lib/awards';

const ICONS: Record<AwardKind, typeof Crown> = {
  manager_of_week: Trophy,
  bench_disaster: Frown,
  captain_curse: Skull,
  wooden_spoon: Crown,
};

const TONE: Record<AwardKind, string> = {
  manager_of_week: 'text-gold',
  bench_disaster: 'text-muted',
  captain_curse: 'text-live',
  wooden_spoon: 'text-muted-2',
};

// Weekly awards, newest first. Hidden entirely until a gameweek is scored.
export default async function AwardsFeed({ leagueId }: { leagueId: string }) {
  const awards = await recentAwards(leagueId);
  if (!awards.length) return null;

  const byGw = new Map<number, typeof awards>();
  for (const a of awards) {
    if (!byGw.has(a.gw)) byGw.set(a.gw, []);
    byGw.get(a.gw)!.push(a);
  }

  return (
    <section className="space-y-2">
      <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
        Weekly awards
      </p>
      {[...byGw.entries()].map(([gw, rows]) => (
        <div key={gw} className="tile p-3.5">
          <p className="mb-2 text-[0.55rem] font-medium uppercase tracking-[0.18em] text-muted-2">
            Gameweek {gw}
          </p>
          <div className="space-y-2">
            {rows.map((a) => {
              const Icon = ICONS[a.kind] ?? Trophy;
              return (
                <div key={a.kind} className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 shrink-0 ${TONE[a.kind]}`} strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.6rem] uppercase tracking-wider text-muted-2">
                      {AWARD_LABELS[a.kind]}
                    </span>
                    <span className="block truncate text-sm font-semibold">
                      {a.username}
                      {a.detail ? <span className="text-muted"> · {a.detail}</span> : null}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
