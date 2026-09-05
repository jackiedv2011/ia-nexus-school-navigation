import { useEffect, useRef } from 'react';

// Shared modal behaviour: close on Escape, lock background scroll, move focus
// into the dialog on open and return it to whatever was focused before on
// close, and keep Tab inside the dialog while it is open.
//
// Without focus management a keyboard or screen-reader user opens a dialog and
// their focus is still behind it — they Tab through the whole page underneath
// without ever reaching the thing that just appeared, and on close they are
// dumped back at the top of the document instead of the control they used.
//
// Returns a ref to put on the dialog element (which needs tabIndex={-1} so it
// can receive focus when it contains no focusable controls).
//
// `onClose` is read through a ref rather than being an effect dependency. Every
// call site passes an inline arrow, so a dependency would make the effect
// re-run on every render of the parent — which would re-focus the first control
// each time and yank the cursor out of whatever the user was typing in.
export function useModal(onClose, { active = true } = {}) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    const previouslyFocused = document.activeElement;

    // Focusable descendants, in document order.
    //
    // Deliberately NOT filtered on `offsetParent !== null`: that is null for
    // any `position: fixed` element, which is exactly what these modals are, so
    // it would report every control as invisible and disable the trap entirely.
    // The selector already excludes disabled controls and tabindex="-1"; the
    // only other genuinely unreachable things in this app are the honeypot
    // fields, which are marked `hidden` or sit inside `aria-hidden="true"`.
    const focusables = () => Array.from(
      node?.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []
    ).filter(el => !el.hidden && !el.closest('[hidden], [aria-hidden="true"]'));

    // Focus the first control, or the dialog itself if it has none.
    (focusables()[0] || node)?.focus?.();

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (node && !node.contains(document.activeElement)) {
        // Focus is outside the dialog (it started there, or something moved
        // it) — pull it back in rather than letting Tab walk the page behind.
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      // Restore focus only if it is still inside the dialog (or was lost when
      // the dialog unmounted) — never yank it from something the user has since
      // clicked.
      const activeEl = document.activeElement;
      if (!activeEl || activeEl === document.body || node?.contains(activeEl)) {
        previouslyFocused?.focus?.();
      }
    };
    // Deliberately depends only on `active`: see the note above about onClose.
  }, [active]);

  return ref;
}
