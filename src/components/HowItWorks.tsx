'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftRight,
  BookOpen,
  ChevronRight,
  Crown,
  MessageCircle,
  Shirt,
  Sparkles,
  Swords,
  Trophy,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { FINAL_GW, REGULAR_SEASON_END, SEMIS_GW } from '@/lib/h2h-rules';

// The house rules as a swipeable deck: one idea per card, a few lines each,
// rather than a wall of text nobody reads.
type Card = { icon: LucideIcon; title: string; lines: string[] };

const CARDS: Card[] = [
  {
    icon: Swords,
    title: 'The draft',
    lines: [
      'You take turns picking real Premier League players. Each player belongs to one manager only.',
      'The order snakes, so picking last in round one means picking first in round two.',
      'You end with 15: 2 GK, 5 DEF, 5 MID, 3 FWD.',
      'Miss your turn and we auto-pick for you. You are never left behind.',
    ],
  },
  {
    icon: Shirt,
    title: 'Your lineup',
    lines: [
      'Pick 11 starters from your 15 before each deadline.',
      'Your captain scores double. If they do not play, your vice doubles instead.',
      'A starter who does not play is swapped for a bench player automatically.',
      'Do nothing and last week’s lineup carries over.',
    ],
  },
  {
    icon: Zap,
    title: 'Scoring',
    lines: [
      'Points are the official FPL numbers, bonus included.',
      'Scores tick live during matches, then settle when the gameweek is confirmed.',
    ],
  },
  {
    icon: Trophy,
    title: 'Head to head',
    lines: [
      'Every week you face one other manager. Outscore them and you take the win.',
      'The table ranks by record, so a bad month does not end your season.',
      `Regular season ends GW${REGULAR_SEASON_END}.`,
    ],
  },
  {
    icon: Trophy,
    title: 'Playoffs',
    lines: [
      `Top four make it. Semi-finals in GW${SEMIS_GW}: first plays fourth, second plays third.`,
      `The final is GW${FINAL_GW}, the last day of the season.`,
      'Total points is the tiebreaker if two records match.',
    ],
  },
  {
    icon: Sparkles,
    title: 'Chips',
    lines: [
      'Three one-time power plays. Timing is everything.',
      'Triple Captain: your captain scores 3x.',
      'Bench Boost: all 15 players score.',
      'Wildcard: every waiver claim can land in one window.',
    ],
  },
  {
    icon: BookOpen,
    title: 'Waivers',
    lines: [
      'Claim unowned players: one in, one out.',
      'All claims process together, 24h before the deadline.',
      'Teams lower in the table get first refusal. Winning a claim drops you to the bottom.',
      'Leftovers become instant free agents until the deadline.',
    ],
  },
  {
    icon: ArrowLeftRight,
    title: 'Trades',
    lines: [
      'Swap up to 3 players with another manager.',
      'Both squads must still be 2/5/5/3 afterwards.',
      'Offers expire after 48 hours, and trades freeze while a gameweek plays.',
    ],
  },
  {
    icon: Crown,
    title: 'Weekly awards',
    lines: [
      'Handed out automatically every gameweek.',
      'Manager of the Week and Wooden Spoon: best and worst score.',
      'Bench Disaster: most points left on your bench.',
      'Captain Curse: your captain returned two or fewer.',
    ],
  },
  {
    icon: MessageCircle,
    title: 'Chat',
    lines: [
      'Every league has a thread for arguing about all of it.',
      'Results and awards post themselves there each week.',
    ],
  },
];

export default function HowItWorks({ trigger }: { trigger: 'card' | 'button' | 'row' }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const close = () => {
    setOpen(false);
    setStep(0);
  };
  const card = CARDS[step];
  const last = step === CARDS.length - 1;
  const Icon = card.icon;

  const opener: ReactNode =
    trigger === 'row' ? (
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center gap-3 px-2.5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
          <BookOpen className="h-4.5 w-4.5" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">How it works</span>
          <span className="block text-xs text-muted">Rules, chips, playoffs</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-2" />
      </button>
    ) : trigger === 'card' ? (
      <button
        onClick={() => setOpen(true)}
        className="tile w-full px-3.5 py-2 text-center active:scale-[0.99]"
      >
        <span className="flex items-center justify-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.8} />
          <span className="text-[0.8rem] font-semibold leading-tight tracking-tight">
            How it works
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[0.65rem] leading-tight text-muted">
          Draft, scoring, playoffs and chips explained
        </span>
      </button>
    ) : (
      <button onClick={() => setOpen(true)} className="btn-outline mx-auto w-full max-w-xs">
        How it works
      </button>
    );

  // The sheet is portalled to the body. Rendered in place it would be
  // trapped inside the home column's overflow:hidden and behind any later
  // sibling that animates, since .reveal makes its own stacking context.
  const sheet = open ? (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/85 lg:items-center"
      onClick={close}
    >
          <div
            className="reveal w-full max-w-md space-y-5 rounded-t-3xl border border-edge p-6 pb-10 text-center shadow-2xl lg:rounded-3xl lg:pb-6"
            style={{ background: 'var(--surface-raised)', backdropFilter: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
                {step + 1} of {CARDS.length}
              </p>
              <div className="mt-2 flex flex-col items-center gap-2">
                <Icon className="h-7 w-7 text-accent" strokeWidth={1.6} />
                <h2 className="text-2xl font-semibold tracking-tight">{card.title}</h2>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="mx-auto flex min-h-32 max-w-xs flex-col justify-center gap-3 text-center">
              {card.lines.map((line, i) => (
                <li key={i} className="text-sm leading-relaxed text-muted">
                  {line}
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-1">
              {CARDS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-white/[0.12]'}`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              {step > 0 ? (
                <button
                  onClick={() => setStep(step - 1)}
                  className="min-h-11 flex-1 rounded-xl border border-edge text-sm font-semibold text-muted"
                >
                  Back
                </button>
              ) : null}
              <button
                onClick={() => (last ? close() : setStep(step + 1))}
                className="btn-primary min-h-11 flex-[2]"
              >
                {last ? 'Got it' : 'Next'}
              </button>
            </div>
          </div>
    </div>
  ) : null;

  return (
    <>
      {opener}
      {mounted && sheet ? createPortal(sheet, document.body) : null}
    </>
  );
}
