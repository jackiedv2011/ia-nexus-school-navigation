import { Map, X } from 'lucide-react';
import NavigationMap from './NavigationMap';
import styles from './RouteMapModal.module.css';

// Presentational modal that shows a NavigationMap for a fetched route.
// The parent owns the fetch + { loading, error, data } state.
export default function RouteMapModal({ from, to, loading, error, data, onClose }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Route map">
        <div className={styles.header}>
          <span className={styles.title}><Map size={16} strokeWidth={2} /> Route · Room {from} → Room {to}</span>
          <button className={styles.close} onClick={onClose} aria-label="Close map"><X size={18} strokeWidth={2} /></button>
        </div>
        <div className={styles.body}>
          {loading && <p className={styles.msg}>Finding the best route…</p>}
          {error && <p className={styles.err}>{error}</p>}
          {data && <NavigationMap data={data} />}
        </div>
      </div>
    </div>
  );
}
