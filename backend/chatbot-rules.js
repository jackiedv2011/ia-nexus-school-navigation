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

const ROOM_CLUSTERS = [

  // ══════════════════════════════════════════════════════
  //  FLOOR 1
  // ══════════════════════════════════════════════════════

  {
    floor: 1, lo: 181, hi: 199, stair: 6, wing: 'Engineering & Manufacturing Wing',
    exitSteps: [
      'Exit your room.',
      'Turn LEFT and walk straight through the Engineering Wing corridor.',
      'Continue past the lab rooms until you reach the end of the hallway.',
      'You will reach **Stair 6.1** at the end of the corridor. Enter the stairwell.',
    ],
    arrivalFromStair: {
      6: 'Exit **Stair 6.1** and turn RIGHT. Walk straight into the Engineering Wing corridor. Your destination room will be on your left and right — check the number on each door as you walk.',
    },
  },

  {
    floor: 1, lo: 164, hi: 180, stair: 7, wing: 'Teacher Planning & Career Center Wing',
    exitSteps: [
      'Exit your room.',
      'Walk toward the center of the building.',
      'Continue straight until you reach **Stair 7.1** in the center hallway. Enter the stairwell.',
    ],
    arrivalFromStair: {
      7: 'Exit **Stair 7.1** and walk into the Teacher Planning and Career Center corridor. Your destination room will be on your left or right — check the number on each door.',
    },
  },

  {
    floor: 1, lo: 140, hi: 163, stair: 2, wing: 'Nursing & EMS Labs',
    exitSteps: [
      'Exit your room.',
      'Walk toward the center of the building.',
      'You will reach **Stair 2.1** on your left. Enter the stairwell.',
    ],
    arrivalFromStair: {
      2: 'Exit **Stair 2.1** and turn into the Nursing and EMS Lab corridor. Your destination room will be on your left or right — check the number on each door.',
      4: 'Exit **Stair 4.1** and turn RIGHT. Walk straight — the Nursing and EMS Lab corridor will be ahead. Turn LEFT and walk forward. Your destination room will be on your left or right.',
    },
  },

  {
    floor: 1, lo: 102, hi: 139, stair: 7, wing: 'Cafeteria & Main Hall',
    exitSteps: [
      'Exit your room.',
      'Walk toward the center of the building, heading for the main hallway.',
      'Continue until you reach **Stair 7.1** in the center of the building. Enter the stairwell.',
    ],
    arrivalFromStair: {
      7: 'Exit **Stair 7.1** and walk into the main hall. Your destination room will be along this corridor — check both sides.',
    },
  },

  {
    floor: 1, lo: 155, hi: 163, stair: 5, wing: 'Locker Rooms & FCS Wing',
    exitSteps: [
      'Exit your room.',
      'Walk toward the right side of the building.',
      'Continue until you reach **Stair 5.1** on your right. Enter the stairwell.',
    ],
    arrivalFromStair: {
      5: 'Exit **Stair 5.1** and walk into the corridor. Your destination room will be on your left or right — check the number on each door.',
    },
  },

  {
    floor: 1, lo: 191, hi: 199, stair: 8, wing: 'Visual Arts & Media Arts Wing',
    exitSteps: [
      'Exit your room.',
      'Walk to the right toward the end of the hallway.',
      'You will reach **Stair 8.1** at the end of the corridor. Enter the stairwell.',
    ],
    arrivalFromStair: {
      8: 'Exit **Stair 8.1** and walk into the Visual Arts and Media Arts corridor. Your destination room will be on your left or right — check the number on each door.',
    },
  },

  // ══════════════════════════════════════════════════════
  //  FLOOR 2
  // ══════════════════════════════════════════════════════

  {
    floor: 2, lo: 281, hi: 284, stair: 6, wing: 'Northwest Wing',
    exitSteps: [
      'Exit your room.',
      'Turn LEFT and walk straight to the end of the north hallway.',
      'You will reach **Stair 6.2** at the end of the corridor. Enter the stairwell.',
    ],
    arrivalFromStair: {
      6: 'Exit **Stair 6.2** and turn RIGHT. Walk straight east along the north hallway. Rooms 281–284 are on your left and right — check each door for your room number.',
      7: 'Exit **Stair 7.2** and turn LEFT. Walk west along the north hallway all the way to the end. Rooms 281–284 are at the far west end on your left and right.',
      8: 'Exit **Stair 8.2** and turn LEFT. Walk the full length of the north hallway west to the very end. Rooms 281–284 are on your left and right.',
    },
    sameFloorTo: {
      261: (r) => ['Exit your room.', 'Turn RIGHT and walk east along the north hallway.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      285: (r) => ['Exit your room.', 'Turn RIGHT and walk east all the way along the north hallway.', `**Room ${r}** will be on your left or right near the far east end — check each door for the number.`],
      251: (r) => ['Exit your room.', 'Turn RIGHT and walk along the north hallway.', 'Follow the hallway as it turns south toward the CS Lab wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      241: (r) => ['Exit your room.', 'Turn RIGHT and walk east along the north hallway.', 'Continue south through the corridor toward the Health IT wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      211: (r) => ['Exit your room.', 'Turn RIGHT and walk east along the north hallway.', 'Continue south through the corridor toward the center of the building.', `**Room ${r}** will be on your left or right — check each door for the number.`],
    },
  },

  {
    floor: 2, lo: 261, hi: 280, stair: 7, wing: 'North Corridor',
    exitSteps: [
      'Exit your room.',
      'Walk out into the north hallway.',
      'Turn toward the center of the hallway and head for **Stair 7.2**. Enter the stairwell.',
    ],
    arrivalFromStair: {
      7: 'Exit **Stair 7.2** and step into the north hallway. Rooms 261–280 are on your left and right along this corridor — check each door for your room number.',
      6: 'Exit **Stair 6.2** and turn RIGHT. Walk east along the north hallway. Rooms 261–280 are on your left and right.',
      8: 'Exit **Stair 8.2** and turn LEFT. Walk west along the north hallway. Rooms 261–280 are on your left and right.',
    },
    sameFloorTo: {
      281: (r) => ['Exit your room.', 'Turn LEFT and walk west along the north hallway all the way to the end.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      285: (r) => ['Exit your room.', 'Turn RIGHT and walk east along the north hallway all the way to the end.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      251: (r) => ['Exit your room.', 'Walk south along the corridor toward the CS Lab wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      241: (r) => ['Exit your room.', 'Walk south through the corridor toward the Health IT wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      211: (r) => ['Exit your room.', 'Walk south toward the center of the building.', `**Room ${r}** will be on your left or right — check each door for the number.`],
    },
  },

  {
    floor: 2, lo: 285, hi: 295, stair: 8, wing: 'Northeast Wing',
    exitSteps: [
      'Exit your room.',
      'Turn RIGHT and walk to the end of the north hallway.',
      'You will reach **Stair 8.2** at the far east end. Enter the stairwell.',
    ],
    arrivalFromStair: {
      8: 'Exit **Stair 8.2** and turn LEFT. Walk into the northeast corridor. Rooms 285–295 are on your left and right — check each door for your room number.',
      7: 'Exit **Stair 7.2** and turn RIGHT. Walk east along the north hallway to the very end. Rooms 285–295 are on your left and right.',
    },
    sameFloorTo: {
      261: (r) => ['Exit your room.', 'Turn LEFT and walk west along the north hallway.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      281: (r) => ['Exit your room.', 'Turn LEFT and walk west along the north hallway all the way to the far end.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      251: (r) => ['Exit your room.', 'Turn LEFT and walk west along the north hallway.', 'Follow the hallway south into the CS Lab wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      241: (r) => ['Exit your room.', 'Turn LEFT and walk west along the corridor.', 'Continue south toward the Health IT wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      211: (r) => ['Exit your room.', 'Turn LEFT and walk west through the building toward the center.', `**Room ${r}** will be on your left or right — check each door for the number.`],
    },
  },

  {
    floor: 2, lo: 251, hi: 260, stair: 5, wing: 'CS & Cybersecurity Labs',
    exitSteps: [
      'Exit your room.',
      'Turn RIGHT and walk straight to the end of the hallway.',
      'You will reach **Stair 5.2** on your right. Enter the stairwell.',
    ],
    arrivalFromStair: {
      5: 'Exit **Stair 5.2** and turn LEFT. Walk straight up the hallway. Rooms 251–260 are on your left and right — check each door for your room number.',
      3: 'Exit **Stair 3.2** and turn RIGHT. Walk east into the CS Lab corridor. Walk forward — rooms 251–260 are on your left and right.',
    },
    sameFloorTo: {
      241: (r) => ['Exit your room.', 'Turn LEFT and walk along the hallway toward the Health IT wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      211: (r) => ['Exit your room.', 'Turn LEFT and walk west along the corridor toward the center of the building.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      261: (r) => ['Exit your room.', 'Walk out to the main hallway and head north.', `**Room ${r}** will be on your left or right along the north corridor — check each door for the number.`],
      281: (r) => ['Exit your room.', 'Walk out to the main hallway and head north.', 'Turn LEFT and walk west to the far end of the north hallway.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      285: (r) => ['Exit your room.', 'Walk out to the main hallway and head north.', 'Turn RIGHT and walk east to the far end of the north hallway.', `**Room ${r}** will be on your left or right — check each door for the number.`],
    },
  },

  {
    floor: 2, lo: 241, hi: 250, stair: 4, wing: 'Health IT & Surgical Tech Wing',
    exitSteps: [
      'Exit your room.',
      'Turn LEFT and walk straight to the end of the hallway.',
      'You will reach **Stair 4.2** on your right. Enter the stairwell.',
    ],
    arrivalFromStair: {
      4: 'Exit **Stair 4.2** and turn LEFT. Walk straight into the Health IT and Surgical Tech corridor. Rooms 241–250 are on your left and right — check each door for your room number.',
      2: 'Exit **Stair 2.2** and turn RIGHT. Walk toward the Health IT corridor. Turn LEFT and walk forward — rooms 241–250 are on your left and right.',
    },
    sameFloorTo: {
      251: (r) => ['Exit your room.', 'Turn RIGHT and walk east along the corridor toward the CS Lab wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      211: (r) => ['Exit your room.', 'Turn LEFT and walk west toward the center of the building.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      261: (r) => ['Exit your room.', 'Walk out to the main hallway and head north.', `**Room ${r}** will be on your left or right along the north corridor — check each door for the number.`],
      281: (r) => ['Exit your room.', 'Walk north to the north hallway.', 'Turn LEFT and walk west to the far end.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      285: (r) => ['Exit your room.', 'Walk north to the north hallway.', 'Turn RIGHT and walk east to the far end.', `**Room ${r}** will be on your left or right — check each door for the number.`],
    },
  },

  {
    floor: 2, lo: 211, hi: 240, stair: 2, wing: 'Health Sciences & Center Wing',
    exitSteps: [
      'Exit your room.',
      'Walk toward the center of the building.',
      'You will reach **Stair 2.2** near the center corridor. Enter the stairwell.',
    ],
    arrivalFromStair: {
      2: 'Exit **Stair 2.2** and walk into the Health Sciences corridor. Rooms 211–240 are on your left and right — check each door for your room number.',
      3: 'Exit **Stair 3.2** and turn LEFT. Walk along the corridor. Rooms 211–240 are on your left and right.',
      4: 'Exit **Stair 4.2** and turn RIGHT. Walk toward the center corridor. Rooms 211–240 are on your left and right.',
    },
    sameFloorTo: {
      241: (r) => ['Exit your room.', 'Turn RIGHT and walk east toward the Health IT wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      251: (r) => ['Exit your room.', 'Turn RIGHT and walk east through the corridor toward the CS Lab wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      261: (r) => ['Exit your room.', 'Walk north to the north hallway.', `**Room ${r}** will be on your left or right along the corridor — check each door for the number.`],
      281: (r) => ['Exit your room.', 'Walk north to the north hallway.', 'Turn LEFT and walk west all the way to the far end.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      285: (r) => ['Exit your room.', 'Walk north to the north hallway.', 'Turn RIGHT and walk east all the way to the far end.', `**Room ${r}** will be on your left or right — check each door for the number.`],
    },
  },

  // ══════════════════════════════════════════════════════
  //  FLOOR 3
  // ══════════════════════════════════════════════════════

  {
    floor: 3, lo: 381, hi: 384, stair: 6, wing: 'Northwest Wing',
    exitSteps: [
      'Exit your room.',
      'Turn LEFT and walk straight to the end of the north hallway.',
      'You will reach **Stair 6.3** at the end of the corridor. Enter the stairwell.',
    ],
    arrivalFromStair: {
      6: 'Exit **Stair 6.3** and turn RIGHT. Walk east along the north hallway. Rooms 381–384 are on your left and right — check each door for your room number.',
      7: 'Exit **Stair 7.3** and turn LEFT. Walk west along the north hallway to the end. Rooms 381–384 are on your left and right.',
    },
  },

  {
    floor: 3, lo: 361, hi: 380, stair: 7, wing: 'North Corridor (Physics Labs)',
    exitSteps: [
      'Exit your room.',
      'Walk out into the north hallway.',
      'Head toward the center of the hallway and find **Stair 7.3**. Enter the stairwell.',
    ],
    arrivalFromStair: {
      7: 'Exit **Stair 7.3** and step into the north hallway. Rooms 361–380 are on your left and right along this corridor — check each door for your room number.',
      6: 'Exit **Stair 6.3** and turn RIGHT. Walk east along the north hallway. Rooms 361–380 are on your left and right.',
      8: 'Exit **Stair 8.3** and turn LEFT. Walk west along the north hallway. Rooms 361–380 are on your left and right.',
    },
  },

  {
    floor: 3, lo: 385, hi: 395, stair: 8, wing: 'Northeast Wing',
    exitSteps: [
      'Exit your room.',
      'Turn RIGHT and walk to the end of the north hallway.',
      'You will reach **Stair 8.3** at the far east end. Enter the stairwell.',
    ],
    arrivalFromStair: {
      8: 'Exit **Stair 8.3** and turn LEFT. Walk into the northeast corridor. Rooms 385–395 are on your left and right — check each door for your room number.',
      7: 'Exit **Stair 7.3** and turn RIGHT. Walk east along the north hallway to the very end. Rooms 385–395 are on your left and right.',
    },
  },

  {
    floor: 3, lo: 351, hi: 370, stair: 5, wing: 'Biology Labs',
    exitSteps: [
      'Exit your room.',
      'Turn RIGHT and walk to the end of the Biology Lab corridor.',
      'At the end of the corridor, turn RIGHT.',
      'Walk straight — you will reach **Stair 5.3** on your right. Enter the stairwell.',
    ],
    arrivalFromStair: {
      5: 'Exit **Stair 5.3**. Turn LEFT and walk straight down the hallway to the intersection. At the intersection, make a LEFT turn. Walk forward — rooms 351–368 are on your left and right. Check each door for your room number.',
      3: 'Exit **Stair 3.3** and turn RIGHT. Walk a short distance and turn RIGHT into the Biology Lab corridor. Walk forward — rooms 351–368 are on your left and right.',
      2: 'Exit **Stair 2.3** and turn RIGHT. Walk east along the corridor. At the Biology Lab corridor, turn RIGHT. Walk forward — rooms 351–368 are on your left and right.',
    },
    sameFloorTo: {
      321: (r) => ['Exit your room.', 'Walk to the end of the Biology Lab wing.', 'Turn LEFT at the end of the wing.', 'Walk along the main corridor.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      341: (r) => ['Exit your room.', 'Walk to the end of the Biology Lab wing.', 'Turn LEFT at the end of the wing.', 'Walk along the main hallway and look for the Chemistry Lab wing on your LEFT.', 'Turn LEFT into the Chemistry Lab wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      301: (r) => ['Exit your room.', 'Walk to the end of the Biology Lab wing.', 'Turn LEFT at the end of the wing.', 'Walk along the main corridor all the way toward the center of the floor.', 'Continue past the classrooms toward the Media Center area.', `**Room ${r}** will be on your left or right near the Media Center — check each door for the number.`],
      361: (r) => ['Exit your room.', 'Walk to the end of the Biology Lab wing.', 'Turn RIGHT at the end of the wing.', 'Walk along the north hallway.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      381: (r) => ['Exit your room.', 'Walk to the end of the Biology Lab wing.', 'Turn RIGHT at the end of the wing.', 'Walk along the north hallway all the way to the far west end.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      385: (r) => ['Exit your room.', 'Walk to the end of the Biology Lab wing.', 'Turn RIGHT at the end of the wing.', 'Walk along the north hallway all the way to the far east end.', `**Room ${r}** will be on your left or right — check each door for the number.`],
    },
  },

  {
    floor: 3, lo: 341, hi: 350, stair: 2, wing: 'Chemistry Labs',
    exitSteps: [
      'Exit your room.',
      'Walk to the end of the Chemistry Lab corridor.',
      'Turn RIGHT and walk along the hallway.',
      'You will reach **Stair 2.3** on your left. Enter the stairwell.',
    ],
    arrivalFromStair: {
      2: 'Exit **Stair 2.3** and turn LEFT. Walk into the Chemistry Lab corridor. Your destination room will be on your left and right — check each door for your room number.',
      4: 'Exit **Stair 4.3** and turn LEFT. Walk north up the Chemistry Lab corridor. Your destination room will be on your left and right.',
      5: 'Exit **Stair 5.3**. Turn LEFT and walk to the intersection. Turn LEFT at the intersection and continue west. Turn LEFT into the Chemistry Lab corridor. Walk forward — your destination room will be on your left and right.',
    },
    sameFloorTo: {
      351: (r) => ['Exit your room.', 'Turn RIGHT and walk along the main hallway.', 'Walk all the way to the end of the corridor.', 'Turn RIGHT into the Biology Lab wing.', 'Walk straight down the wing.', `**Room ${r}** will be on your right — check each door for the number.`],
      321: (r) => ['Exit your room.', 'Turn RIGHT and walk along the main hallway toward the center.', `**Room ${r}** will be on your left or right along the corridor — check each door for the number.`],
      301: (r) => ['Exit your room.', 'Turn RIGHT and walk along the main hallway toward the center.', 'Continue past the classrooms toward the Media Center area.', `**Room ${r}** will be on your left or right — check each door for the number.`],
    },
  },

  {
    floor: 3, lo: 321, hi: 340, stair: 3, wing: 'Center Classrooms & Admin',
    exitSteps: [
      'Exit your room.',
      'Walk toward the center of the floor — head toward the Media Center.',
      'You will reach **Stair 3.3** next to the Media Center entrance. Enter the stairwell.',
    ],
    arrivalFromStair: {
      3: 'Exit **Stair 3.3** and walk along the center corridor. Rooms 321–340 are on your left and right — check each door for your room number.',
      2: 'Exit **Stair 2.3** and turn RIGHT. Walk east along the main corridor. Rooms 321–340 are on your left and right.',
      4: 'Exit **Stair 4.3** and turn RIGHT. Walk east along the main corridor. Rooms 321–340 are on your left and right.',
      5: 'Exit **Stair 5.3**. Turn LEFT and walk along the corridor to the main hallway. Rooms 321–340 are on your left and right.',
    },
    sameFloorTo: {
      351: (r) => ['Exit your room.', 'Turn RIGHT and walk to the end of the hallway.', 'Turn RIGHT again into the Biology Lab wing.', 'Walk all the way down the wing.', `**Room ${r}** will be on your right — check each door for the number.`],
      341: (r) => ['Exit your room.', 'Turn LEFT and walk to the end of the hallway.', 'Turn LEFT into the Chemistry Lab wing.', 'Walk down the wing.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      301: (r) => ['Exit your room.', 'Turn LEFT and walk toward the center of the floor — head toward the Media Center.', `**Room ${r}** will be on your left or right near the Media Center area — check each door.`],
    },
  },

  {
    floor: 3, lo: 301, hi: 320, stair: 3, wing: 'Admin & Media Center Wing',
    exitSteps: [
      'Exit your room.',
      'Walk toward the Media Center in the center of the floor.',
      'You will reach **Stair 3.3** right next to the Media Center entrance. Enter the stairwell.',
    ],
    arrivalFromStair: {
      3: 'Exit **Stair 3.3** and walk toward the center of the floor. Rooms 301–320 are near the Media Center — check each door for your room number.',
    },
    sameFloorTo: {
      321: (r) => ['Exit your room.', 'Turn RIGHT and walk along the main corridor away from the Media Center.', `**Room ${r}** will be on your left or right — check each door for the number.`],
      351: (r) => ['Exit your room.', 'Turn RIGHT and walk along the main corridor.', 'Continue all the way to the end of the hallway.', 'Turn RIGHT into the Biology Lab wing.', 'Walk straight down the wing.', `**Room ${r}** will be on your right — check each door for the number.`],
      341: (r) => ['Exit your room.', 'Walk along the main corridor to the left until you reach the Chemistry Lab wing.', 'Turn LEFT into the wing.', 'Walk down the corridor.', `**Room ${r}** will be on your left or right — check each door.`],
    },
  },

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
  const fromNum   = parseInt(fromRoom);
  const toNum     = parseInt(toRoom);
  const fromFloor = getFloor(String(fromNum));
  const toFloor   = getFloor(String(toNum));
  const fromCluster = getRoomCluster(fromNum);
  const toCluster   = getRoomCluster(toNum);

  let lines = [`🗺️ **Directions: Room ${fromRoom} → Room ${toRoom}**\n`];
  if (teacherName) lines.push(`📌 Destination: **${teacherName}** is in **Room ${toRoom}**\n`);

  if (!toFloor || toFloor === 'Auditorium') {
    lines.push(`Room ${toRoom} is a special location. Please check with the front office for directions.`);
    return { text: lines.join('\n') };
  }
  if (!fromFloor) {
    lines.push(`Please specify which room you are starting from.`);
    return { text: lines.join('\n') };
  }

  // Same floor
  if (fromFloor === toFloor) {
    lines.push(`✅ Both rooms are on **Floor ${fromFloor}** — no stairs needed!\n`);
    if (fromCluster && toCluster) {
      lines.push(`**From:** Room ${fromRoom} (${fromCluster.wing})`);
      lines.push(`**To:** Room ${toRoom} (${toCluster.wing})\n`);
      lines.push(`**Step-by-step:**\n`);
      let step = 1;
      if (fromCluster.lo === toCluster.lo) {
        lines.push(`${step++}. Exit your room.`);
        lines.push(`${step++}. Walk along the corridor ${toNum > fromNum ? 'toward the higher-numbered rooms' : 'toward the lower-numbered rooms'}.`);
        lines.push(`${step++}. **Room ${toRoom}** will be on your left or right — look for the number on the door.`);
      } else if (fromCluster.sameFloorTo && fromCluster.sameFloorTo[toCluster.lo]) {
        const steps = fromCluster.sameFloorTo[toCluster.lo](toNum);
        for (const s of steps) lines.push(`${step++}. ${s}`);
      } else {
        lines.push(`${step++}. Exit your room.`);
        lines.push(`${step++}. Walk toward the main hallway.`);
        lines.push(`${step++}. Head toward the ${toCluster.wing}.`);
        lines.push(`${step++}. **Room ${toRoom}** will be on your left or right — check the number on each door.`);
      }
    } else {
      lines.push(`1. Exit your room.\n2. Walk along the corridor ${toNum > fromNum ? 'toward higher-numbered rooms' : 'toward lower-numbered rooms'}.\n3. **Room ${toRoom}** will be on your left or right.`);
    }
    return { text: lines.join('\n') };
  }

  // Different floors
  const goingUp   = toFloor > fromFloor;
  const floorDiff = Math.abs(toFloor - fromFloor);
  const selectedStair = fromCluster ? fromCluster.stair : (toCluster ? toCluster.stair : 3);
  const stairBlocked  = selectedStair === 3 && fromFloor === 1;
  const actualStair   = stairBlocked ? 2 : selectedStair;

  lines.push(`**From:** Room ${fromRoom} — Floor ${fromFloor}${fromCluster ? ` (${fromCluster.wing})` : ''}`);
  lines.push(`**To:** Room ${toRoom} — Floor ${toFloor}${toCluster ? ` (${toCluster.wing})` : ''}`);
  lines.push(`**Stairwell:** Stair ${actualStair}.${fromFloor} → Stair ${actualStair}.${toFloor}\n`);
  if (stairBlocked) lines.push(`*(Note: Stair 3.1 is not accessible to students, so you will use Stair 2 instead.)*\n`);
  lines.push(`---\n`);
  lines.push(`**Turn-by-turn directions:**\n`);

  let step = 1;
  const exitCluster = stairBlocked ? ROOM_CLUSTERS.find(c => c.floor === 1 && c.stair === 2) : fromCluster;
  if (exitCluster && exitCluster.exitSteps) {
    for (const s of exitCluster.exitSteps) lines.push(`${step++}. ${s}`);
  } else {
    lines.push(`${step++}. Exit your room.`);
    lines.push(`${step++}. Make your way to **Stair ${actualStair}.${fromFloor}** and enter the stairwell.`);
  }

  lines.push(`\n${step++}. Go **${goingUp ? '▲ UP' : '▼ DOWN'} ${floorDiff} floor${floorDiff > 1 ? 's' : ''}** to **Floor ${toFloor}**.\n`);

  if (toCluster && toCluster.arrivalFromStair && toCluster.arrivalFromStair[actualStair]) {
    lines.push(`${step++}. ${toCluster.arrivalFromStair[actualStair]}`);
  } else {
    lines.push(`${step++}. Exit **Stair ${actualStair}.${toFloor}** and walk toward ${toNum > fromNum ? 'higher' : 'lower'}-numbered rooms until you reach Room ${toRoom}.`);
  }
  lines.push(`${step++}. **Room ${toRoom}** will be labeled on the door — double-check the number as you pass each room.`);

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
