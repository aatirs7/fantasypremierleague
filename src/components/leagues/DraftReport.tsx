'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Award as AwardIcon,
  BedDouble,
  Crown,
  Gem,
  HandCoins,
  HeartPulse,
  ScrollText,
  ShieldAlert,
  Ticket,
  X,
  type LucideIcon,
} from 'lucide-react';
import Avatar from '@/components/Avatar';
import type { Award, Grade } from '@/lib/draft-grade';

// The draft, reviewed: superlatives first because they are the fun part, then
// the grades, then the full table. One deck, because two separate screens
// nobody opens is worse than one nobody can miss.

const AWARD_ICON: Record<string, LucideIcon> = {
  steal: Gem,
  reach: HandCoins,
  sickbay: HeartPulse,
  homer: Ticket,
  asleep: BedDouble,
  keeper: ShieldAlert,
  best: Crown,
  bargain: AwardIcon,
};

const GRADE_TONE: Record<string, string> = {
  A: 'text-accent',
  B: 'text-foreground',
  C: 'text-muted',
  D: 'text-live',
  F: 'text-live',
};

type Card =
  | { kind: 'intro'; managers: number; picks: number }
  | { kind: 'award'; award: Award }
  | { kind: 'grade'; grade: Grade; mine: boolean }
  | { kind: 'table'; grades: Grade[]; viewerId: string };

export default function DraftReport({
  grades,
  awards,
  viewerId,
  picks,
  autoOpen = false,
  storageKey,
}: {
  grades: Grade[];
  awards: Award[];
  viewerId: string;
  picks: number;
  // Opens itself once, the first time you land after the draft.
  autoOpen?: boolean;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!autoOpen || !storageKey) return;
    try {
      if (!localStorage.getItem(storageKey)) setOpen(true);
    } catch {
      // storage blocked; just do not nag
    }
  }, [autoOpen, storageKey]);

  const close = () => {
    setOpen(false);
    setStep(0);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, 'seen');
      } catch {
        // nothing to do
      }
    }
  };

  const mine = grades.find((g) => g.userId === viewerId);
  const deck: Card[] = [
    { kind: 'intro', managers: grades.length, picks },
    ...awards.map((award) => ({ kind: 'award' as const, award })),
    ...(mine ? [{ kind: 'grade' as const, grade: mine, mine: true }] : []),
    { kind: 'table', grades, viewerId },
  ];

  const opener = (
    <button onClick={() => setOpen(true)} className="btn-primary w-full">
      <ScrollText className="h-4 w-4" />
      Open the draft report
    </button>
  );

  if (!mounted || !grades.length) return opener;

  const card = deck[Math.min(step, deck.length - 1)];
  const last = step >= deck.length - 1;

  const body = open ? (
    <div className="modal-scrim" onClick={close}>
      <div
        className="modal-card reveal space-y-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
            Draft report · {step + 1} of {deck.length}
          </p>
          <button
            onClick={close}
            aria-label="Close"
            className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full border border-edge text-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {card.kind === 'intro' ? (
          <div className="space-y-3">
            <ScrollText className="mx-auto h-8 w-8 text-accent" strokeWidth={1.5} />
            <h2 className="font-display text-3xl">The draft, reviewed</h2>
            <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted">
              {card.picks} picks, {card.managers} managers, one board. Here is who robbed the room,
              who reached, and what it is all worth.
            </p>
          </div>
        ) : null}

        {card.kind === 'award' ? (
          (() => {
            const Icon = AWARD_ICON[card.award.key] ?? AwardIcon;
            return (
              <div className="space-y-3">
                <Icon className="mx-auto h-8 w-8 text-gold" strokeWidth={1.5} />
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-gold">
                  {card.award.title}
                </p>
                <div className="flex flex-col items-center gap-2">
                  <Avatar name={card.award.username} size={48} />
                  <p className="text-xl font-semibold tracking-tight">{card.award.username}</p>
                </div>
                <p className="text-sm font-semibold">{card.award.subject}</p>
                <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted">
                  {card.award.line}
                </p>
              </div>
            );
          })()
        ) : null}

        {card.kind === 'grade' ? (
          <div className="space-y-3">
            <p className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-muted-2">
              Your grade
            </p>
            <p
              className={`font-display text-7xl leading-none ${
                GRADE_TONE[card.grade.grade[0]] ?? 'text-muted'
              }`}
            >
              {card.grade.grade}
            </p>
            <ul className="mx-auto max-w-xs space-y-2 pt-1">
              {card.grade.notes.slice(0, 4).map((n, i) => (
                <li key={i} className="text-sm leading-relaxed text-muted">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {card.kind === 'table' ? (
          <div className="space-y-3">
            <h2 className="font-display text-2xl">Every grade</h2>
            <div className="divide-y divide-[var(--line)] text-left">
              {card.grades.map((g) => (
                <div key={g.userId} className="flex items-center gap-2.5 py-2">
                  <Avatar name={g.username} size={26} ring={g.userId === card.viewerId} />
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      g.userId === card.viewerId ? 'font-semibold text-accent' : 'font-semibold'
                    }`}
                  >
                    {g.username}
                  </span>
                  <span
                    className={`font-display text-xl leading-none ${
                      GRADE_TONE[g.grade[0]] ?? 'text-muted'
                    }`}
                  >
                    {g.grade}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[0.65rem] leading-relaxed text-muted-2">
              Graded on the board, not the table: value taken against where players were ranked,
              positions covered, club stacks, and how many of your picks can actually play.
            </p>
          </div>
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
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {opener}
      {body ? createPortal(body, document.body) : null}
    </>
  );
}
