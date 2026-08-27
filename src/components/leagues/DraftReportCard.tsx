import { leagueDraftAwards, leagueDraftGrades, leaguePickCount } from '@/lib/draft-grades';
import { teamNames } from '@/lib/names';
import DraftReport from '@/components/leagues/DraftReport';

// The report, mounted where people actually land. Behind a tab it opened
// itself only for anyone who already went looking for it, which defeated
// the point.
export default async function DraftReportCard({
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
  if (!grades.length) return null;

  const mine = grades.find((g) => g.userId === viewerId);
  return (
    <div className="tile tile-team space-y-2.5 p-4 text-center">
      <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
        Draft report
      </p>
      <p className="text-sm text-muted">
        {mine ? (
          <>
            You graded{' '}
            <span className="font-display text-2xl align-middle text-accent">{mine.grade}</span>.
            Eight awards handed out.
          </>
        ) : (
          'Grades and awards for every manager.'
        )}
      </p>
      <DraftReport
        grades={grades.map((g) => ({ ...g, username: names.get(g.userId) ?? g.username }))}
        awards={awards.map((a) => ({ ...a, username: names.get(a.userId) ?? a.username }))}
        viewerId={viewerId}
        picks={picks}
        autoOpen
        storageKey={`epld_draftreport_${leagueId}`}
      />
    </div>
  );
}
