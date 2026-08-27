'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  ArrowLeftRight,
  Crown,
  Repeat,
  Shirt,
  Sparkles,
  Swords,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react';

// Shown once, the first time you open the app after your draft finishes.
// The draft is the fun part; everything after it is the part nobody reads
// the rules for, so this walks through it a card at a time and points at
// the exact screen for each job.

type Card = {
  icon: LucideIcon;
  title: string;
  lines: string[];
  cta?: { label: string; href: string };
};

function cards(leagueId: string, gw: number | null): Card[] {
  return [
    {
      icon: Trophy,
      title: 'Your squad is locked',
      lines: [
        'Those 15 players are yours until you change them.',
        'Nobody else in the league can own them.',
        gw
          ? `Everything below matters before the Gameweek ${gw} deadline.`
          : 'Everything below matters before the next deadline.',
      ],
    },
    {
      icon: Shirt,
      title: 'Pick your XI',
      lines: [
        'My Team is your pitch. Tap a starter, then tap a bench player, to swap them.',
        'You need 1 keeper, 3 to 5 defenders, 2 to 5 midfielders, 1 to 3 forwards.',
        'Do nothing and last week’s XI rolls over, so you are never on zero.',
      ],
      cta: { label: 'Open My Team', href: '/squad' },
    },
    {
      icon: Crown,
      title: 'Captain and vice',
      lines: [
        'On My Team, tap a starter and choose Make captain or Make vice.',
        'Your captain scores double. Pick the one with the kindest fixture.',
        'If your captain does not play at all, the vice doubles instead. Always set both.',
      ],
      cta: { label: 'Set your captain', href: '/squad' },
    },
    {
      icon: Repeat,
      title: 'Autosubs have your back',
      lines: [
        'A starter who does not play is swapped for a bench player who did.',
        'It happens automatically once the gameweek is confirmed.',
        'Bench order matters, so put your most likely starter in the first slot.',
      ],
    },
    {
      icon: ArrowLeftRight,
      title: 'Trades',
      lines: [
        'League tab, then Trades. Offer up to 3 players to any manager.',
        'Both squads must still be 2/5/5/3 after the swap.',
        'Offers expire in 48 hours, and trading freezes once a deadline passes.',
      ],
      cta: { label: 'Open Trades', href: `/league/${leagueId}/trades` },
    },
    {
      icon: Swords,
      title: 'Waivers',
      lines: [
        'League tab, then Waivers. This is how you sign anyone unowned.',
        'File a claim, one in and one out. Claims all process together, 24h before the deadline.',
        'Worst team in the table gets first refusal. Win a claim and you drop to the back of the queue.',
      ],
      cta: { label: 'Open Waivers', href: `/league/${leagueId}/waivers` },
    },
    {
      icon: Sparkles,
      title: 'Chips',
      lines: [
        'Three of them, once each per season, on the League tab.',
        'Triple Captain: your captain scores 3x. Bench Boost: all 15 score.',
        'Wildcard: every waiver claim can land in one window instead of just the top one.',
      ],
      cta: { label: 'See your chips', href: `/league/${leagueId}` },
    },
    {
      icon: Trophy,
      title: 'Every week you face someone',
      lines: [
        'Head to head: outscore your opponent and take the win. The table ranks by record.',
        'Top four make the playoffs, semis in GW37 and the final on the last day.',
        'Weekly awards land on the league page. Manager of the Week, and the Wooden Spoon.',
      ],
      cta: { label: 'See your draft grade', href: `/league/${leagueId}?view=grades` },
    },
  ];
}

export default function PostDraftGuide({
  leagueId,
  gw,
  openSignal = 0,
}: {
  leagueId: string;
  gw: number | null;
  // Bumping this reopens the deck even after it has been dismissed, for the
  // "What happens now?" button.
  openSignal?: number;
}) {
  const key = `epld_postdraft_${leagueId}`;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (!localStorage.getItem(key)) setOpen(true);
    } catch {
      // private mode or blocked storage: just do not nag
    }
  }, [key]);

  useEffect(() => {
    if (openSignal > 0) {
      setStep(0);
      setOpen(true);
    }
  }, [openSignal]);

  const close = () => {
    setOpen(false);
    setStep(0);
    try {
      localStorage.setItem(key, 'seen');
    } catch {
      // nothing to do; worst case it shows again next visit
    }
  };

  if (!mounted || !open) return null;

  const deck = cards(leagueId, gw);
  const card = deck[step];
  const last = step === deck.length - 1;
  const Icon = card.icon;

  return createPortal(
    <div
      className="modal-scrim"
      onClick={close}
    >
      <div
        className="modal-card reveal space-y-5 text-center"
        style={{ background: 'var(--surface-raised)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
            Draft done · {step + 1} of {deck.length}
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

        <ul className="mx-auto flex min-h-32 max-w-xs flex-col justify-center gap-3">
          {card.lines.map((line, i) => (
            <li key={i} className="text-sm leading-relaxed text-muted">
              {line}
            </li>
          ))}
        </ul>

        {card.cta ? (
          <Link href={card.cta.href} onClick={close} className="btn-outline mx-auto w-full max-w-xs">
            {card.cta.label}
          </Link>
        ) : null}

        <div className="flex items-center gap-1">
          {deck.map((_, i) => (
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
    </div>,
    document.body,
  );
}
