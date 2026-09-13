import { describe, expect, it } from 'vitest';
import { decideSync, isHeartbeatTick, type FixtureLite } from '../src/lib/sync-window';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
// A Sunday afternoon well away from any heartbeat or period boundary.
const NOW = Date.parse('2026-09-13T21:47:00Z');

const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe('decideSync', () => {
  it('does not treat a match as live just because bonus is unconfirmed', () => {
    // The exact state that kept the database awake all weekend: full time
    // hours ago, FPL still has finished=false.
    const fixtures: FixtureLite[] = Array.from({ length: 9 }, () => ({
      kickoff_time: at(-30 * HOUR),
      started: true,
      finished: false,
      finished_provisional: true,
    }));
    const d = decideSync(fixtures, NOW);
    expect(d.active).toBe(false);
    expect(d.chase).toBe(false);
  });

  it('syncs and chases while a ball is actually being kicked', () => {
    const d = decideSync(
      [{ kickoff_time: at(-40 * MIN), started: true, finished: false, finished_provisional: false }],
      NOW,
    );
    expect(d.active).toBe(true);
    expect(d.chase).toBe(true);
  });

  it('wakes just before kickoff but does not chase', () => {
    const d = decideSync([{ kickoff_time: at(5 * MIN), started: false }], NOW);
    expect(d.active).toBe(true);
    expect(d.chase).toBe(false);
  });

  it('ignores a kickoff that is still a while away', () => {
    const d = decideSync([{ kickoff_time: at(3 * HOUR), started: false }], NOW);
    expect(d.active).toBe(false);
  });

  it('settles bonus only on quarter hour ticks, so the database can sleep between', () => {
    const fixture: FixtureLite = {
      kickoff_time: at(-2.5 * HOUR),
      started: true,
      finished: false,
      finished_provisional: true,
    };
    // 21:52 is seven minutes into its quarter, so not a tick.
    const offTick = Date.parse('2026-09-13T21:52:00Z');
    expect(
      decideSync(
        [{ ...fixture, kickoff_time: new Date(offTick - 2.5 * HOUR).toISOString() }],
        offTick,
      ).active,
    ).toBe(false);
    // 21:45 is.
    const quarter = Date.parse('2026-09-13T21:45:30Z');
    const onTick = decideSync(
      [{ ...fixture, kickoff_time: new Date(quarter - 2.5 * HOUR).toISOString() }],
      quarter,
    );
    expect(onTick.active).toBe(true);
    expect(onTick.chase).toBe(false);
  });

  it('stops settling once bonus has had long enough', () => {
    const quarter = Date.parse('2026-09-13T21:45:30Z');
    const d = decideSync(
      [
        {
          kickoff_time: new Date(quarter - 6 * HOUR).toISOString(),
          started: true,
          finished: false,
          finished_provisional: true,
        },
      ],
      quarter,
    );
    expect(d.active).toBe(false);
  });

  it('wakes for the deadline nudge on half hour ticks within two hours', () => {
    // Deadline is 90 minutes before first kickoff, so a kickoff 2.5 hours out
    // puts the deadline one hour away.
    const half = Date.parse('2026-09-13T21:30:30Z');
    const d = decideSync(
      [{ kickoff_time: new Date(half + 2.5 * HOUR).toISOString(), started: false }],
      half,
    );
    expect(d.active).toBe(true);
    expect(d.reason).toMatch(/deadline/);
  });

  it('is asleep on an ordinary quiet tick', () => {
    expect(decideSync([], NOW)).toEqual({ active: false, chase: false, reason: 'nothing in play' });
  });

  it('never chases for anything except a live match', () => {
    const quiet = [
      { kickoff_time: at(5 * MIN), started: false },
      { kickoff_time: at(-2 * HOUR), started: true, finished: false, finished_provisional: true },
    ];
    expect(decideSync(quiet, NOW).chase).toBe(false);
  });
});

describe('isHeartbeatTick', () => {
  it('fires once in each six hour period', () => {
    const ticks = [];
    const start = Date.parse('2026-09-13T00:00:00Z');
    for (let t = start; t < start + 24 * HOUR; t += 5 * MIN) {
      if (isHeartbeatTick(t)) ticks.push(new Date(t).toISOString().slice(11, 16));
    }
    expect(ticks).toEqual(['00:00', '06:00', '12:00', '18:00']);
  });

  it('needs no memory, so a cold start cannot trigger one', () => {
    // The same instant always gives the same answer.
    const t = Date.parse('2026-09-13T21:47:00Z');
    expect(isHeartbeatTick(t)).toBe(isHeartbeatTick(t));
    expect(isHeartbeatTick(t)).toBe(false);
  });
});
