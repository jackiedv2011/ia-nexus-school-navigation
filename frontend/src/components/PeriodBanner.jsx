import { useState, useEffect } from 'react';
import { Bell, Footprints, Clock, Moon } from 'lucide-react';
import { getScheduleStatus, secondsUntil, formatCountdown } from '../lib/schedule';
import styles from './PeriodBanner.module.css';

// Live status pill: shows the current period (with a countdown to the end),
// the passing-period countdown, or an out-of-session message. Ticks every second.
export default function PeriodBanner() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const status = getScheduleStatus(now);

  let Icon, primary, count, tone;
  switch (status.state) {
    case 'in':
      Icon = Bell;
      primary = status.label;
      count = `ends in ${formatCountdown(secondsUntil(status.targetSec, now))}`;
      tone = styles.toneActive;
      break;
    case 'passing':
      Icon = Footprints;
      primary = 'Passing period';
      count = `${formatCountdown(secondsUntil(status.targetSec, now))} to ${status.nextLabel}`;
      tone = styles.tonePassing;
      break;
    case 'before':
      Icon = Clock;
      primary = 'School starts soon';
      count = `${formatCountdown(secondsUntil(status.targetSec, now))} to ${status.nextLabel}`;
      tone = styles.toneIdle;
      break;
    case 'weekend':
      Icon = Moon;
      primary = 'No school today';
      count = 'Enjoy your weekend';
      tone = styles.toneIdle;
      break;
    default: // after
      Icon = Moon;
      primary = 'School is out';
      count = 'See you tomorrow';
      tone = styles.toneIdle;
  }

  return (
    <div className={`${styles.banner} ${tone}`} role="status" aria-live="polite">
      <span className={styles.icon} aria-hidden="true"><Icon size={16} strokeWidth={2} /></span>
      <span className={styles.body}>
        <span className={styles.primary}>{primary}</span>
        <span className={styles.count}>{count}</span>
      </span>
    </div>
  );
}
