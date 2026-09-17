import { describe, expect, it } from 'vitest';
import { AFTER_KICKOFF, BEFORE_KICKOFF, isLiveNow, liveWindow } from '../src/lib/live-window';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOW = Date.parse('2026-09-15T19:00:00Z');

describe('liveWindow', () => {
  it('is null when nothing is scheduled', () => {
    expect(liveWindow([], NOW)).toBeNull();
  });

  it('is null once every match has settled', () => {
    expect(liveWindow([NOW - 3 * HOUR, NOW - 30 * HOUR], NOW)).toBeNull();
  });

  it('opens shortly before kickoff and closes after scoring settles', () => {
    const k = NOW + 2 * HOUR;
    const w = liveWindow([k], NOW);
    expect(w).toEqual({ from: k - BEFORE_KICKOFF, until: k + AFTER_KICKOFF });
    expect(isLiveNow(w, NOW)).toBe(false);
    expect(isLiveNow(w, k - 5 * MIN)).toBe(true);
    expect(isLiveNow(w, k + 90 * MIN)).toBe(true);
    expect(isLiveNow(w, k + AFTER_KICKOFF)).toBe(false);
  });

  it('returns the window in progress rather than a later one', () => {
    const w = liveWindow([NOW - 40 * MIN, NOW + 5 * HOUR], NOW);
    expect(isLiveNow(w, NOW)).toBe(true);
    expect(w?.until).toBe(NOW - 40 * MIN + AFTER_KICKOFF);
  });

  it('merges a Saturday slate into one window', () => {
    const three = NOW + 3 * HOUR;
    const half = NOW + 5 * HOUR + 30 * MIN;
    const w = liveWindow([half, three, three, three], NOW);
    expect(w).toEqual({ from: three - BEFORE_KICKOFF, until: half + AFTER_KICKOFF });
  });

  it('skips a settled window to find the next one', () => {
    const next = NOW + 20 * HOUR;
    const w = liveWindow([NOW - 5 * HOUR, next], NOW);
    expect(w?.from).toBe(next - BEFORE_KICKOFF);
  });

  it('ignores kickoffs that are not numbers', () => {
    expect(liveWindow([Number.NaN], NOW)).toBeNull();
  });
});
