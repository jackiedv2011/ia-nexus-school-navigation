import { useState, useEffect, useRef } from 'react';
import { Map as MapIcon, ChevronDown, RefreshCw } from 'lucide-react';
import NavigationMap from './NavigationMap';
import { api } from '../api';
import styles from './InlineRouteMap.module.css';

// The map for a route the assistant just described, rendered under the message
// itself rather than behind a "Show on map" button.
//
// The chat's text is now a factual summary of the route the pathfinder
// computed, and this is the rest of that answer — the actual walk. Fetching it
// here (rather than in the page) keeps each message self-contained, so a
// scrolled-back conversation still shows its maps.
export default function InlineRouteMap({ from, to, fromFloor, toFloor }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' });
  const [open, setOpen] = useState(true);
  // Guards against a response landing after this bubble has been unmounted
  // (the user cleared the chat, switched conversations, or signed out).
  const aliveRef = useRef(true);
  const cardRef = useRef(null);
  // Only fetch once this card is actually near the viewport. Reopening a long
  // conversation would otherwise fire one request per route answer in it, all
  // at once, on a connection that may already be the reason the student is
  // waiting.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (typeof IntersectionObserver !== 'function') { setVisible(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); io.disconnect(); } },
      { rootMargin: '300px' },   // start a little before it scrolls into view
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    if (!visible || !open) return undefined;
    let cancelled = false;
    setState({ status: 'loading', data: null, error: '' });
    api.findRoute({ fromRoom: from, fromFloor, toRoom: to, toFloor })
      .then((data) => {
        if (cancelled || !aliveRef.current) return;
        setState({ status: 'ready', data, error: '' });
      })
      .catch((e) => {
        if (cancelled || !aliveRef.current) return;
        setState({ status: 'error', data: null, error: e.message || 'Could not load that route.' });
      });
    return () => { cancelled = true; aliveRef.current = false; };
  }, [visible, open, from, to, fromFloor, toFloor]);

  function retry() {
    // Re-running the effect by changing nothing isn't possible, so fetch again
    // directly. Same guards.
    setState({ status: 'loading', data: null, error: '' });
    api.findRoute({ fromRoom: from, fromFloor, toRoom: to, toFloor })
      .then((data) => aliveRef.current && setState({ status: 'ready', data, error: '' }))
      .catch((e) => aliveRef.current && setState({
        status: 'error', data: null, error: e.message || 'Could not load that route.',
      }));
  }

  return (
    <div className={styles.card} ref={cardRef}>
      <button
        className={styles.header}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={`route-${from}-${to}`}
      >
        <span className={styles.title}>
          <MapIcon size={14} strokeWidth={2} />
          Route · Room {from} → Room {to}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2.2}
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className={styles.body} id={`route-${from}-${to}`}>
          {(state.status === 'idle' || state.status === 'loading') && (
            <p className={styles.msg} aria-live="polite">Drawing the route…</p>
          )}
          {state.status === 'error' && (
            <div className={styles.errorBox} role="alert">
              <p className={styles.msg}>{state.error}</p>
              <button className={styles.retry} onClick={retry}>
                <RefreshCw size={13} strokeWidth={2} /> Try again
              </button>
            </div>
          )}
          {state.status === 'ready' && <NavigationMap data={state.data} />}
        </div>
      )}
    </div>
  );
}
