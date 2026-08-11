'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { HelpCircle, X } from 'lucide-react';

// Floating question mark, always top corner. Opens a click-through help
// deck for the page you are on: one short idea per screen, zero jargon.

type HelpTopic = { title: string; steps: string[] };

function topicFor(pathname: string): HelpTopic | null {
  if (pathname === '/') return null;
  if (pathname.startsWith('/home')) {
    return {
      title: 'Home',
      steps: [
        'Your dashboard: leagues, rank, and the next deadline.',
        'Join a league with a friend’s code, or create your own.',
        'Set your lineup before the countdown hits zero.',
      ],
    };
  }
  if (pathname.includes('/draft')) {
    return {
      title: 'The draft',
      steps: [
        'Take turns picking real players. The order snakes each round.',
        '90 seconds a pick. Gold bar means it is YOUR turn.',
        'You need 15: 2 GK, 5 DEF, 5 MID, 3 FWD.',
        'Miss your turn? We auto-pick for you. Never left behind.',
      ],
    };
  }
  if (pathname.includes('/waivers')) {
    return {
      title: 'Waivers',
      steps: [
        'Sign unowned players, fairly.',
        'File a claim: one in, one of yours out.',
        'Claims process 24h before the deadline. Lower-ranked teams get priority.',
        'After processing, leftovers are instant free agents.',
      ],
    };
  }
  if (pathname.includes('/trades')) {
    return {
      title: 'Trades',
      steps: [
        'Swap up to 3 players with another manager.',
        'Both squads must still be 2/5/5/3 after.',
        'Offers expire in 48h. Trades pause while matches play.',
      ],
    };
  }
  if (pathname.includes('/squad/') || pathname.startsWith('/squad')) {
    return {
      title: 'Your squad',
      steps: [
        'Pick 11 starters from your 15 before each deadline.',
        'Tap a starter, then a bench player, to swap.',
        'Crown = captain, DOUBLE points. Shield = vice, the backup.',
        'A starter who does not play gets auto-subbed from your bench.',
      ],
    };
  }
  if (pathname.startsWith('/league')) {
    return {
      title: 'Your league',
      steps: [
        'The table ranks everyone by season points.',
        '▲ spots = places climbed. +pts = points gained. Different things.',
        'Points tick LIVE during matches, then settle when confirmed.',
        'Tap a manager to see their squad.',
      ],
    };
  }
  if (pathname.startsWith('/players')) {
    return {
      title: 'Players',
      steps: [
        'Every PL player and the numbers that matter.',
        'Draft rank = FPL’s pick order. Lower is better.',
        'Yellow dot: doubtful. Red: injured or suspended.',
        'Tap a player for fixtures and history.',
      ],
    };
  }
  if (pathname.startsWith('/matches')) {
    return {
      title: 'Matches',
      steps: [
        'Every Premier League fixture, gameweek by gameweek.',
        'Scores update live every couple of minutes while matches play.',
        'Use the GW pills to browse ahead or back.',
      ],
    };
  }
  if (pathname.startsWith('/me')) {
    return {
      title: 'Me',
      steps: [
        'Your account and leagues.',
        'No PIN reset exists. Do not forget it.',
        'Add the app to your home screen for the full experience.',
      ],
    };
  }
  return null;
}

export default function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const topic = topicFor(pathname);
  if (!topic) return null;

  const close = () => {
    setOpen(false);
    setStep(0);
  };
  const last = step === topic.steps.length - 1;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Help"
        className="glass fixed right-4 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full text-muted shadow-lg shadow-black/20 active:scale-95"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 lg:items-center"
          onClick={close}
        >
          <div
            className="glass reveal w-full max-w-md space-y-5 rounded-t-3xl p-6 pb-10 text-center lg:rounded-3xl lg:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
                How it works
              </p>
              <h2 className="font-display text-4xl">{topic.title}</h2>
              <button
                onClick={close}
                aria-label="Close help"
                className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.05] text-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mx-auto flex min-h-16 max-w-xs items-center justify-center text-lg font-semibold leading-relaxed">
              {topic.steps[step]}
            </p>

            <div className="flex items-center gap-2">
              {topic.steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-white/[0.1]'}`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              {step > 0 ? (
                <button
                  onClick={() => setStep(step - 1)}
                  className="min-h-11 flex-1 rounded-xl border border-edge text-sm font-bold text-muted"
                >
                  Back
                </button>
              ) : null}
              <button
                onClick={() => (last ? close() : setStep(step + 1))}
                className="min-h-11 flex-[2] rounded-xl bg-accent text-sm font-bold text-[var(--accent-ink)] active:scale-95"
              >
                {last ? 'Got it' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
