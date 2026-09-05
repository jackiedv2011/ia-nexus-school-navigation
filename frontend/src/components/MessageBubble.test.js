import { describe, it, expect } from 'vitest';
import { detectRoute, formatText, formatTime } from './MessageBubble';

// formatText writes into dangerouslySetInnerHTML, so this is the app's one
// genuine XSS surface. These tests exist to keep it closed.
describe('formatText escaping', () => {
  it('escapes HTML in assistant output before applying markdown', () => {
    expect(formatText('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes an image onerror payload', () => {
    const out = formatText('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('escapes ampersands first so entities cannot be smuggled through', () => {
    // If & were escaped last, "&lt;script&gt;" would decode to a live tag.
    expect(formatText('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('does not let markdown reintroduce a tag', () => {
    const out = formatText('**<b>bold</b>**');
    expect(out).toBe('<strong>&lt;b&gt;bold&lt;/b&gt;</strong>');
  });

  it('still renders the markdown the chatbot actually emits', () => {
    expect(formatText('**Room 331**')).toBe('<strong>Room 331</strong>');
    expect(formatText('*note*')).toBe('<em>note</em>');
    expect(formatText('`code`')).toBe('<code>code</code>');
  });

  it('turns newlines into line breaks', () => {
    expect(formatText('a\nb')).toBe('a<br/>b');
  });

  it('handles unicode, emoji and RTL text without mangling them', () => {
    expect(formatText('🗺️ مرحبا')).toBe('🗺️ مرحبا');
  });

  it('leaves an unmatched marker alone rather than emitting a stray tag', () => {
    expect(formatText('**unclosed')).toBe('**unclosed');
  });

  it('does not hang or throw on a very long line', () => {
    const long = 'x'.repeat(50000);
    expect(formatText(long)).toHaveLength(50000);
  });
});

describe('detectRoute', () => {
  it('finds a route in a directions-style reply, with both floors', () => {
    expect(detectRoute('🗺️ **Room 188 → Room 331**'))
      .toEqual({ from: '188', to: '331', fromFloor: 1, toFloor: 3 });
  });

  it('accepts the plain-text arrow forms too', () => {
    const expected = { from: '188', to: '331', fromFloor: 1, toFloor: 3 };
    expect(detectRoute('Room 188 -> Room 331')).toEqual(expected);
    expect(detectRoute('Room 188 to Room 331')).toEqual(expected);
  });

  // The floors come straight from the room number, and the map needs them to
  // be right — a wrong floor is a request for a route that does not exist.
  it('derives the floor from the room number', () => {
    expect(detectRoute('Room 253 → Room 351')).toMatchObject({ fromFloor: 2, toFloor: 3 });
    expect(detectRoute('Room 331 → Room 359')).toMatchObject({ fromFloor: 3, toFloor: 3 });
    expect(detectRoute('Room 116 → Room 192')).toMatchObject({ fromFloor: 1, toFloor: 1 });
  });

  it('returns null when the two rooms are the same', () => {
    expect(detectRoute('Room 188 → Room 188')).toBe(null);
  });

  it('returns null for a room on a floor the app does not have', () => {
    expect(detectRoute('Room 488 → Room 331')).toBe(null);
    expect(detectRoute('Room 188 → Room 431')).toBe(null);
  });

  it('returns null when there is no route in the text', () => {
    expect(detectRoute('The bell schedule is 8:55 to 4:15.')).toBe(null);
    expect(detectRoute('')).toBe(null);
  });

  it('does not mistake a bell-schedule time range for a route', () => {
    expect(detectRoute('1st Period: 8:55 AM – 9:45 AM')).toBe(null);
  });
});

describe('formatTime', () => {
  it('formats a valid timestamp', () => {
    expect(formatTime('2026-09-09T14:30:00Z')).toMatch(/\d{1,2}:\d{2}/);
  });

  it('returns an empty string rather than "Invalid Date"', () => {
    expect(formatTime('not a date')).toBe('');
    expect(formatTime('')).toBe('');
    expect(formatTime(null)).toBe('');
    expect(formatTime(undefined)).toBe('');
  });
});
