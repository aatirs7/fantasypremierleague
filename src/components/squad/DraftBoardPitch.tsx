import Link from 'next/link';
import PlayerPhoto from '@/components/players/PlayerPhoto';

// The My Team tab while the draft is still running. There is no lineup to
// edit yet, so this is a read-only pitch: every squad slot laid out by
// position, filled plates for who you have and dashed outlines for who you
// still owe. The last four slots sit on the bench strip, because that is
// where the 15th man ends up once the lineup opens.

export type DraftedPlayer = {
  fplId: number;
  webName: string;
  clubShort: string;
  position: string;
  photoCode: number | null;
  status: string;
};

const QUOTAS: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
// The XI a full squad can field, so the pitch shows a real shape and the
// spare bodies drop to the bench.
const ON_PITCH: Record<string, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

function Plate({ p }: { p: DraftedPlayer }) {
  return (
    <Link
      href={`/players/${p.fplId}`}
      className="plate relative flex w-[4.7rem] flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 active:scale-[0.98]"
    >
      <PlayerPhoto photoCode={p.photoCode} name={p.webName} size={38} />
      <span className="w-full truncate text-center text-[0.62rem] font-bold leading-tight text-white">
        {p.webName}
      </span>
      <span className="text-[0.55rem] font-semibold text-white/60">
        {p.clubShort}
        {p.status !== 'a' ? (
          <span
            className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${p.status === 'd' ? 'bg-gold' : 'bg-live'}`}
          />
        ) : null}
      </span>
    </Link>
  );
}

function EmptySlot({ pos }: { pos: string }) {
  return (
    <span className="flex h-[4.9rem] w-[4.7rem] flex-col items-center justify-center rounded-[0.7rem] border border-dashed border-white/20 bg-black/20">
      <span className="text-[0.55rem] font-bold uppercase tracking-wider text-white/45">{pos}</span>
      <span className="mt-0.5 text-[0.55rem] text-white/30">open</span>
    </span>
  );
}

export default function DraftBoardPitch({ players }: { players: DraftedPlayer[] }) {
  const byPos = Object.fromEntries(
    POS_ORDER.map((pos) => [pos, players.filter((p) => p.position === pos)]),
  ) as Record<string, DraftedPlayer[]>;

  // Anything past the starting shape at each position waits on the bench.
  const bench: DraftedPlayer[] = [];
  for (const pos of POS_ORDER) bench.push(...byPos[pos].slice(ON_PITCH[pos]));
  const benchSlots = Object.values(QUOTAS).reduce((a, b) => a + b, 0) -
    Object.values(ON_PITCH).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      <div className="pitch space-y-4 px-2 pb-5 pt-4">
        {POS_ORDER.map((pos) => {
          const onPitch = byPos[pos].slice(0, ON_PITCH[pos]);
          const gaps = ON_PITCH[pos] - onPitch.length;
          return (
            <div key={pos} className="relative z-10 flex justify-evenly">
              {onPitch.map((p) => (
                <Plate key={p.fplId} p={p} />
              ))}
              {Array.from({ length: gaps }, (_, i) => (
                <EmptySlot key={`${pos}-gap-${i}`} pos={pos} />
              ))}
            </div>
          );
        })}
      </div>

      <div>
        <p className="mb-1.5 text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
          Bench
        </p>
        <div className="flex justify-evenly gap-2 rounded-2xl border border-edge bg-white/[0.02] px-2 py-3">
          {Array.from({ length: benchSlots }, (_, i) =>
            bench[i] ? (
              <Plate key={bench[i].fplId} p={bench[i]} />
            ) : (
              <EmptySlot key={`bench-${i}`} pos="SUB" />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
