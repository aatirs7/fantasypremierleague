'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { HelpCircle, X } from 'lucide-react';

// Floating question mark on every page. Opens a plain-language explainer for
// the page you are on: zero fantasy jargon assumed.

type HelpTopic = { title: string; points: string[] };

function topicFor(pathname: string): HelpTopic | null {
  if (pathname === '/') return null;
  if (pathname.startsWith('/home')) {
    return {
      title: 'Home',
      points: [
        'This is your dashboard: every league you are in, plus your next deadline.',
        'Join a friend’s league with their 6-letter code, or create your own and share the code.',
        'The countdown shows when the next gameweek locks. Set your lineup before it hits zero.',
      ],
    };
  }
  if (pathname.includes('/draft')) {
    return {
      title: 'The draft',
      points: [
        'Managers take turns picking real Premier League players. The order snakes: whoever picks last in a round picks first in the next.',
        'You have 90 seconds per turn. When the bar at the top turns gold, it is YOUR turn: tap a player, then confirm.',
        'You need 15 players: 2 goalkeepers, 5 defenders, 5 midfielders, 3 forwards. The app blocks picks that would break this.',
        'Miss your turn? The app auto-picks the best available player for you. You are never left behind.',
        'Each player can only be owned by one manager in your league, so picked players vanish from the list.',
      ],
    };
  }
  if (pathname.includes('/waivers')) {
    return {
      title: 'Waivers',
      points: [
        'Waivers are how you sign players nobody owns, fairly.',
        'File a claim: pick a player to add and one of yours to drop. Claims are not instant.',
        'All claims process together, 24 hours before the next deadline. If two managers want the same player, the one higher in the priority list wins.',
        'Priority favours the teams lower in the table, and winning a claim sends you to the bottom of the list.',
        'After processing, leftover players are free agents: first come, first served until the deadline.',
      ],
    };
  }
  if (pathname.includes('/trades')) {
    return {
      title: 'Trades',
      points: [
        'Swap players directly with another manager: offer up to 3 of yours for up to 3 of theirs.',
        'Both squads must still have exactly 2 GK, 5 DEF, 5 MID, 3 FWD after the swap.',
        'The other manager gets 48 hours to accept before the offer expires.',
        'Trades pause while a gameweek is being played, and resume after the final whistle.',
      ],
    };
  }
  if (pathname.includes('/squad/') || pathname.startsWith('/squad')) {
    return {
      title: 'Your squad',
      points: [
        'Pick your starting 11 from your 15 players before each deadline. The other 4 sit on the bench.',
        'Tap a starter, then a bench player, to swap them. You need 1 goalkeeper, 3-5 defenders, 2-5 midfielders, and 1-3 forwards.',
        'The crown is your captain: they score DOUBLE points. The shield is the vice, who doubles instead if your captain does not play.',
        'If a starter does not play at all, a bench player automatically steps in after the matches finish.',
        'Do nothing and last week’s lineup carries over, so you are never scoreless.',
      ],
    };
  }
  if (pathname.startsWith('/league')) {
    return {
      title: 'Your league',
      points: [
        'The table ranks everyone by total points across the season.',
        '▲ with “spots” shows places climbed since the gameweek started; “pts” shows points gained. They are different things.',
        'During matches, gameweek points tick up LIVE. Final numbers (bonus points, automatic substitutions) settle when the round is confirmed.',
        'Tap any manager to see their squad and history. Use Waivers and Trades to improve yours all season.',
      ],
    };
  }
  if (pathname.startsWith('/players')) {
    return {
      title: 'Players',
      points: [
        'Every Premier League player, with the numbers that matter.',
        '“Draft rank” is FPL’s own rating of who is worth picking first. Lower is better.',
        '“Form” is average points over the last month; “pts” is season total; price is FPL’s valuation.',
        'A yellow dot means doubtful, red means injured, suspended, or unavailable.',
        'Tap a player for fixtures (FDR = fixture difficulty, 1 easy to 5 hard) and gameweek history.',
      ],
    };
  }
  if (pathname.startsWith('/me')) {
    return {
      title: 'Me',
      points: [
        'Your account and leagues live here.',
        'There is no PIN reset, so do not forget it.',
        'Add the app to your phone’s home screen for the best experience.',
      ],
    };
  }
  return null;
}

export default function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const topic = topicFor(pathname);
  if (!topic) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Help"
        className="glass fixed bottom-28 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full text-muted shadow-lg shadow-black/30 active:scale-95 lg:bottom-6 lg:right-6"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 lg:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="glass reveal w-full max-w-md space-y-4 rounded-t-3xl p-5 pb-10 lg:rounded-3xl lg:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-3xl">{topic.title}</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close help"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.05] text-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2.5">
              {topic.points.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {p}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setOpen(false)}
              className="min-h-11 w-full rounded-xl bg-accent text-sm font-bold text-[var(--accent-ink)] active:scale-95"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
