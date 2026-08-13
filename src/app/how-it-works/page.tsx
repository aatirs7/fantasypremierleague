import Link from 'next/link';
import {
  ArrowLeftRight,
  ArrowLeft,
  CalendarDays,
  Crown,
  MessageCircle,
  Search,
  Shirt,
  Sparkles,
  Swords,
  Trophy,
  Zap,
} from 'lucide-react';
import { REGULAR_SEASON_END, SEMIS_GW, FINAL_GW } from '@/lib/h2h-rules';

export const dynamic = 'force-static';

// The house rules, in plain language. Written for someone who has never
// played fantasy: no jargon, no assumed knowledge.
const SECTIONS = [
  {
    icon: Swords,
    title: 'The draft',
    lines: [
      'Before the season you take turns picking real Premier League players. Each player can only be owned by one manager in your league, so once someone is taken, they are gone.',
      'The order snakes: if you pick last in round one, you pick first in round two, so nobody is punished for a bad draw.',
      'You have 90 seconds a turn and end with 15 players: 2 goalkeepers, 5 defenders, 5 midfielders, 3 forwards.',
      'Miss your turn and the app picks the best available player for you, starting from your own draft plan if you starred anyone.',
    ],
  },
  {
    icon: Shirt,
    title: 'Your lineup',
    lines: [
      'Every gameweek you pick 11 starters from your 15. The other 4 sit on the bench.',
      'Legal shapes: 1 goalkeeper, 3 to 5 defenders, 2 to 5 midfielders, 1 to 3 forwards.',
      'Pick a captain and a vice. Your captain scores double. If the captain does not play at all, the vice doubles instead.',
      'If a starter does not play, a bench player who did automatically replaces them once the matches finish. You do not lose the week for missing one injury.',
      'Do nothing and last week’s lineup carries over, so you are never scoreless.',
    ],
  },
  {
    icon: Zap,
    title: 'Scoring',
    lines: [
      'Points are the official Fantasy Premier League numbers, exactly as FPL awards them, including bonus points.',
      'Scores tick up live while matches play. They are provisional until the gameweek is confirmed, which is when autosubs and final bonus land.',
      'Players whose club has no fixture that week simply score nothing.',
    ],
  },
  {
    icon: Trophy,
    title: 'Head to head and the playoffs',
    lines: [
      `Every gameweek you face one other manager. Beat their score and you take the win, and your record is what the table ranks you by.`,
      'This is the point: a bad month does not end your season. Win six of seven and you are right back in it.',
      `The regular season runs to gameweek ${REGULAR_SEASON_END}. The top four then play semi-finals in gameweek ${SEMIS_GW} (first plays fourth, second plays third), and the winners meet in the final on gameweek ${FINAL_GW}, the last day of the season.`,
      'With an odd number of managers, one person gets a bye each week and everyone gets exactly one over a cycle.',
      'Total points still exist as the Points tab and as the tiebreaker if two records match.',
    ],
  },
  {
    icon: Sparkles,
    title: 'Chips',
    lines: [
      'Three one-time power plays, each usable once per season. The skill is in the timing.',
      'Triple Captain: your captain scores three times instead of twice.',
      'Bench Boost: all 15 of your players score, nobody is left on the bench.',
      'Wildcard: every one of your waiver claims can land in a single window instead of just the top one.',
      'Play a chip before the deadline. You can take it back until then, and only one chip per gameweek.',
    ],
  },
  {
    icon: Search,
    title: 'Waivers',
    lines: [
      'Any player nobody owns can be signed, but not first come first served.',
      'You file a claim: one player in, one of yours out. Claims are processed together 24 hours before the next deadline.',
      'If several managers want the same player, the one highest in the priority order gets him. Priority runs in reverse standings order, so the teams doing worst get first refusal, and winning a claim drops you to the bottom.',
      'After processing, whoever is left is a free agent you can grab instantly until the deadline. Players dropped in a window are locked until the next one, so nobody can drop and re-grab.',
    ],
  },
  {
    icon: ArrowLeftRight,
    title: 'Trades',
    lines: [
      'Swap up to 3 players with another manager. Both squads have to still be legal (2 goalkeepers, 5 defenders, 5 midfielders, 3 forwards) after the swap.',
      'Offers expire after 48 hours, and the proposer can cancel any time before they are answered.',
      'Trades freeze once a gameweek deadline passes and reopen when those matches finish, so nobody can trade mid-round.',
    ],
  },
  {
    icon: Crown,
    title: 'Weekly awards',
    lines: [
      'After every gameweek the app hands out awards automatically, and posts them to your league chat.',
      'Manager of the Week: highest score. Wooden Spoon: lowest.',
      'Bench Disaster: most points left sitting on your bench.',
      'Captain Curse: your captain returned two points or fewer.',
    ],
  },
  {
    icon: MessageCircle,
    title: 'Chat',
    lines: [
      'Every league has a chat thread for arguing about all of the above.',
      'The gameweek results and awards post themselves there, so there is always something to react to.',
    ],
  },
  {
    icon: CalendarDays,
    title: 'Getting around',
    lines: [
      'Home: your countdown, your team, your league at a glance.',
      'Draft: the draft room, live on draft night and a recap afterwards.',
      'My Team: your pitch and lineup for the coming gameweek.',
      'League: head to head table, points table, the real PL table, chat, stats, waivers and trades.',
      'Matches: every fixture and live score. More: player scouting and your profile.',
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <div className="reveal space-y-5 pb-6 pt-1 lg:mx-auto lg:max-w-2xl">
      <Link href="/home" className="flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="text-center">
        <p className="text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
          The house rules
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">How it works</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          Never played fantasy before? Start here. It takes two minutes and you will know
          everything you need for the season.
        </p>
      </header>

      <div className="space-y-3">
        {SECTIONS.map((s) => (
          <section key={s.title} className="tile p-4">
            <div className="mb-2.5 flex items-center gap-2.5">
              <s.icon className="h-5 w-5 shrink-0 text-muted" strokeWidth={1.7} />
              <h2 className="text-base font-semibold tracking-tight">{s.title}</h2>
            </div>
            <ul className="space-y-2">
              {s.lines.map((line, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                  <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-center text-xs text-muted-2">
        Still stuck? Tap the question mark in the corner of any screen for a quick explainer of
        that page.
      </p>
    </div>
  );
}
