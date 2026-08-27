import { leagueDraftAwards, leagueDraftGrades, leaguePickCount } from '@/lib/draft-grades';
import DraftReport from '@/components/leagues/DraftReport';
import { teamNames } from '@/lib/names';
import Avatar from '@/components/Avatar';
import Link from 'next/link';

// Report cards for the draft itself. Not a prediction of the season, a
// judgement on the board: who took value, who reached, who spent a top pick
// on somebody who cannot get on the pitch.
const TONE: Record<string, string> = {
  A: 'text-accent',
  B: 'text-foreground',
  C: 'text-muted',
  D: 'text-live',
  F: 'text-live',
};

export default async function DraftGrades({
  leagueId,
  viewerId,
}: {
  leagueId: string;
  viewerId: string;
}) {
  const [grades, awards, names, picks] = await Promise.all([
    leagueDraftGrades(leagueId),
    leagueDraftAwards(leagueId),
    teamNames(leagueId),
    leaguePickCount(leagueId),
  ]);
  if (!grades.length) {
    return (
      <p className="tile p-5 text-center text-sm text-muted">
        Grades land once the board is full.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <DraftReport
        grades={grades.map((g) => ({ ...g, username: names.get(g.userId) ?? g.username }))}
        awards={awards.map((a) => ({ ...a, username: names.get(a.userId) ?? a.username }))}
        viewerId={viewerId}
        picks={picks}
      />
      <p className="text-center text-xs text-muted">
        Graded on the board, not the table. Value taken, positions covered, and how many of your
        picks can actually play.
      </p>
      {grades.map((g) => {
        const tone = TONE[g.grade[0]] ?? 'text-muted';
        const name = names.get(g.userId) ?? g.username;
        return (
          <div
            key={g.userId}
            className={`tile p-3.5 ${g.userId === viewerId ? 'tile-team' : ''}`}
          >
            <div className="flex items-center gap-3">
              <Avatar name={name} size={34} ring={g.userId === viewerId} />
              <Link
                href={`/league/${leagueId}/squad/${g.userId}`}
                className="min-w-0 flex-1 truncate text-sm font-semibold"
              >
                {name}
              </Link>
              <span className={`font-display text-3xl leading-none ${tone}`}>{g.grade}</span>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {g.notes.slice(0, 3).map((n, i) => (
                <li key={i} className="text-[0.7rem] leading-relaxed text-muted">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
