import styles from './PaperMapScene.module.css';

/* ─────────────────────────────────────────────────────────────────────────
   One large paper street map with two pinned locations and the walking
   route drawn between them along the streets — not two separate sheets,
   a single map the way you'd actually read a route on paper.

   The map is generated, not an image asset: a seeded grid of blocks, parks
   and a river, drawn as SVG so it stays crisp at any size and weighs nothing.
   Blocks get a darker outline so streets read as real roads (not just gaps),
   plus building-footprint texture, park tree dots, a torn-paper edge and a
   subtle grain filter for an aged, hand-drawn feel.
   ───────────────────────────────────────────────────────────────────────── */

// Deterministic PRNG (LCG) so the map always draws the same city.
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PALETTE = {
  paper:  '#efe6d2',
  street: '#e6dabf',
  block:  '#d8c9a3',
  blockLine: '#b8a67c',
  park:   '#b7c69c',
  parkLine: '#98a97c',
  tree:   '#7f9868',
  water:  '#a3c2d1',
  waterLine: '#87acbe',
};

const W = 900;
const H = 400;

function StreetGrid({ seed }) {
  const rnd = seededRandom(seed);

  const cols = [];
  for (let x = -20; x < W + 20; ) {
    const w = 46 + rnd() * 56;
    cols.push([x, w]);
    x += w + (rnd() < 0.22 ? 15 : 9);
  }
  const rows = [];
  for (let y = -20; y < H + 20; ) {
    const h = 38 + rnd() * 50;
    rows.push([y, h]);
    y += h + (rnd() < 0.2 ? 14 : 8);
  }

  const blocks = [];
  rows.forEach(([y, h], ri) => {
    cols.forEach(([x, w], ci) => {
      const roll = rnd();
      if (roll < 0.05) return; // plaza / empty lot
      const isPark = roll > 0.89;

      if (isPark) {
        blocks.push(<rect key={`${ri}-${ci}`} x={x} y={y} width={w} height={h} rx={2} fill={PALETTE.park} stroke={PALETTE.parkLine} strokeWidth="1.2" />);
        // Scatter a few trees across the park block
        const count = 3 + Math.floor(rnd() * 4);
        for (let t = 0; t < count; t++) {
          const tx = x + 8 + rnd() * (w - 16);
          const ty = y + 8 + rnd() * (h - 16);
          blocks.push(<circle key={`${ri}-${ci}-tree${t}`} cx={tx} cy={ty} r={2.2 + rnd() * 1.6} fill={PALETTE.tree} opacity="0.75" />);
        }
        return;
      }

      blocks.push(<rect key={`${ri}-${ci}`} x={x} y={y} width={w} height={h} rx={1.5} fill={PALETTE.block} stroke={PALETTE.blockLine} strokeWidth="1.1" />);

      // Building-footprint texture: split larger blocks into 2-4 lots with
      // thin interior lines, the way rooftops break up a real city block.
      if (w > 60 && rnd() > 0.35) {
        const cut = x + 18 + rnd() * (w - 36);
        blocks.push(<line key={`${ri}-${ci}-cut`} x1={cut} y1={y + 2} x2={cut} y2={y + h - 2} stroke={PALETTE.blockLine} strokeWidth="0.8" opacity="0.6" />);
      }
      if (h > 50 && rnd() > 0.45) {
        const cut = y + 16 + rnd() * (h - 32);
        blocks.push(<line key={`${ri}-${ci}-cuty`} x1={x + 2} y1={cut} x2={x + w - 2} y2={cut} stroke={PALETTE.blockLine} strokeWidth="0.8" opacity="0.5" />);
      }
    });
  });

  return (
    <>
      <rect x="-10" y="-10" width={W + 20} height={H + 20} fill={PALETTE.street} />
      {blocks}

      {/* River winding down the left side, with a soft near-bank tint */}
      <path
        d={`M ${W * 0.06} -10 C ${W * 0.17} ${H * 0.28}, ${W * 0.015} ${H * 0.5}, ${W * 0.15} ${H + 10}`}
        stroke={PALETTE.water} strokeWidth="17" fill="none" strokeLinecap="round"
      />
      <path
        d={`M ${W * 0.06} -10 C ${W * 0.17} ${H * 0.28}, ${W * 0.015} ${H * 0.5}, ${W * 0.15} ${H + 10}`}
        stroke={PALETTE.waterLine} strokeWidth="17" fill="none" strokeLinecap="round" opacity="0.35"
        strokeDasharray="0.5 5" strokeLinejoin="round"
      />

      {/* Two diagonal avenues cutting the grid, like the reference's angled streets */}
      <line x1="-20" y1={H * 0.84} x2={W + 20} y2={H * 0.08} stroke={PALETTE.street} strokeWidth="12" />
      <line x1={W * 0.3} y1="-20" x2={W * 0.6} y2={H + 20} stroke={PALETTE.street} strokeWidth="11" />
    </>
  );
}

function Pin({ x, y, color = 'var(--red)' }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="4" rx="10" ry="3.4" fill="rgba(30,20,5,.22)" />
      <path
        d="M0 -30c9.4 0 17 7.6 17 17 0 12.7-17 30-17 30S-17 -0.3-17-13c0-9.4 7.6-17 17-17z"
        fill={color}
        stroke="#fffaf0"
        strokeWidth="2"
      />
      <circle cx="0" cy="-13" r="6" fill="#fffaf0" />
    </g>
  );
}

// Deckled/torn paper edge: a closed polygon that wobbles a little around the
// rectangle border instead of running perfectly straight, per side.
function tornEdgePoints(seed) {
  const rnd = seededRandom(seed);
  const pts = [];
  const steps = 14;
  const jitter = () => (rnd() - 0.5) * 6;

  const push = (x, y) => pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  for (let i = 0; i <= steps; i++) { push((W * i) / steps, jitter()); }               // top
  for (let i = 0; i <= steps; i++) { push(W + jitter(), (H * i) / steps); }           // right
  for (let i = steps; i >= 0; i--) { push((W * i) / steps, H + jitter()); }           // bottom
  for (let i = steps; i >= 0; i--) { push(jitter(), (H * i) / steps); }               // left
  return pts.join(' ');
}

/**
 * @param {object} from - { name, room, meta } — route start
 * @param {object} to   - { name, room, meta } — route end
 */
export default function PaperMapScene({ from, to }) {
  // Pin positions: start lower-left, end upper-right, so the route reads
  // left-to-right the way the two labels are laid out beneath the map.
  const p1 = { x: W * 0.16, y: H * 0.62 };
  const p2 = { x: W * 0.82, y: H * 0.3 };

  // A route that ducks along implied streets rather than cutting straight
  // across the block grid.
  const routeD = `M ${p1.x} ${p1.y}
    C ${p1.x + 70} ${p1.y - 10}, ${p1.x + 90} ${p1.y - 60}, ${p1.x + 170} ${p1.y - 70}
    S ${W * 0.5} ${H * 0.2}, ${W * 0.5 + 40} ${H * 0.28}
    S ${p2.x - 120} ${p2.y + 40}, ${p2.x - 40} ${p2.y + 10}
    S ${p2.x - 10} ${p2.y + 4}, ${p2.x} ${p2.y}`;

  return (
    <div className={styles.stage}>
      <figure className={styles.polaroid}>
        <img src="/phoenix.png" alt="" className={styles.polaroidImg} />
        <figcaption className={styles.polaroidCap}>Innovation Academy</figcaption>
      </figure>

      <svg className={styles.clip} viewBox="0 0 40 92" fill="none" aria-hidden="true">
        <path
          d="M28 26v40a12 12 0 0 1-24 0V20a8 8 0 0 1 16 0v44a4 4 0 0 1-8 0V26"
          stroke="#9aa0a6" strokeWidth="4.5" strokeLinecap="round" transform="rotate(18 20 46)"
        />
      </svg>

      <div className={styles.paper}>
        <svg className={styles.mapSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            {/* Subtle aged-paper grain — a legitimate SVG filter, not a copied asset */}
            <filter id="paperGrain" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={7} result="noise" />
              <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0.05 0" />
            </filter>
            <clipPath id="tornEdge" clipPathUnits="userSpaceOnUse">
              <polygon points={tornEdgePoints(41302)} />
            </clipPath>
          </defs>

          <g clipPath="url(#tornEdge)">
            <StreetGrid seed={20260829} />

            {/* Route along the streets, start to finish */}
            <path d={routeD} stroke="var(--red)" strokeWidth="4" strokeDasharray="2 11" strokeLinecap="round" fill="none" />

            {/* Fixed navy, not a theme token — this pin sits on the cream map
                paper (which doesn't invert with the page), not on the page
                background, so it needs to stay dark in both themes. */}
            <Pin x={p1.x} y={p1.y} />
            <Pin x={p2.x} y={p2.y} color="#1f2430" />

            <rect x="-10" y="-10" width={W + 20} height={H + 20} filter="url(#paperGrain)" />
          </g>
        </svg>

        <div className={styles.fold} />
        <div className={styles.age} />
      </div>

      {/* Callout labels under each end of the route */}
      <div className={styles.labels}>
        <div className={`${styles.label} ${styles.labelStart}`}>
          <span className={styles.labelDot} />
          <div>
            <span className={styles.labelName}>{from.name}</span>
            <span className={styles.labelRoom}>{from.room}</span>
            <span className={styles.labelMeta}>{from.meta}</span>
          </div>
        </div>
        <div className={`${styles.label} ${styles.labelEnd}`}>
          <span className={`${styles.labelDot} ${styles.labelDotEnd}`} />
          <div>
            <span className={styles.labelName}>{to.name}</span>
            <span className={styles.labelRoom}>{to.room}</span>
            <span className={styles.labelMeta}>{to.meta}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
