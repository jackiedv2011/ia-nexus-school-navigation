// Single source of truth for the bell schedule on the frontend, plus helpers
// for "what's happening right now". Times mirror the backend schedule exactly.

export const BELL = [
  { period: 1, label: '1st Period', start: '8:55 AM',  end: '9:45 AM',  startMin: 8 * 60 + 55,  endMin: 9 * 60 + 45 },
  { period: 2, label: '2nd Period', start: '9:49 AM',  end: '10:39 AM', startMin: 9 * 60 + 49,  endMin: 10 * 60 + 39 },
  { period: 3, label: '3rd Period', start: '10:43 AM', end: '11:33 AM', startMin: 10 * 60 + 43, endMin: 11 * 60 + 33 },
  { period: 4, label: '4th Period', start: '11:37 AM', end: '12:33 PM', startMin: 11 * 60 + 37, endMin: 12 * 60 + 33 },
  { period: 5, label: '5th Period', start: '12:37 PM', end: '1:33 PM',  startMin: 12 * 60 + 37, endMin: 13 * 60 + 33 },
  { period: 6, label: '6th Period', start: '1:37 PM',  end: '2:27 PM',  startMin: 13 * 60 + 37, endMin: 14 * 60 + 27 },
  { period: 7, label: '7th Period', start: '2:31 PM',  end: '3:21 PM',  startMin: 14 * 60 + 31, endMin: 15 * 60 + 21 },
  { period: 8, label: '8th Period', start: '3:25 PM',  end: '4:15 PM',  startMin: 15 * 60 + 25, endMin: 16 * 60 + 15 },
];

export const PERIOD_LABEL = (p) => BELL.find(b => b.period === p)?.label || `Period ${p}`;

// Seconds since local midnight.
function secondsOfDay(now) {
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

/**
 * Describe the current moment relative to the bell schedule.
 * Returns one of:
 *  - { state: 'before',  targetSec, nextLabel }                  before 1st period
 *  - { state: 'in',      period, label, targetSec }              inside a class period (targetSec = end)
 *  - { state: 'passing', nextPeriod, nextLabel, targetSec }      between periods (targetSec = next start)
 *  - { state: 'after' }                                          after the last period
 *  - { state: 'weekend' }                                        Sat/Sun
 * targetSec is seconds-of-day the countdown is heading toward.
 */
export function getScheduleStatus(now = new Date()) {
  const day = now.getDay(); // 0 Sun .. 6 Sat
  if (day === 0 || day === 6) return { state: 'weekend' };

  const t = secondsOfDay(now);
  const first = BELL[0];
  const last = BELL[BELL.length - 1];

  if (t < first.startMin * 60) {
    return { state: 'before', targetSec: first.startMin * 60, nextLabel: first.label };
  }
  if (t > last.endMin * 60) {
    return { state: 'after' };
  }
  for (let i = 0; i < BELL.length; i++) {
    const p = BELL[i];
    if (t >= p.startMin * 60 && t <= p.endMin * 60) {
      return { state: 'in', period: p.period, label: p.label, targetSec: p.endMin * 60 };
    }
    const prev = BELL[i - 1];
    if (prev && t > prev.endMin * 60 && t < p.startMin * 60) {
      return { state: 'passing', nextPeriod: p.period, nextLabel: p.label, targetSec: p.startMin * 60 };
    }
  }
  return { state: 'after' };
}

// Seconds remaining until a target seconds-of-day value (never negative).
export function secondsUntil(targetSec, now = new Date()) {
  return Math.max(0, targetSec - secondsOfDay(now));
}

// Format a number of seconds as M:SS (or H:MM:SS if over an hour).
export function formatCountdown(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Which period number is happening right now (or null). Used for "next class".
export function currentPeriodNumber(now = new Date()) {
  const status = getScheduleStatus(now);
  return status.state === 'in' ? status.period : null;
}
