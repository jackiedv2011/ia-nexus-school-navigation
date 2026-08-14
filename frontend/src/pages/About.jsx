import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import styles from './Info.module.css';

// Drop your photo in here later (e.g. '/jagan.png' placed in frontend/public,
// or an imported asset). While empty, a square placeholder is shown.
const CREATOR_IMAGE = '';

export default function About() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/home" className={styles.brand}>
          <img src="/phoenix.png" alt="IA Phoenix" className={styles.brandLogo} />
          <span className={styles.brandText}>IA Nexus</span>
        </Link>
        <nav className={styles.nav}>
          <Link to="/home" className={styles.navLink}>Home</Link>
          <Link to="/about" className={`${styles.navLink} ${styles.navLinkActive}`}>About</Link>
          <Link to="/pricing" className={styles.navLink}>Pricing</Link>
          <ThemeToggle />
        </nav>
      </header>

      <main className={styles.content}>
        <p className={styles.eyebrow}>About</p>
        <h1 className={styles.title}>About the Creator</h1>

        <div className={`${styles.creatorGrid} ${CREATOR_IMAGE ? '' : styles.creatorGridNoPhoto}`}>
          {/* Photo + caption — only shown once a real image is provided */}
          {CREATOR_IMAGE && (
            <div className={styles.photoCol}>
              <div className={styles.photoSquare}>
                <img src={CREATOR_IMAGE} alt="Jagan Venkatraman" className={styles.photoImg} />
              </div>
              <div className={styles.photoCaption}>
                <span className={styles.photoName}>Jagan Venkatraman</span>
                <span className={styles.photoRole}>Founder &amp; Developer</span>
              </div>
            </div>
          )}

          {/* Story */}
          <div className={styles.story}>
            <p className={styles.bodyPara}>
              My name is Jagan Venkatraman, and I am the founder and developer of IA Nexus.
              I began building IA Nexus during my freshman year at Innovation Academy High School.
            </p>
            <p className={styles.bodyPara}>
              The idea for IA Nexus first came to me at the beginning of freshman year when my
              classmates and I struggled to navigate the school. Innovation Academy is a unique
              school with multiple floors, changing classrooms, and unfamiliar hallways, which
              made it difficult for many new students to find their way around.
            </p>
            <p className={styles.bodyPara}>
              Later that year, during GT Block, my teacher asked the class a simple question:
            </p>
            <blockquote className={styles.quote}>
              “What is an issue you would like to solve?”
            </blockquote>
            <p className={styles.bodyPara}>
              Immediately, the navigation challenges I had experienced as a freshman came to mind.
              I remembered the confusion many students, including myself, faced during the first
              weeks of school. I also remembered conversations with my peers who shared the same
              frustration about finding classrooms, teachers, and the quickest routes throughout
              the building.
            </p>
            <p className={styles.bodyPara}>
              At that moment, I knew this was the problem I wanted to solve.
            </p>
            <p className={styles.bodyPara}>
              IA Nexus was created to help students feel more confident navigating Innovation
              Academy. By combining artificial intelligence with school navigation, IA Nexus aims
              to make the transition into high school easier for incoming students and provide a
              helpful resource for the entire school community.
            </p>
            <p className={styles.bodyPara}>
              What began as a freshman’s idea to solve a real problem has grown into a project I
              founded and developed, dedicated to helping students navigate their school with
              confidence.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
