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
    in: 'How do I get from room 188 to room 331?',
    text: '🗺️ **Directions: Room 188 → Room 331**\n\n**From:** Room 188 — Floor 1 (Engineering & Manufacturing Wing)\n**To:** Room 331 — Floor 3 (Center Classrooms & Admin)\n**Stairwell:** Stair 6.1 → Stair 6.3\n\n---\n\n**Turn-by-turn directions:**\n\n1. Exit your room.\n2. Turn LEFT and walk straight through the Engineering Wing corridor.\n3. Continue past the lab rooms until you reach the end of the hallway.\n4. You will reach **Stair 6.1** at the end of the corridor. Enter the stairwell.\n\n5. Go **▲ UP 2 floors** to **Floor 3**.\n\n6. Exit **Stair 6.3** and walk toward higher-numbered rooms until you reach Room 331.\n7. **Room 331** will be labeled on the door — double-check the number as you pass each room.',
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
