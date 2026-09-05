import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useModal } from './useModal';

afterEach(cleanup);

function Dialog({ onClose, active = true, extra = null }) {
  const ref = useModal(onClose, { active });
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="Test dialog">
      <button>first</button>
      <button>second</button>
      {extra}
    </div>
  );
}

// Reproduces the shape every call site uses: an inline arrow recreated on each
// render of the parent. If useModal depended on it, the effect would re-run and
// steal focus back to the first control on every keystroke.
function Parent() {
  const [text, setText] = useState('');
  return (
    <>
      <Dialog
        onClose={() => {}}
        extra={<input aria-label="note" value={text} onChange={e => setText(e.target.value)} />}
      />
    </>
  );
}

describe('useModal focus handling', () => {
  it('moves focus into the dialog on open', () => {
    render(<Dialog onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('focuses the dialog itself when it has no focusable controls', () => {
    function Empty() {
      const ref = useModal(() => {});
      return <div ref={ref} tabIndex={-1} role="dialog" aria-label="Empty" />;
    }
    render(<Empty />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('restores focus to the previously focused element on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = render(<Dialog onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByText('first'));

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('does not steal focus back when the parent re-renders', () => {
    render(<Parent />);
    const note = screen.getByLabelText('note');
    note.focus();
    fireEvent.change(note, { target: { value: 'a' } });
    fireEvent.change(note, { target: { value: 'ab' } });
    // If the effect re-ran on each render it would have moved focus to "first".
    expect(document.activeElement).toBe(note);
  });

  it('does nothing at all when inactive', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    render(<Dialog onClose={() => {}} active={false} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe('useModal keyboard handling', () => {
  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('always calls the LATEST onClose, not the one from first render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Dialog onClose={first} />);
    rerender(<Dialog onClose={second} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('wraps Tab from the last control back to the first', () => {
    render(<Dialog onClose={() => {}} />);
    const last = screen.getByText('second');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    render(<Dialog onClose={() => {}} />);
    screen.getByText('first').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('second'));
  });

  it('pulls focus back in if it escaped the dialog', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    render(<Dialog onClose={() => {}} />);
    outside.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
    outside.remove();
  });

  it('skips honeypot fields, which are hidden or aria-hidden', () => {
    // The real reason the filter exists: FeedbackModal wraps its bot-trap input
    // in aria-hidden + hidden. Tab must never land a real user on it.
    render(
      <Dialog
        onClose={() => {}}
        extra={
          <div aria-hidden="true">
            <input aria-label="honeypot" tabIndex={-1} hidden />
          </div>
        }
      />
    );
    screen.getByText('second').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('skips disabled controls', () => {
    render(<Dialog onClose={() => {}} extra={<button disabled>disabled</button>} />);
    screen.getByText('second').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('ignores other keys', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('useModal background scroll lock', () => {
  it('locks scroll while open and restores the previous value on close', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = render(<Dialog onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = '';
  });
});
