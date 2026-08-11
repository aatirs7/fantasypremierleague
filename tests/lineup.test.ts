import { describe, expect, it } from 'vitest';
import { generateAutoLineup, validateLineup, type SquadPlayerInfo } from '@/lib/lineup-rules';

// A standard 2/5/5/3 squad with descending form.
function makeSquad(): SquadPlayerInfo[] {
  const squad: SquadPlayerInfo[] = [];
  let id = 1;
  const add = (position: string, count: number, baseForm: number) => {
    for (let i = 0; i < count; i++) {
      squad.push({ fplId: id++, position, form: baseForm - i });
    }
  };
  add('GK', 2, 5);
  add('DEF', 5, 8);
  add('MID', 5, 9);
  add('FWD', 3, 7);
  return squad;
}

describe('generateAutoLineup', () => {
  it('produces a valid lineup from a full squad', () => {
    const squad = makeSquad();
    const picks = generateAutoLineup(squad);
    const err = validateLineup(
      picks,
      new Map(squad.map((s) => [s.fplId, s.position])),
      new Set(squad.map((s) => s.fplId)),
    );
    expect(err).toBeNull();
  });

  it('starts exactly one GK and captains the top-form starter', () => {
    const squad = makeSquad();
    const picks = generateAutoLineup(squad);
    const posOf = new Map(squad.map((s) => [s.fplId, s.position]));
    const startingGks = picks.filter((p) => p.starting && posOf.get(p.fplId) === 'GK');
    expect(startingGks).toHaveLength(1);
    const captain = picks.find((p) => p.isCaptain)!;
    const vice = picks.find((p) => p.isVice)!;
    const formOf = new Map(squad.map((s) => [s.fplId, s.form]));
    const starterForms = picks.filter((p) => p.starting).map((p) => formOf.get(p.fplId)!);
    expect(formOf.get(captain.fplId)).toBe(Math.max(...starterForms));
    expect(captain.fplId).not.toBe(vice.fplId);
  });

  it('is deterministic', () => {
    const squad = makeSquad();
    expect(generateAutoLineup(squad)).toEqual(generateAutoLineup(squad.slice().reverse()));
  });
});

describe('validateLineup', () => {
  const squad = makeSquad();
  const posOf = new Map(squad.map((s) => [s.fplId, s.position]));
  const ids = new Set(squad.map((s) => s.fplId));

  it('rejects two starting goalkeepers', () => {
    const picks = generateAutoLineup(squad);
    const benchGk = picks.find((p) => !p.starting && posOf.get(p.fplId) === 'GK')!;
    const startingFwd = picks.find((p) => p.starting && posOf.get(p.fplId) === 'FWD')!;
    const bad = picks.map((p) => {
      if (p.fplId === benchGk.fplId) return { ...p, starting: true, slot: startingFwd.slot };
      if (p.fplId === startingFwd.fplId) return { ...p, starting: false, slot: benchGk.slot };
      return p;
    });
    expect(validateLineup(bad, posOf, ids)).toMatch(/GK/);
  });

  it('rejects a missing captain', () => {
    const picks = generateAutoLineup(squad).map((p) => ({ ...p, isCaptain: false }));
    expect(validateLineup(picks, posOf, ids)).toMatch(/captain/i);
  });

  it('rejects players not on the squad', () => {
    const picks = generateAutoLineup(squad);
    picks[14] = { ...picks[14], fplId: 999 };
    expect(validateLineup(picks, posOf, ids)).toMatch(/not on this squad/);
  });

  it('rejects fewer than 11 starters', () => {
    const picks = generateAutoLineup(squad);
    const bad = picks.map((p, i) => (i === 0 ? { ...p, starting: false } : p));
    expect(validateLineup(bad, posOf, ids)).toBeTruthy();
  });
});
