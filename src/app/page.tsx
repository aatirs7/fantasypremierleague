import { redirect } from 'next/navigation';
import { Timer, Trophy, Swords, Zap, ArrowLeftRight } from 'lucide-react';
import { readSession } from '@/lib/auth';
import { editableGw } from '@/lib/lineup';
import Onboard from '@/components/auth/Onboard';
import Countdown from '@/components/leagues/Countdown';

export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    icon: Swords,
    title: 'Live snake draft',
    text: 'Draft night with your friends. 90 seconds a pick, every player owned by one manager only.',
  },
  {
    icon: Zap,
    title: 'Official FPL scoring',
    text: 'Real Premier League points, live while the matches play. Captains double, benches auto-sub.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Waivers and trades',
    text: 'Work the wire all season. Claim breakout stars, cut dead weight, strike deals.',
  },
];

export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await readSession();
  const { next } = await searchParams;
  if (session) redirect(next || '/home');

  let kickoff: { gw: number; deadline: Date } | null = null;
  try {
    kickoff = await editableGw();
  } catch {
    kickoff = null;
  }

  return (
    <div className="flex min-h-[88vh] flex-col items-center justify-center gap-8 py-12 text-center lg:grid lg:grid-cols-2 lg:items-center lg:gap-16 lg:text-left">
      <div className="reveal space-y-5 lg:space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/30 lg:mx-0">
          <Trophy className="h-10 w-10 text-accent" strokeWidth={2} />
        </div>
        <div>
          <p className="font-display text-lg tracking-[0.45em] text-accent">Premier League</p>
          <h1 className="font-display text-7xl leading-[0.82] tracking-tight lg:text-8xl">
            Fantasy
            <span className="shine block text-8xl lg:text-9xl">Draft</span>
          </h1>
          <p className="mt-1 font-display text-2xl tracking-[0.3em] text-muted">2026-27 season</p>
        </div>

        <div className="mx-auto max-w-xs space-y-1 lg:mx-0 lg:max-w-md">
          <p className="text-sm leading-relaxed text-muted">
            Draft a squad of real Premier League players with your friends, set your lineup every
            week, and battle the table all season. May the best manager win.
          </p>
          <p className="text-xs text-muted-2">
            Fan-made game by Aatir Siddiqui. Not affiliated with the Premier League.
          </p>
        </div>

        <div className="mx-auto grid max-w-sm gap-2.5 text-left lg:mx-0 lg:max-w-md">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`card flex items-start gap-3 p-3.5 ${i === 0 ? 'shine-sweep' : i === 1 ? 'shine-sweep-2' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/30">
                <f.icon className="h-4.5 w-4.5 text-accent" strokeWidth={2.2} />
              </span>
              <span>
                <span className="block text-sm font-bold">{f.title}</span>
                <span className="block text-xs leading-relaxed text-muted">{f.text}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-6 lg:items-stretch">
        {kickoff ? (
          <div
            className="reveal inline-flex items-center gap-2 self-center rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold lg:self-start"
            style={{ animationDelay: '80ms' }}
          >
            <Timer className="h-4 w-4" />
            Gameweek {kickoff.gw} locks in{' '}
            <Countdown toIso={kickoff.deadline.toISOString()} doneText="moments" />
          </div>
        ) : null}
        <div className="reveal w-full max-w-sm self-center lg:max-w-md lg:self-start" style={{ animationDelay: '160ms' }}>
          <Onboard next={next} />
        </div>
      </div>
    </div>
  );
}
