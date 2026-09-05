import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, MapPin, Bell, CalendarDays, Check, ArrowRight } from 'lucide-react';
import { api } from '../api';
import { BELL } from '../lib/schedule';
import styles from './Onboarding.module.css';
import { writeStored, writeStoredJson } from '../lib/storage';
import { useModal } from '../lib/useModal';

const CACHE_KEY = 'ia_my_schedule';
const DONE_KEY = 'ia_onboarded';

// First-run welcome flow: introduces IA Nexus and gets the student's schedule
// set so the flagship "what's next + route me there" feature works immediately.
export default function Onboarding({ userName, onClose }) {
  const navigate = useNavigate();
  const ref = useModal(null);
  const [step, setStep] = useState(1);
  const [rooms, setRooms] = useState({});
  const [saving, setSaving] = useState(false);

  function setRoom(period, value) {
    const clean = value.replace(/[^0-9]/g, '').slice(0, 3);
    setRooms((r) => ({ ...r, [period]: clean }));
  }

  function finish(goSchedule) {
    writeStored(DONE_KEY, '1');
    onClose();
    if (goSchedule) navigate('/schedule');
  }

  async function saveAndContinue() {
    const filled = Object.fromEntries(Object.entries(rooms).filter(([, v]) => v));
    setSaving(true);
    try {
      if (Object.keys(filled).length) {
        await api.saveSchedule(filled);
        writeStoredJson(CACHE_KEY, filled);
      }
    } catch {
      /* offline — the schedule page will retry; cache anyway */
      writeStoredJson(CACHE_KEY, filled);
    } finally {
      setSaving(false);
      setStep(3);
    }
  }

  const filledCount = Object.values(rooms).filter(Boolean).length;

  return (
    <div className={styles.overlay}>
      {/* No Escape-to-close: this is the first-run flow, and both steps have an
          explicit skip. Focus is still moved in and restored on close. */}
      <div ref={ref} tabIndex={-1} className={styles.modal} role="dialog" aria-modal="true" aria-label="Welcome to IA Nexus">
        <div className={styles.dots}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`${styles.dot} ${n <= step ? styles.dotOn : ''}`} />
          ))}
        </div>

        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div className={styles.step}>
            <div className={styles.icon}><GraduationCap size={30} strokeWidth={1.8} /></div>
            <h2 className={styles.title}>Welcome to IA Nexus{userName ? `, ${userName}` : ''}</h2>
            <p className={styles.sub}>
              Find any teacher, navigate every floor, and always know what class is next.
            </p>
            <ul className={styles.featureList}>
              <li className={styles.featureItem}><MapPin size={18} strokeWidth={2} /> Real-time teacher locations</li>
              <li className={styles.featureItem}><Bell size={18} strokeWidth={2} /> Live bell schedule &amp; passing-period timer</li>
              <li className={styles.featureItem}><CalendarDays size={18} strokeWidth={2} /> Your personal schedule, synced everywhere</li>
            </ul>
            <button className={styles.primaryBtn} onClick={() => setStep(2)}>
              Get started <ArrowRight size={17} strokeWidth={2.2} />
            </button>
            <button className={styles.skipBtn} onClick={() => finish(false)}>Skip for now</button>
          </div>
        )}

        {/* Step 2 — Schedule */}
        {step === 2 && (
          <div className={styles.step}>
            <div className={styles.icon}><CalendarDays size={30} strokeWidth={1.8} /></div>
            <h2 className={styles.title}>Add your classes</h2>
            <p className={styles.sub}>Enter the room for each period — you can change these anytime.</p>
            <div className={styles.grid}>
              {BELL.map((b) => (
                <label key={b.period} className={styles.field}>
                  <span className={styles.fieldLabel}>{b.label}</span>
                  <input
                    className={styles.fieldInput}
                    type="text"
                    inputMode="numeric"
                    placeholder="Room"
                    maxLength={3}
                    value={rooms[b.period] || ''}
                    onChange={(e) => setRoom(b.period, e.target.value)}
                    aria-label={`${b.label} room`}
                  />
                </label>
              ))}
            </div>
            <button className={styles.primaryBtn} onClick={saveAndContinue} disabled={saving}>
              {saving ? 'Saving…' : filledCount > 0 ? `Save ${filledCount} ${filledCount === 1 ? 'class' : 'classes'}` : 'Continue'}
            </button>
            <button className={styles.skipBtn} onClick={() => setStep(3)}>I'll do this later</button>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <div className={styles.step}>
            <div className={`${styles.icon} ${styles.iconOk}`}><Check size={30} strokeWidth={2.4} /></div>
            <h2 className={styles.title}>You're all set</h2>
            <p className={styles.sub}>
              IA Nexus will show what class is next and route you there. Ask the assistant anything,
              or open your schedule to see your day.
            </p>
            <button className={styles.primaryBtn} onClick={() => finish(true)}>
              View my schedule <ArrowRight size={17} strokeWidth={2.2} />
            </button>
            <button className={styles.skipBtn} onClick={() => finish(false)}>Start exploring</button>
          </div>
        )}
      </div>
    </div>
  );
}
