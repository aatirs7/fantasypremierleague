import { describe, expect, it } from 'vitest';
import {
  applyFormation,
  generateAutoLineup,
  legalFormations,
  validateLineup,
  type SquadPlayerInfo,
} from '@/lib/lineup-rules';

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

describe('legalFormations', () => {
  it('lists every shape that adds up to ten outfield players', () => {
    const shapes = legalFormations();
    expect(shapes.length).toBeGreaterThan(0);
    for (const s of shapes) {
      expect(s.def + s.mid + s.fwd).toBe(10);
      expect(s.def).toBeGreaterThanOrEqual(3);
      expect(s.def).toBeLessThanOrEqual(5);
      expect(s.fwd).toBeGreaterThanOrEqual(1);
      expect(s.fwd).toBeLessThanOrEqual(3);
    }
  });

  it('includes the classics and excludes the illegal', () => {
    const labels = legalFormations().map((s) => s.label);
    expect(labels).toContain('4-4-2');
    expect(labels).toContain('3-5-2');
    expect(labels).toContain('4-3-3');
    expect(labels).not.toContain('6-3-1');
  });
});

describe('applyFormation', () => {
  const positions = new Map<number, string>();
  const strength = new Map<number, number>();
  const squad = () => {
    positions.clear();
    strength.clear();
    const picks: {
      fplId: number;
      starting: boolean;
      slot: number;
      isCaptain: boolean;
      isVice: boolean;
    }[] = [];
    let id = 0;
    const add = (pos: string, n: number, starting: number) => {
      for (let i = 0; i < n; i++) {
        id++;
        positions.set(id, pos);
        strength.set(id, 100 - i);
        picks.push({
          fplId: id,
          starting: i < starting,
          slot: picks.length + 1,
          isCaptain: false,
          isVice: false,
        });
      }
    };
    add('GK', 2, 1);
    add('DEF', 5, 4);
    add('MID', 5, 4);
    add('FWD', 3, 2);
    return picks;
  };

  it('produces exactly the requested shape', () => {
    const out = applyFormation(
      squad(),
      positions,
      (id) => strength.get(id) ?? 0,
      { def: 3, mid: 5, fwd: 2 },
    );
    const starters = out.filter((p) => p.starting);
    expect(starters).toHaveLength(11);
    const count = (pos: string) =>
      starters.filter((p) => positions.get(p.fplId) === pos).length;
    expect(count('GK')).toBe(1);
    expect(count('DEF')).toBe(3);
    expect(count('MID')).toBe(5);
    expect(count('FWD')).toBe(2);
  });

  it('keeps the strongest current starters rather than rebuilding the team', () => {
    const picks = squad();
    const before = new Set(picks.filter((p) => p.starting).map((p) => p.fplId));
    const out = applyFormation(picks, positions, (id) => strength.get(id) ?? 0, {
      def: 4,
      mid: 4,
      fwd: 2,
    });
    const after = out.filter((p) => p.starting).map((p) => p.fplId);
    expect(after.every((id) => before.has(id))).toBe(true);
  });

  it('strips the armband from anyone dropped to the bench', () => {
    const picks = squad().map((p) =>
      // The fourth forward-most starter, about to be squeezed out.
      p.fplId === 15 ? { ...p, isCaptain: true } : p,
    );
    const out = applyFormation(picks, positions, (id) => strength.get(id) ?? 0, {
      def: 5,
      mid: 4,
      fwd: 1,
    });
    for (const p of out) {
      if (!p.starting) expect(p.isCaptain).toBe(false);
    }
  });

  it('always leaves four on the bench', () => {
    const out = applyFormation(squad(), positions, (id) => strength.get(id) ?? 0, {
      def: 5,
      mid: 3,
      fwd: 2,
    });
    expect(out.filter((p) => !p.starting)).toHaveLength(4);
  });
});
