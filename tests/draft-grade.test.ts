import { describe, expect, it } from 'vitest';
import {
  draftAwards,
  gradeDraft,
  playerValue,
  type GradeEntry,
  type GradePlayer,
} from '../src/lib/draft-grade';

let seq = 0;
function player(
  position: string,
  lastSeasonPoints: number | null,
  overrides: Partial<GradePlayer> = {},
): GradePlayer {
  seq++;
  return {
    fplId: seq,
    webName: `P${seq}`,
    position,
    clubShort: `C${seq}`,
    draftRank: null,
    lastSeasonPoints,
    status: 'a',
    pickNumber: seq,
    autoPicked: false,
    ...overrides,
  };
}

// A legal 2/5/5/3 squad at a given quality level.
function squad(base: number, overrides: Partial<GradePlayer> = {}): GradePlayer[] {
  return [
    ...Array.from({ length: 2 }, () => player('GK', base)),
    ...Array.from({ length: 5 }, () => player('DEF', base)),
    ...Array.from({ length: 5 }, () => player('MID', base)),
    ...Array.from({ length: 3 }, () => player('FWD', base)),
  ].map((p) => ({ ...p, ...overrides }));
}

const entry = (username: string, players: GradePlayer[]): GradeEntry => ({
  userId: username,
  username,
  players,
});

describe('playerValue', () => {
  it('uses last season points when there are any', () => {
    expect(playerValue(player('MID', 150))).toBe(150);
  });

  it('falls back to draft rank for a player new to the league', () => {
    expect(playerValue(player('MID', null, { draftRank: 10 }))).toBe(200);
  });

  it('is zero for a player with neither', () => {
    expect(playerValue(player('MID', null))).toBe(0);
  });
});

describe('gradeDraft', () => {
  it('ranks the stronger squad above the weaker one', () => {
    const out = gradeDraft([entry('Strong', squad(180)), entry('Weak', squad(40))]);
    expect(out[0].username).toBe('Strong');
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it('punishes a squad full of unavailable early picks', () => {
    const healthy = entry('Healthy', squad(120));
    const injured = entry(
      'Injured',
      squad(120).map((p, i) => (i < 4 ? { ...p, status: 'i', pickNumber: i + 1 } : p)),
    );
    const out = gradeDraft([healthy, injured]);
    const h = out.find((g) => g.username === 'Healthy')!;
    const i = out.find((g) => g.username === 'Injured')!;
    expect(i.score).toBeLessThan(h.score);
    expect(i.notes.join(' ')).toMatch(/cannot play/);
  });

  it('calls out a club stack', () => {
    const stacked = squad(120).map((p, i) => (i < 5 ? { ...p, clubShort: 'NFO' } : p));
    const out = gradeDraft([entry('Stacker', stacked), entry('Spread', squad(120))]);
    expect(out.find((g) => g.username === 'Stacker')!.notes.join(' ')).toMatch(/NFO/);
  });

  it('calls out an early goalkeeper', () => {
    const early = squad(120).map((p) =>
      p.position === 'GK' ? { ...p, pickNumber: 2 } : { ...p, pickNumber: 40 },
    );
    const out = gradeDraft([entry('Keeper', early), entry('Normal', squad(120))]);
    expect(out.find((g) => g.username === 'Keeper')!.notes.join(' ')).toMatch(/goalkeeper in round/i);
  });

  it('notes picks the clock made', () => {
    const asleep = squad(120).map((p, i) => (i < 2 ? { ...p, autoPicked: true } : p));
    const out = gradeDraft([entry('Asleep', asleep), entry('Awake', squad(120))]);
    expect(out.find((g) => g.username === 'Asleep')!.notes.join(' ')).toMatch(/clock/);
  });

  it('always gives every manager a letter and a reason', () => {
    const out = gradeDraft([entry('A', squad(100)), entry('B', squad(100))]);
    for (const g of out) {
      expect(g.grade).toMatch(/^[A-F][+-]?$/);
      expect(g.headline.length).toBeGreaterThan(0);
      expect(g.notes.length).toBeGreaterThan(0);
    }
  });

  it('returns nothing for an empty league', () => {
    expect(gradeDraft([])).toEqual([]);
  });
});

describe('draftAwards', () => {
  it('hands out an award for the biggest steal', () => {
    const lucky = squad(120).map((p, i) =>
      i === 0 ? { ...p, webName: 'Bargain', draftRank: 5, pickNumber: 90 } : p,
    );
    const out = draftAwards([entry('Lucky', lucky), entry('Other', squad(120))]);
    const steal = out.find((a) => a.key === 'steal');
    expect(steal?.username).toBe('Lucky');
    expect(steal?.subject).toBe('Bargain');
  });

  it('hands out an award for the deepest club stack', () => {
    const stacked = squad(120).map((p, i) => (i < 6 ? { ...p, clubShort: 'NFO' } : p));
    const out = draftAwards([entry('Homer', stacked), entry('Other', squad(120))]);
    const homer = out.find((a) => a.key === 'homer');
    expect(homer?.username).toBe('Homer');
    expect(homer?.subject).toMatch(/NFO/);
  });

  it('never awards the same key twice', () => {
    const out = draftAwards([entry('A', squad(150)), entry('B', squad(80))]);
    expect(new Set(out.map((a) => a.key)).size).toBe(out.length);
  });

  it('gives every award a winner and a line', () => {
    const out = draftAwards([entry('A', squad(150)), entry('B', squad(80))]);
    for (const a of out) {
      expect(a.username.length).toBeGreaterThan(0);
      expect(a.line.length).toBeGreaterThan(0);
      expect(a.title.length).toBeGreaterThan(0);
    }
  });

  it('awards nothing to a one-manager league', () => {
    expect(draftAwards([entry('Solo', squad(120))])).toEqual([]);
  });
});
