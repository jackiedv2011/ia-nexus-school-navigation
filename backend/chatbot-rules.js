const teachers = require('./data/teachers.json');

const BELL_SCHEDULE = [
  { period: 1, label: '1st Period', start: '8:55 AM',  end: '9:45 AM',  startMin: 8*60+55,  endMin: 9*60+45  },
  { period: 2, label: '2nd Period', start: '9:49 AM',  end: '10:39 AM', startMin: 9*60+49,  endMin: 10*60+39 },
  { period: 3, label: '3rd Period', start: '10:43 AM', end: '11:33 AM', startMin: 10*60+43, endMin: 11*60+33 },
  { period: 4, label: '4th Period', start: '11:37 AM', end: '12:33 PM', startMin: 11*60+37, endMin: 12*60+33 },
  { period: 5, label: '5th Period', start: '12:37 PM', end: '1:33 PM',  startMin: 12*60+37, endMin: 13*60+33 },
  { period: 6, label: '6th Period', start: '1:37 PM',  end: '2:27 PM',  startMin: 13*60+37, endMin: 14*60+27 },
  { period: 7, label: '7th Period', start: '2:31 PM',  end: '3:21 PM',  startMin: 14*60+31, endMin: 15*60+21 },
  { period: 8, label: '8th Period', start: '3:25 PM',  end: '4:15 PM',  startMin: 15*60+25, endMin: 16*60+15 },
];

const ORDINALS = {
  'first': 1, '1st': 1, 'one': 1,
  'second': 2, '2nd': 2, 'two': 2,
  'third': 3, '3rd': 3, 'three': 3,
  'fourth': 4, '4th': 4, 'four': 4,
  'fifth': 5, '5th': 5, 'five': 5,
  'sixth': 6, '6th': 6, 'six': 6,
  'seventh': 7, '7th': 7, 'seven': 7,
  'eighth': 8, '8th': 8, 'eight': 8,
};

// The wings of the building, used ONLY to name where a room sits ("Room 253 —
// Floor 2 (CS & Cybersecurity Labs)"). These entries used to also carry
// hand-written turn-by-turn prose and a stairwell per wing, which made this a
// second, independently-maintained description of the building — and it had
// drifted: it named a Stair 2 landing on floor 1 that does not exist, and it
// disagreed with the actual shortest route on more than half of all
// cross-floor trips. Directions now come from findPath and the map is what the
// student is shown, so only the wing NAMES survive here.
//
// ORDER MATTERS: getRoomCluster takes the first range containing a room, so an
// overlapping wing must be listed BEFORE the wider one that contains it —
// floor 1's 155-163 sits inside 140-163, and 191-199 inside 181-199.
const ROOM_CLUSTERS = [

  // ── Floor 1 ──
  { floor: 1, lo: 191, hi: 199, wing: 'Visual Arts & Media Arts Wing' },
  { floor: 1, lo: 181, hi: 199, wing: 'Engineering & Manufacturing Wing' },
  { floor: 1, lo: 164, hi: 180, wing: 'Teacher Planning & Career Center Wing' },
  { floor: 1, lo: 155, hi: 163, wing: 'Locker Rooms & FCS Wing' },
  { floor: 1, lo: 140, hi: 163, wing: 'Nursing & EMS Labs' },
  { floor: 1, lo: 102, hi: 139, wing: 'Cafeteria & Main Hall' },

  // ── Floor 2 ──
  { floor: 2, lo: 281, hi: 284, wing: 'Northwest Wing' },
  { floor: 2, lo: 261, hi: 280, wing: 'North Corridor' },
  { floor: 2, lo: 285, hi: 295, wing: 'Northeast Wing' },
  { floor: 2, lo: 251, hi: 260, wing: 'CS & Cybersecurity Labs' },
  { floor: 2, lo: 241, hi: 250, wing: 'Health IT & Surgical Tech Wing' },
  { floor: 2, lo: 211, hi: 240, wing: 'Health Sciences & Center Wing' },

  // ── Floor 3 ──
  { floor: 3, lo: 381, hi: 384, wing: 'Northwest Wing' },
  { floor: 3, lo: 361, hi: 380, wing: 'North Corridor (Physics Labs)' },
  { floor: 3, lo: 385, hi: 395, wing: 'Northeast Wing' },
  { floor: 3, lo: 351, hi: 370, wing: 'Biology Labs' },
  { floor: 3, lo: 341, hi: 350, wing: 'Chemistry Labs' },
  { floor: 3, lo: 321, hi: 340, wing: 'Center Classrooms & Admin' },
  { floor: 3, lo: 301, hi: 320, wing: 'Admin & Media Center Wing' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFloor(room) {
  if (!room || typeof room !== 'string') return null;
  const r = room.trim().toLowerCase();
  if (r === 'planning' || r === 'lunch' || r === 'unavailable') return null;
  if (r.includes('counseling')) return 2;
  if (r.includes('clinic') || r === '111') return 1;
  if (r.includes('student life')) return 2;
  if (r.includes('displaced') || r.includes('work room')) return null;
  const n = parseInt(r);
  if (isNaN(n)) return null;
  if (n >= 100 && n < 200) return 1;
  if (n >= 200 && n < 300) return 2;
  if (n >= 300 && n < 400) return 3;
  if (n >= 400) return 'Auditorium';
  return null;
}

function getRoomCluster(roomNum) {
  const n = parseInt(roomNum);
  if (isNaN(n)) return null;
  return ROOM_CLUSTERS.find(c => n >= c.lo && n <= c.hi) || null;
}

// The rooms that actually exist, taken from the same source the Route Finder
// uses (backend/data/roomCoordinates.js) so the two can never disagree about
// what the building contains. A room may be listed on its own ("184") or as
// half of a shared-door pair ("281/283"), so both forms resolve.
const { ROOM_LABELS, findPath } = require('./data/roomCoordinates');
const EXISTING_ROOMS = new Set();
for (const labels of Object.values(ROOM_LABELS)) {
  for (const label of labels) {
    EXISTING_ROOMS.add(label.toLowerCase());
    for (const part of label.split('/')) EXISTING_ROOMS.add(part.trim().toLowerCase());
  }
}

function roomExists(room) {
  return EXISTING_ROOMS.has(String(room).trim().toLowerCase());
}

function getCurrentPeriod() {
  const now = new Date();
  const t = now.getHours() * 60 + now.getMinutes();
  return BELL_SCHEDULE.find(p => t >= p.startMin && t <= p.endMin) || null;
}

function findTeacher(q) {
  const lower = q.toLowerCase();
  for (const t of teachers) {
    for (const alias of t.aliases) {
      if (lower.includes(alias)) return t;
    }
  }
  for (const t of teachers) {
    for (const alias of t.aliases) {
      const words = alias.split(' ').filter(w => w.length > 3 && !['mrs.','mrs','mr.','mr','ms.','ms','dr.','dr'].includes(w));
      for (const word of words) {
        if (lower.includes(word)) return t;
      }
    }
  }
  return null;
}

function findAllTeachers(q) {
  const lower = q.toLowerCase();
  const found = [];
  const usedIds = new Set();
  for (const t of teachers) {
    let matchPos = Infinity;
    for (const alias of t.aliases) {
      const idx = lower.indexOf(alias);
      if (idx !== -1 && idx < matchPos) matchPos = idx;
    }
    if (matchPos < Infinity && !usedIds.has(t.id)) {
      found.push({ teacher: t, pos: matchPos });
      usedIds.add(t.id);
    }
  }
  for (const t of teachers) {
    if (usedIds.has(t.id)) continue;
    let matchPos = Infinity;
    for (const alias of t.aliases) {
      const words = alias.split(' ').filter(w => w.length > 3 && !['mrs.','mrs','mr.','mr','ms.','ms','dr.','dr'].includes(w));
      for (const word of words) {
        const idx = lower.indexOf(word);
        if (idx !== -1 && idx < matchPos) matchPos = idx;
      }
    }
    if (matchPos < Infinity) {
      found.push({ teacher: t, pos: matchPos });
      usedIds.add(t.id);
    }
  }
  found.sort((a, b) => a.pos - b.pos);
  return found.map(f => f.teacher);
}

function extractPeriod(q) {
  const lower = q.toLowerCase();
  for (const [word, num] of Object.entries(ORDINALS)) {
    const re = new RegExp(`\\b${word}\\b`);
    if (re.test(lower)) return num;
  }
  const m1 = lower.match(/period\s*(\d)/);
  if (m1) return parseInt(m1[1]);
  const m2 = lower.match(/(\d)\s*(?:st|nd|rd|th)?\s*period/);
  if (m2) return parseInt(m2[1]);
  return null;
}

function extractAllPeriods(q) {
  const lower = q.toLowerCase();
  const found = [];
  const usedNums = new Set();
  for (const [word, num] of Object.entries(ORDINALS)) {
    const re = new RegExp(`\\b${word}\\b`);
    const idx = lower.search(re);
    if (idx !== -1 && !usedNums.has(num)) {
      found.push({ num, pos: idx });
      usedNums.add(num);
    }
  }
  const re = /(\d)\s*(?:st|nd|rd|th)?\s*period|period\s*(\d)/g;
  let m;
  while ((m = re.exec(lower)) !== null) {
    const num = parseInt(m[1] || m[2]);
    if (num >= 1 && num <= 8 && !usedNums.has(num)) {
      found.push({ num, pos: m.index });
      usedNums.add(num);
    }
  }
  found.sort((a, b) => a.pos - b.pos);
  return found.map(f => f.num);
}

function extractRoom(q) {
  const m = q.match(/room\s*(\d{2,3}(?:\.\d+)?)/i);
  if (m) return m[1];
  const m2 = q.match(/\b(\d{3})\b/);
  if (m2) return m2[1];
  return null;
}

function formatRoom(raw) {
  if (!raw) return null;
  const r = raw.trim().toLowerCase();
  if (r === 'planning') return { display: 'Planning Period', special: 'planning' };
  if (r === 'lunch') return { display: 'Lunch', special: 'lunch' };
  if (r === 'unavailable') return { display: 'Not Available (data missing)', special: 'unavailable' };
  if (r.includes('planning')) return { display: raw.trim(), special: 'planning' };
  if (r.includes('lunch')) return { display: raw.trim(), special: 'lunch' };
  if (r.includes('displaced')) return { display: 'Temporarily Displaced — check with the main office', special: 'displaced' };
  if (r.includes('student life')) return { display: 'Student Life Office', special: null };
  if (r.includes('work room')) return { display: 'Teacher Work Room', special: null };
  if (r.includes('counseling')) return { display: 'Counseling Suite', special: null };
  if (r.includes('111')) return { display: 'Room 111 (Clinic)', special: null };
  return { display: `Room ${raw.trim()}`, special: null };
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function buildNavigation(fromRoom, toRoom, teacherName) {
  // The school's current floor plans list far fewer rooms than the wing ranges
  // cover. Those ranges are broad ("181-199 is the Engineering wing"), so
  // without this check the engine confidently walks a student to a room that no
  // longer exists. Refuse rather than invent directions.
  const missing = [fromRoom, toRoom].filter(r => !roomExists(r));
  if (missing.length) {
    const names = missing.map(r => `Room ${r}`).join(' and ');
    return {
      resolved: false,
      text: `🤔 I couldn't find ${names} on the current floor plans. `
          + `The school's room list changed recently, so it may have been renumbered or removed.\n\n`
          + `Try the **Route Finder** for the full list of rooms you can navigate to.`,
    };
  }

  const fromFloor = getFloor(String(parseInt(fromRoom)));
  const toFloor   = getFloor(String(parseInt(toRoom)));

  if (!fromFloor || fromFloor === 'Auditorium' || !toFloor || toFloor === 'Auditorium') {
    return {
      resolved: false,
      text: `🗺️ **Room ${fromRoom} → Room ${toRoom}**\n\n`
          + `One of those is a special location I don't have a mapped route for. `
          + `Please check with the front office.`,
    };
  }

  // Ask the router for the real walk. This is the same call the Route Finder
  // makes, so the answer here and the map the student then looks at can never
  // disagree — which they used to, on more than half of all cross-floor trips,
  // because this function generated its directions from a separate
  // hand-maintained table of wings and stairwells.
  const route = findPath(fromRoom, fromFloor, toRoom, toFloor);
  if (route.error) {
    return {
      resolved: false,
      text: `🗺️ **Room ${fromRoom} → Room ${toRoom}**\n\n`
          + `I couldn't find a walkable route between those two rooms. `
          + `If that seems wrong, please let the office know — it usually means the floor plan data needs updating.`,
    };
  }

  const fromCluster = getRoomCluster(parseInt(fromRoom));
  const toCluster   = getRoomCluster(parseInt(toRoom));

  const lines = [`🗺️ **Room ${fromRoom} → Room ${toRoom}**\n`];
  if (teacherName) lines.push(`📌 **${teacherName}** is in **Room ${toRoom}**\n`);

  lines.push(`**From:** Room ${fromRoom} — Floor ${fromFloor}${fromCluster ? ` (${fromCluster.wing})` : ''}`);
  lines.push(`**To:** Room ${toRoom} — Floor ${toFloor}${toCluster ? ` (${toCluster.wing})` : ''}`);

  if (route.sameFloor) {
    lines.push(`**Stairs:** none needed — both rooms are on Floor ${fromFloor}`);
  } else {
    const dir = toFloor > fromFloor ? 'up' : 'down';
    const flights = Math.abs(toFloor - fromFloor);
    lines.push(`**Stairwell:** Stair ${route.stairNum} — take it ${dir} `
             + `${flights} floor${flights > 1 ? 's' : ''}, Floor ${fromFloor} → Floor ${toFloor}`);
  }

  lines.push(`**Walk:** about ${route.minutes} min · roughly ${route.meters} m\n`);
  lines.push(`The map below traces the exact route, hallway by hallway.`);

  return { text: lines.join('\n') };
}

// ─── Response generators ──────────────────────────────────────────────────────

function teacherPeriodResponse(teacher, period) {
  const raw = teacher.schedule[String(period)];
  if (!raw) return `No schedule data available for ${teacher.name} during period ${period}.`;
  const fmt = formatRoom(raw);
  const periodLabel = BELL_SCHEDULE[period - 1]?.label || `Period ${period}`;
  const floor = getFloor(raw);
  if (fmt.special === 'planning') return `📋 During **${periodLabel}**, **${teacher.name}** has a planning period and is not with students.`;
  if (fmt.special === 'lunch') return `🍽️ During **${periodLabel}**, **${teacher.name}** is at lunch.`;
  if (fmt.special === 'unavailable') return `⚠️ Schedule data for **${teacher.name}** during **${periodLabel}** is not available in our system.`;
  if (fmt.special === 'displaced') return `⚠️ During **${periodLabel}**, **${teacher.name}** is temporarily displaced. Please check with the main office.`;
  let resp = `📍 During **${periodLabel}**, **${teacher.name}** is in **${fmt.display}**`;
  if (floor && floor !== 'Auditorium') resp += ` on **Floor ${floor}**`;
  if (floor === 'Auditorium') resp += ` in the **Auditorium**`;
  const cluster = floor ? getRoomCluster(parseInt(raw)) : null;
  if (cluster) resp += ` (${cluster.wing})`;
  resp += '.';
  if (teacher.note) resp += `\n\n*Note: ${teacher.note}*`;
  return resp;
}

function teacherFullSchedule(teacher) {
  let lines = [`📅 Here is **${teacher.name}'s** full schedule:\n`];
  for (let p = 1; p <= 8; p++) {
    const raw = teacher.schedule[String(p)];
    const label = BELL_SCHEDULE[p - 1].label;
    const fmt = formatRoom(raw || 'unavailable');
    const floor = getFloor(raw);
    let roomStr = fmt.display;
    if (floor && floor !== 'Auditorium' && fmt.special === null) roomStr += ` (Floor ${floor})`;
    if (floor === 'Auditorium' && fmt.special === null) roomStr += ' (Auditorium)';
    lines.push(`• **${label}** (${BELL_SCHEDULE[p-1].start}–${BELL_SCHEDULE[p-1].end}): ${roomStr}`);
  }
  if (teacher.note) lines.push(`\n*${teacher.note}*`);
  return lines.join('\n');
}

function roomOccupants(roomNum, period) {
  const matches = [];
  for (const t of teachers) {
    const raw = t.schedule[String(period)];
    if (!raw) continue;
    const n = parseInt(raw);
    if (String(n) === String(roomNum) || raw.trim() === roomNum) matches.push(t);
  }
  return matches;
}

function handleBellSchedule() {
  let resp = `🔔 **Bell Schedule**\n\n`;
  for (const p of BELL_SCHEDULE) resp += `• **${p.label}:** ${p.start} – ${p.end}\n`;
  return resp;
}

function handleHelp() {
  return `👋 **Welcome to IA Nexus!** Here's what I can do:\n\n` +
    `• **Find a teacher:** "Where is Mr. Hunter during 3rd period?"\n` +
    `• **Right now:** "Where is Ms. Regan right now?"\n` +
    `• **Full schedule:** "What is Singleton's full schedule?"\n` +
    `• **Room lookup:** "Who is in room 253 during 2nd period?"\n` +
    `• **Navigation:** "How do I get from room 188 to room 351?"\n` +
    `• **Bell schedule:** "Bell schedule"\n\n` +
    `All answers use teacher-submitted schedule data. If data is missing, I will tell you clearly.`;
}

// ─── Conversation context (follow-up resolution) ──────────────────────────────

// Scans prior USER turns (most recent first) for the last teacher name and
// period mentioned, so a context-free follow-up like "what about during 2nd
// period?" can still resolve to the teacher from the previous question.
function deriveContext(history) {
  const ctx = { teacher: null, period: null };
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (!turn || turn.role !== 'user' || typeof turn.content !== 'string') continue;
    if (!ctx.teacher) {
      const t = findTeacher(turn.content);
      if (t) ctx.teacher = t;
    }
    if (ctx.period === null) {
      const p = extractPeriod(turn.content.toLowerCase());
      if (p) ctx.period = p;
    }
    if (ctx.teacher && ctx.period !== null) break;
  }
  return ctx;
}

// Resolves the teacher for THIS message, falling back to the last-mentioned
// teacher only when the message clearly continues that thread (it names a
// period but no teacher of its own) — never when it's an unrelated question.
function resolveTeacher(q, lower, context) {
  return findTeacher(q) || (extractPeriod(lower) !== null ? context.teacher : null);
}

// ─── Main processor (synchronous) ────────────────────────────────────────────

function processMessage(message, history = []) {
  const q = message.trim();
  const lower = q.toLowerCase();
  const context = deriveContext(history);

  if (/^(hi|hello|hey|good morning|good afternoon|yo|sup)\b/.test(lower))
    return { text: `Hello! 👋 I'm **IA Nexus**, your school navigation assistant. Ask me where a teacher is, how to get somewhere, or check the bell schedule. Type **"help"** to see everything I can do.` };

  if (/\bhelp\b/.test(lower) || /what can you do/.test(lower))
    return { text: handleHelp() };

  if (/bell schedule|class schedule|period times/.test(lower) || lower === 'schedule')
    return { text: handleBellSchedule() };

  if (/what time is (it |)(\d|first|second|third|fourth|fifth|sixth|seventh|eighth)/.test(lower)) {
    const period = extractPeriod(lower);
    if (period) {
      const p = BELL_SCHEDULE[period - 1];
      return { text: `🔔 **${p.label}** runs from **${p.start}** to **${p.end}**.` };
    }
    return { text: handleBellSchedule() };
  }

  if (/what period is it|current period|which period/.test(lower)) {
    const cp = getCurrentPeriod();
    if (cp) return { text: `⏰ It is currently **${cp.label}** (${cp.start} – ${cp.end}).` };
    return { text: `⏰ School is not currently in session (no active period right now).` };
  }

  if (/what floor|which floor/.test(lower)) {
    const room = extractRoom(q);
    if (room) {
      const floor = getFloor(room);
      const cluster = getRoomCluster(parseInt(room));
      if (floor) {
        let resp = `🏢 **Room ${room}** is on **${floor === 'Auditorium' ? 'the Auditorium level' : 'Floor ' + floor}**`;
        if (cluster) resp += ` — ${cluster.wing}`;
        resp += '.';
        return { text: resp };
      }
      return { text: `I couldn't determine the floor for Room ${room}.` };
    }
    return { text: `Please specify a room number — e.g., "What floor is room 351 on?"` };
  }

  // Navigation
  const isNav = /how (do i|can i|to) get|directions?|navigate|from room|fastest way|i am (on|in)|get to room|go from|walk from|from .+ to .+/.test(lower);
  if (isNav) {
    const fromMatch = lower.match(/(?:from|i(?:'m| am)(?: in| standing in)?)(?: room)?\s*(\d{2,3})/i) ||
                      lower.match(/(?:starting in|starting from)(?: room)?\s*(\d{2,3})/i);
    const toMatch   = lower.match(/(?:to|reach|find|get to)(?: room)?\s*(\d{3})/i);
    const fromRoom  = fromMatch ? fromMatch[1] : null;

    const allTeachers = findAllTeachers(q);
    if (allTeachers.length >= 2) {
      const splitIdx = lower.indexOf(' to ');
      const leftHalf  = splitIdx !== -1 ? lower.slice(0, splitIdx)  : lower;
      const rightHalf = splitIdx !== -1 ? lower.slice(splitIdx + 4) : lower;
      const fromTeacher = allTeachers[0];
      const toTeacher   = allTeachers[1];
      const leftPeriods  = extractAllPeriods(leftHalf);
      const rightPeriods = extractAllPeriods(rightHalf);
      const allPeriods   = extractAllPeriods(lower);
      const fromPeriod = leftPeriods[0]  || allPeriods[0] || getCurrentPeriod()?.period;
      const toPeriod   = rightPeriods[0] || allPeriods[1] || allPeriods[0] || getCurrentPeriod()?.period;

      if (!fromPeriod || !toPeriod)
        return { text: `I found both **${fromTeacher.name}** and **${toTeacher.name}**! Please specify which periods you're going from/to.` };

      const fromRaw = fromTeacher.schedule[String(fromPeriod)];
      const toRaw   = toTeacher.schedule[String(toPeriod)];
      const fromFmt = formatRoom(fromRaw || 'unavailable');
      const toFmt   = formatRoom(toRaw   || 'unavailable');
      const fromPeriodLabel = BELL_SCHEDULE[fromPeriod - 1]?.label || `Period ${fromPeriod}`;
      const toPeriodLabel   = BELL_SCHEDULE[toPeriod   - 1]?.label || `Period ${toPeriod}`;

      if (fromFmt.special) return { text: `**${fromTeacher.name}** does not have a regular classroom during **${fromPeriodLabel}** (${fromFmt.display}).` };
      if (toFmt.special)   return { text: `**${toTeacher.name}** does not have a regular classroom during **${toPeriodLabel}** (${toFmt.display}).` };

      const fromRoomNum = String(parseInt(fromRaw));
      const toRoomNum   = String(parseInt(toRaw));
      let response = `📍 **${fromTeacher.name}** is in **Room ${fromRoomNum}** during **${fromPeriodLabel}**\n`;
      response    += `📍 **${toTeacher.name}** is in **Room ${toRoomNum}** during **${toPeriodLabel}**\n\n`;
      const navResult = buildNavigation(fromRoomNum, toRoomNum, toTeacher.name);
      response += navResult.text;
      return { text: response };
    }

    const teacher = resolveTeacher(q, lower, context);
    if (teacher) {
      const period = extractPeriod(lower) || getCurrentPeriod()?.period;
      if (period) {
        const raw = teacher.schedule[String(period)];
        const fmt = formatRoom(raw || 'unavailable');
        if (fmt.special) return { text: `**${teacher.name}** is not in a classroom during that time (${fmt.display}).` };
        const toRoom = String(parseInt(raw));
        if (fromRoom) return buildNavigation(fromRoom, toRoom, teacher.name);
        return { text: `To navigate to **${teacher.name}** (Room ${toRoom}), tell me which room you're starting from.\n\n${teacherPeriodResponse(teacher, period)}` };
      }
      return { text: `To navigate to **${teacher.name}**, which period are you asking about?` };
    }

    const toRoom = toMatch ? toMatch[1] : (fromRoom ? null : extractRoom(q));
    if (toRoom && fromRoom) return buildNavigation(fromRoom, toRoom, null);
    if (toRoom && !fromRoom) return { text: `Which room are you starting from? E.g., "How do I get **from room 253** to room ${toRoom}?"` };
    return { text: `Please specify both a starting room and destination.\nE.g., "How do I get from room 253 to room 351?"` };
  }

  // Room occupant lookup
  if (/who is in|who('s| is) in|occupant|teacher in room/.test(lower)) {
    const room = extractRoom(q);
    const period = extractPeriod(lower);
    if (room && period) {
      const occupants = roomOccupants(room, period);
      if (occupants.length === 0) return { text: `No teacher in our system is listed in Room ${room} during ${BELL_SCHEDULE[period-1].label}.` };
      return { text: `📍 In **Room ${room}** during **${BELL_SCHEDULE[period-1].label}**: ${occupants.map(t => `**${t.name}**`).join(', ')}.` };
    }
    if (room) return { text: `Which period? E.g., "Who is in room ${room} during 3rd period?"` };
    return { text: `Please specify a room number and period.` };
  }

  // Teacher lookup
  const teacher = resolveTeacher(q, lower, context);
  if (teacher) {
    const period = extractPeriod(lower);
    const wantsNow = /right now|currently|now|today|at the moment/.test(lower);
    if (wantsNow) {
      const cp = getCurrentPeriod();
      if (cp) return { text: teacherPeriodResponse(teacher, cp.period) };
      return { text: `School is not in session right now. Here is **${teacher.name}'s** full schedule:\n\n${teacherFullSchedule(teacher)}` };
    }
    if (/full schedule|whole day|all period|all day|schedule/.test(lower) && !period)
      return { text: teacherFullSchedule(teacher) };
    if (period) return { text: teacherPeriodResponse(teacher, period) };
    return { text: `I found **${teacher.name}** in the system! Which period are you looking for?\n\nTry: *"Where is ${teacher.name} during 3rd period?"*` };
  }

  // resolved:false marks the catch-all "I didn't understand" reply so the
  // analytics log can surface exactly the questions the rule engine couldn't
  // answer — the ones that most need new content added.
  return { resolved: false, text: `🤔 I didn't quite understand that. Try:\n• *"Where is Mrs. Jones during 5th period?"*\n• *"How do I get from room 253 to room 351?"*\n• *"Bell schedule"*\n• *"Help"* for all options.` };
}

module.exports = { processMessage };
