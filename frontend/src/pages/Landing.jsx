import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapPin, Map, Bell, MessageSquare, GraduationCap } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import PaperMapScene from '../components/PaperMapScene';
import { useTheme } from '../theme/ThemeContext';
import styles from './Landing.module.css';

// Crimson in light mode, a soft white in dark mode — always readable.
const ARROW_LIGHT = { r: 176, g: 37, b: 42 };  // #B0252A
const ARROW_DARK  = { r: 220, g: 180, b: 180 }; // soft pinkish-white on dark bg

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
      {/* ── Header: wordmark + segmented pill on the left, nav on the right ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/home" className={styles.brand}>
            <img src="/phoenix.png" alt="IA Phoenix" className={styles.brandLogo} />
            <span className={styles.brandText}>IA Nexus</span>
          </Link>
          <div className={styles.segment}>
            <Link to="/home" className={`${styles.segmentItem} ${styles.segmentActive}`}>Home</Link>
            <Link to="/" className={styles.segmentItem}>Assistant</Link>
          </div>
        </div>

        <nav className={styles.nav}>
          <Link to="/route" className={styles.navLink}>Route Finder</Link>
          <Link to="/about" className={styles.navLink}>About</Link>
          <Link to="/pricing" className={styles.navLink}>Pricing</Link>
          <ThemeToggle />
          {isLoggedIn ? (
            <Link to="/" className={styles.navPill}>Open Assistant</Link>
          ) : (
            <>
              <Link to="/login" className={styles.navLink}>Log in</Link>
              <Link to="/signup" className={styles.navPill}>Register</Link>
            </>
          )}
        </nav>
      </header>

      {/* ── Hero ── */}
      <main className={styles.main}>
        <h1 className={styles.heading}>
          Picture this. You already know where every teacher is.
        </h1>

        <p className={styles.tagline}>
          3 floors. 60+ teachers. One assistant that knows where everyone is
          and how to get you there.
        </p>

        <div className={styles.ctaRow}>
          <button className={styles.btnPrimary} onClick={() => navigate('/')}>
            Open the assistant
          </button>
          {isLoggedIn ? (
            <button className={styles.btnSecondary} onClick={() => navigate('/route')}>
              Find a route
            </button>
          ) : (
            <button ref={targetRef} className={styles.btnSecondary} onClick={() => navigate('/signup')}>
              Create an account
            </button>
          )}
        </div>

        {/* Honest trust line — no fabricated metrics */}
        <p className={styles.trustLine}>
          <GraduationCap size={16} strokeWidth={2} />
          Built by an Innovation Academy student, for IA students.
        </p>

        {/* ── Route scene: two vintage paper maps pinned side by side, joined
            by the dashed path the assistant would actually route you along. ── */}
        <section className={styles.scene} aria-label="Example route between two rooms">
          <p className={styles.sceneKicker}>Every route, end to end</p>
          <PaperMapScene
            from={{ name: "Mr. Ross's room", room: 'Room 188', meta: 'Start · 3rd period' }}
            to={{ name: "Mr. Mobley's room", room: 'Room 331', meta: 'Arrive · 4 min walk' }}
          />
        </section>

        {/* Feature tiles */}
        <div className={styles.features}>
          {FEATURES.map((f) => (
            <div key={f.label} className={styles.feature}>
              <span className={styles.featureIcon}><f.Icon size={26} strokeWidth={1.8} /></span>
              <span className={styles.featureLabel}>{f.label}</span>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer: link columns over a huge IA NEXUS watermark ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerCols}>
            <div className={styles.footerCol}>
              <h4 className={styles.footerHeading}>Product</h4>
              <Link to="/" className={styles.footerLink}>Assistant</Link>
              <Link to="/route" className={styles.footerLink}>Route Finder</Link>
              <Link to="/pricing" className={styles.footerLink}>Pricing</Link>
            </div>
            <div className={styles.footerCol}>
              <h4 className={styles.footerHeading}>Account</h4>
              <Link to="/login" className={styles.footerLink}>Log in</Link>
              <Link to="/signup" className={styles.footerLink}>Create account</Link>
              <Link to="/forgot-password" className={styles.footerLink}>Reset password</Link>
            </div>
            <div className={styles.footerCol}>
              <h4 className={styles.footerHeading}>About</h4>
              <Link to="/about" className={styles.footerLink}>About IA Nexus</Link>
              <a href="mailto:innovationacademynavigation@gmail.com" className={styles.footerLink}>Contact</a>
            </div>
            <div className={styles.footerCol}>
              <h4 className={styles.footerHeading}>Legal</h4>
              <Link to="/about" className={styles.footerLink}>Privacy Policy</Link>
              <Link to="/about" className={styles.footerLink}>Terms of Use</Link>
              <Link to="/about" className={styles.footerLink}>Data &amp; Safety</Link>
            </div>
          </div>

          <div className={styles.footerBar}>
            <span>© {new Date().getFullYear()} IA Nexus. A student project — not an official Innovation Academy service.</span>
            <span className={styles.footerBarLinks}>
              <Link to="/about" className={styles.footerLink}>Privacy</Link>
              <Link to="/about" className={styles.footerLink}>Terms</Link>
            </span>
          </div>
        </div>

        {/* Oversized wordmark sitting behind the footer content */}
        <div className={styles.footerMark} aria-hidden="true">IA NEXUS</div>
      </footer>

      {/* Animated cursor-arrow overlay (transparent; clicks pass through) */}
      <canvas ref={canvasRef} className={styles.cursorCanvas} />
    </div>
  );
}
