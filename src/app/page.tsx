import { redirect } from 'next/navigation';
import { Timer, Swords, Zap, ArrowLeftRight } from 'lucide-react';
import { readSession } from '@/lib/auth';
import { editableGw } from '@/lib/lineup';
import Onboard from '@/components/auth/Onboard';
import Countdown from '@/components/leagues/Countdown';
import PLLion from '@/components/PLLion';

export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    icon: Swords,
    title: 'Live draft',
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
    <div className="mx-auto flex max-w-md flex-col items-center gap-7 py-6 text-center">
      <div className="reveal space-y-5">
        <PLLion className="mx-auto h-24 w-auto text-foreground drop-shadow-[0_0_24px_rgba(0,229,140,0.25)]" />
        <div>
          <p className="font-display text-sm uppercase tracking-[0.4em] text-accent">Premier League</p>
          <h1 className="font-display text-6xl leading-[0.95] tracking-tight">
            Fantasy
            <span className="shine block text-7xl">Draft</span>
          </h1>
          <p className="mt-1.5 text-sm font-semibold tracking-[0.2em] text-muted">2026-27 SEASON</p>
        </div>
        <div className="mx-auto max-w-xs space-y-1">
          <p className="text-sm leading-relaxed text-muted">
            Draft a squad of real Premier League players with your friends, set your lineup every
            week, and battle the table all season. May the best manager win.
          </p>
          <p className="text-xs text-muted-2">Made by Aatir Siddiqui</p>
        </div>
      </div>

      {kickoff ? (
        <div
          className="reveal inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold"
          style={{ animationDelay: '80ms' }}
        >
          <Timer className="h-4 w-4" />
          Gameweek {kickoff.gw} locks in{' '}
          <Countdown toIso={kickoff.deadline.toISOString()} doneText="moments" />
        </div>
      ) : null}

      <div className="reveal w-full" style={{ animationDelay: '140ms' }}>
        <Onboard next={next} />
      </div>

      <div className="reveal grid w-full gap-2.5 text-left" style={{ animationDelay: '200ms' }}>
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
  );
}
