import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapPin, Map, Bell, MessageSquare, GraduationCap } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../theme/ThemeContext';
import styles from './Landing.module.css';

// Crimson in light mode, a soft white in dark mode — always readable.
const ARROW_LIGHT = { r: 176, g: 37, b: 42 };  // #B0252A
const ARROW_DARK  = { r: 220, g: 180, b: 180 }; // soft pinkish-white on dark bg

// School preview photo — the image that was on the homepage before the
// CSS-mockup chat preview replaced it.
const SCHOOL_IMAGE =
  'https://images.unsplash.com/photo-1562774053-701939374585?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=70';

const FEATURES = [
  { Icon: MapPin,        label: 'Teacher Locations' },
  { Icon: Map,           label: 'Floor Navigation' },
  { Icon: Bell,          label: 'Bell Schedule' },
  { Icon: MessageSquare, label: 'AI Chat' },
];

export default function Landing() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isLoggedIn = !!localStorage.getItem('ia_token');

  // Canvas-drawn cursor arrow (ported from the 21st.dev dynamic-hero component).
  const canvasRef = useRef(null);
  const targetRef = useRef(null); // the Sign Up button — the arrow points here
  const mousePosRef = useRef({ x: null, y: null });
  const ctxRef = useRef(null);
  const animationFrameIdRef = useRef(null);

  const drawArrow = useCallback(() => {
    if (!canvasRef.current || !targetRef.current || !ctxRef.current) return;

    const targetEl = targetRef.current;
    const ctx = ctxRef.current;
    const mouse = mousePosRef.current;

    const x0 = mouse.x;
    const y0 = mouse.y;
    if (x0 === null || y0 === null) return;

    const rect = targetEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const a = Math.atan2(cy - y0, cx - x0);
    const x1 = cx - Math.cos(a) * (rect.width / 2 + 12);
    const y1 = cy - Math.sin(a) * (rect.height / 2 + 12);

    const midX = (x0 + x1) / 2;
    const midY = (y0 + y1) / 2;
    const offset = Math.min(200, Math.hypot(x1 - x0, y1 - y0) * 0.5);
    const t = Math.max(-1, Math.min(1, (y0 - y1) / 200));
    const controlX = midX;
    const controlY = midY + offset * t;

    const r = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
    const opacity = Math.min(1.0, (r - Math.max(rect.width, rect.height) / 2) / 500);

    const ARROW_RGB = document.documentElement.getAttribute('data-theme') === 'dark'
      ? ARROW_DARK : ARROW_LIGHT;
    ctx.strokeStyle = `rgba(${ARROW_RGB.r}, ${ARROW_RGB.g}, ${ARROW_RGB.b}, ${opacity})`;
    ctx.lineWidth = 2;

    // Curve
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(controlX, controlY, x1, y1);
    ctx.setLineDash([10, 5]);
    ctx.stroke();
    ctx.restore();

    // Arrowhead
    const angle = Math.atan2(y1 - controlY, x1 - controlX);
    const headLength = 10 * (ctx.lineWidth / 1.5);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - headLength * Math.cos(angle - Math.PI / 6), y1 - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - headLength * Math.cos(angle + Math.PI / 6), y1 - headLength * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !targetRef.current) return;

    ctxRef.current = canvas.getContext('2d');
    const ctx = ctxRef.current;

    const updateCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    const handleMouseMove = (e) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('resize', updateCanvasSize);
    window.addEventListener('mousemove', handleMouseMove);
    updateCanvasSize();

    const animateLoop = () => {
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawArrow();
      }
      animationFrameIdRef.current = requestAnimationFrame(animateLoop);
    };
    animateLoop();

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, [drawArrow]);

  return (
    <div className={styles.page}>
      {/* ── Header: wordmark left, nav right ── */}
      <header className={styles.header}>
        <Link to="/home" className={styles.brand}>
          <img src="/phoenix.png" alt="IA Phoenix" className={styles.brandLogo} />
          <span className={styles.brandText}>IA Nexus</span>
        </Link>
        <nav className={styles.nav}>
          <Link to="/home" className={styles.navLink}>Home</Link>
          <Link to="/" className={styles.navLink}>Chat</Link>
          <Link to="/route" className={styles.navLink}>Route Finder</Link>
          <Link to="/about" className={styles.navLink}>About</Link>
          <Link to="/pricing" className={styles.navLink}>Pricing</Link>
          <ThemeToggle />
        </nav>
      </header>

      {/* ── Hero ── */}
      <main className={styles.main}>
        <h1 className={styles.heading}>
          <span className={styles.headingNavy}>Find Anyone.</span>{' '}
          <span className={styles.headingRed}>Anywhere. Instantly.</span>
        </h1>

        <p className={styles.tagline}>
          IA Nexus gives students and staff real-time teacher locations,
          period-by-period schedules, and step-by-step navigation — all in one place.
        </p>

        {/* Two CTA buttons — Sign Up is the cursor-arrow target. Hidden once
            signed in: the top nav is how a logged-in visitor gets around. */}
        {!isLoggedIn && (
          <div className={styles.ctaRow}>
            <button className={styles.btnPrimary} onClick={() => navigate('/login')}>
              Log In
            </button>
            <button ref={targetRef} className={styles.btnSecondary} onClick={() => navigate('/signup')}>
              Sign Up
            </button>
          </div>
        )}

        {/* Honest trust line — no fabricated metrics */}
        <p className={styles.trustLine}>
          <GraduationCap size={16} strokeWidth={2} />
          Built by an Innovation Academy student, for IA students.
        </p>

        {/* Feature tiles */}
        <div className={styles.features}>
          {FEATURES.map((f) => (
            <div key={f.label} className={styles.feature}>
              <span className={styles.featureIcon}><f.Icon size={26} strokeWidth={1.8} /></span>
              <span className={styles.featureLabel}>{f.label}</span>
            </div>
          ))}
        </div>

        {/* School preview photo */}
        <div className={styles.imageCardWrap}>
          <div className={styles.imageCardBorder}>
            <div className={styles.imageCard}>
              <img src={SCHOOL_IMAGE} alt="IA Nexus preview" className={styles.imageCardImg} decoding="async" />
            </div>
          </div>
        </div>
      </main>

      {/* Animated cursor-arrow overlay (transparent; clicks pass through) */}
      <canvas ref={canvasRef} className={styles.cursorCanvas} />
    </div>
  );
}
