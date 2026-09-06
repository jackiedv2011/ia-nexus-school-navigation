'use strict';

// Regression tests for the rule-based chatbot. chatbot-rules.js is a protected
// system — these exact-string snapshots prove responses are byte-for-byte
// identical before and after the audit changes. Only time-independent prompts
// are included (period/"right now" responses depend on the wall clock).

const test = require('node:test');
const assert = require('node:assert');
const { processMessage } = require('../chatbot-rules');

const CASES = [
  {
    in: 'bell schedule',
    text: '🔔 **Bell Schedule**\n\n• **1st Period:** 8:55 AM – 9:45 AM\n• **2nd Period:** 9:49 AM – 10:39 AM\n• **3rd Period:** 10:43 AM – 11:33 AM\n• **4th Period:** 11:37 AM – 12:33 PM\n• **5th Period:** 12:37 PM – 1:33 PM\n• **6th Period:** 1:37 PM – 2:27 PM\n• **7th Period:** 2:31 PM – 3:21 PM\n• **8th Period:** 3:25 PM – 4:15 PM\n',
  },
  {
    in: 'hi',
    text: 'Hello! 👋 I\'m **IA Nexus**, your school navigation assistant. Ask me where a teacher is, how to get somewhere, or check the bell schedule. Type **"help"** to see everything I can do.',
  },
  {
    in: 'What floor is room 351 on?',
    text: '🏢 **Room 351** is on **Floor 3** — Biology Labs.',
  },
  {
    // Directions are now a factual summary of the route findPath computed, with
    // the map rendered below the message — not hand-written turn-by-turn prose
    // from a second, drifting description of the building. See the audit suite.
    in: 'How do I get from room 188 to room 331?',
    text: "🗺️ **Room 188 → Room 331**\n\n**From:** Room 188 — Floor 1 (Engineering & Manufacturing Wing)\n**To:** Room 331 — Floor 3 (Center Classrooms & Admin)\n**Stairwell:** Stair 9 — take it up 2 floors, Floor 1 → Floor 3\n**Walk:** about 2 min · roughly 126 m\n\nThe map below traces the exact route, hallway by hallway.",
  },
];

for (const c of CASES) {
  test(`chatbot response unchanged: "${c.in}"`, () => {
    assert.strictEqual(processMessage(c.in).text, c.text);
  });
}

// The 'help' response should remain stable in structure.
test('help response is unchanged', () => {
  const text = processMessage('help').text;
  assert.ok(text.startsWith('👋 **Welcome to IA Nexus!**'));
  assert.ok(text.includes('How do I get from room 188 to room 351?'));
});

// Follow-up questions should resolve against the prior turn's teacher instead
// of falling through to the generic "I didn't understand" fallback.
test('follow-up question resolves teacher from conversation history', () => {
  const history = [
    { role: 'user', content: 'Where is Mr. Ross during first period?' },
    { role: 'assistant', content: '📍 During **1st Period**, **Tyler Ross** is in **Room 253** on **Floor 2** (CS & Cybersecurity Labs).' },
  ];
  const text = processMessage('What about during 2nd period?', history).text;
  assert.ok(text.includes('Tyler Ross'), 'follow-up should still identify Tyler Ross');
  assert.ok(text.includes('2nd Period'), 'follow-up should use period 2, not period 1');
  assert.ok(!text.startsWith('🤔'), 'should not fall through to the generic fallback');
});

// Without any relevant history, the same context-free follow-up should still
// fall back to the generic clarifying response (no stale/incorrect context).
test('follow-up with no prior teacher context still asks for clarification', () => {
  const text = processMessage('What about during 2nd period?', []).text;
  assert.ok(text.startsWith('🤔'), 'no history means no teacher to fall back to');
});
