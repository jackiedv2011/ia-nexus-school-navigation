// Basic first-pass profanity flagging for the admin moderation dashboard.
// Deliberately conservative and NOT exhaustive — it's a signal for staff to
// review, not a hard content filter. Messages are never blocked or altered,
// only flagged. Matching is whole-word and case-insensitive so it doesn't
// trip on substrings (e.g. "assessment" does not match "ass").
const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy', 'cunt',
  'faggot', 'slut', 'whore', 'douche', 'dumbass', 'jackass', 'nigger', 'nigga',
  'retard', 'retarded', 'skank', 'twat', 'wanker', 'motherfucker', 'fucker',
];

const PATTERNS = BAD_WORDS.map(word => new RegExp(`\\b${word}\\b`, 'i'));

// Returns the list of matched terms found in `text` (empty array if none).
function findBadWords(text) {
  if (typeof text !== 'string' || !text) return [];
  const found = [];
  for (let i = 0; i < PATTERNS.length; i++) {
    if (PATTERNS[i].test(text)) found.push(BAD_WORDS[i]);
  }
  return found;
}

module.exports = { findBadWords };
