import { describe, it, expect } from 'vitest';
import {
  BELL, PERIOD_LABEL, getScheduleStatus, secondsUntil,
  formatCountdown, currentPeriodNumber,
} from './schedule';

// A weekday at a given local wall-clock time. 2026-09-09 is a Wednesday;
// 2026-09-12 a Saturday, 2026-09-13 a Sunday.
const at = (h, m, s = 0, day = 9) => new Date(2026, 8, day, h, m, s);

describe('the bell schedule table itself', () => {
  it('has eight periods, in order, none overlapping', () => {
    expect(BELL).toHaveLength(8);
    BELL.forEach((p, i) => expect(p.period).toBe(i + 1));
    for (let i = 1; i < BELL.length; i++) {
      expect(BELL[i].startMin).toBeGreaterThan(BELL[i - 1].endMin);
    }
  });

  it('has every period ending after it starts', () => {
    for (const p of BELL) expect(p.endMin).toBeGreaterThan(p.startMin);
  });

  it('labels every period, and falls back for an unknown one', () => {
    expect(PERIOD_LABEL(1)).toBe('1st Period');
    expect(PERIOD_LABEL(8)).toBe('8th Period');
    expect(PERIOD_LABEL(99)).toBe('Period 99');
  });
});

describe('getScheduleStatus', () => {
  it('is "before" ahead of first period', () => {
    const s = getScheduleStatus(at(7, 30));
    expect(s.state).toBe('before');
    expect(s.nextLabel).toBe('1st Period');
  });

  it('is "in" during a period, counting down to its end', () => {
    const s = getScheduleStatus(at(9, 0));
    expect(s.state).toBe('in');
    expect(s.period).toBe(1);
    expect(s.targetSec).toBe((9 * 60 + 45) * 60);
  });

  it('is "in" exactly on the bell at both ends of a period', () => {
    expect(getScheduleStatus(at(8, 55)).state).toBe('in');
    expect(getScheduleStatus(at(8, 55)).period).toBe(1);
    expect(getScheduleStatus(at(9, 45)).state).toBe('in');
    expect(getScheduleStatus(at(9, 45)).period).toBe(1);
  });

  it('is "passing" between periods, counting down to the next start', () => {
    const s = getScheduleStatus(at(9, 47));
    expect(s.state).toBe('passing');
    expect(s.nextPeriod).toBe(2);
    expect(s.targetSec).toBe((9 * 60 + 49) * 60);
  });

  it('is "after" once the last period ends', () => {
    expect(getScheduleStatus(at(16, 16)).state).toBe('after');
    expect(getScheduleStatus(at(23, 59)).state).toBe('after');
  });

  it('is "weekend" on Saturday and Sunday, whatever the time', () => {
    expect(getScheduleStatus(at(10, 0, 0, 12)).state).toBe('weekend');
    expect(getScheduleStatus(at(10, 0, 0, 13)).state).toBe('weekend');
  });

  it('never returns an unknown state at any minute of a school day', () => {
    const valid = new Set(['before', 'in', 'passing', 'after']);
    for (let minute = 0; minute < 24 * 60; minute++) {
      const s = getScheduleStatus(at(Math.floor(minute / 60), minute % 60));
      expect(valid.has(s.state)).toBe(true);
      if (s.state !== 'after') expect(typeof s.targetSec).toBe('number');
    }
  });

  it('covers midnight and the last second of the day without gaps', () => {
    expect(getScheduleStatus(at(0, 0, 0)).state).toBe('before');
    expect(getScheduleStatus(at(23, 59, 59)).state).toBe('after');
  });
});

describe('secondsUntil', () => {
  it('counts down toward the target', () => {
    expect(secondsUntil((9 * 60 + 45) * 60, at(9, 44, 30))).toBe(30);
  });

  it('never goes negative once the target has passed', () => {
    expect(secondsUntil((9 * 60) * 60, at(10, 0))).toBe(0);
  });

  it('is zero exactly at the target', () => {
    expect(secondsUntil((9 * 60) * 60, at(9, 0, 0))).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('formats under an hour as M:SS', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(599)).toBe('9:59');
  });

  it('formats an hour or more as H:MM:SS', () => {
    expect(formatCountdown(3600)).toBe('1:00:00');
    expect(formatCountdown(3661)).toBe('1:01:01');
  });

  it('clamps negatives to zero rather than printing "-1:-1"', () => {
    expect(formatCountdown(-30)).toBe('0:00');
  });

  it('truncates fractional seconds', () => {
    expect(formatCountdown(59.9)).toBe('0:59');
  });
});

describe('currentPeriodNumber', () => {
  it('gives the period number during class and null otherwise', () => {
    expect(currentPeriodNumber(at(9, 0))).toBe(1);
    expect(currentPeriodNumber(at(9, 47))).toBe(null);   // passing
    expect(currentPeriodNumber(at(7, 0))).toBe(null);    // before
    expect(currentPeriodNumber(at(18, 0))).toBe(null);   // after
    expect(currentPeriodNumber(at(10, 0, 0, 12))).toBe(null); // weekend
  });
});
