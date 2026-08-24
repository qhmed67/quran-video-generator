import { useEffect, useState, useCallback, useRef } from 'react';

type Lang = 'ar' | 'en';
type Theme = 'light' | 'dark';

const t: Record<Lang, { start: string; subtitle: string; nav: string; built: string }> = {
  ar: {
    start: 'ابدأ الإنشاء',
    subtitle: 'أنشئ فيديوهات تلاوة قرآنية جميلة مع ترجمة عربية متزامنة.',
    nav: 'مولد الفيديو القرآني',
    built: 'صُنع بحب للأمة',
  },
  en: {
    start: 'Start Creating',
    subtitle: 'Create beautiful word-synced Quran recitation videos with synchronized Arabic captions.',
    nav: 'Quranic Video Generator',
    built: 'Built with love for the Ummah',
  },
};

export default function Landing() {
  const [visible, setVisible] = useState(false);
  const [lang, setLang] = useState<Lang>('ar');
  const [theme, setTheme] = useState<Theme>('light');
  const [textVisible, setTextVisible] = useState(true);
  const langRef = useRef(lang);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const goToDashboard = useCallback(() => {
    const root = document.getElementById('root');
    if (root) {
      root.style.transition = 'opacity 350ms cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 350ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      root.style.opacity = '0';
      root.style.transform = 'translateY(-8px)';
    }
    setTimeout(() => {
      window.location.hash = '#/dashboard';
      window.location.reload();
    }, 320);
  }, []);

  const toggleLang = useCallback(() => {
    setTextVisible(false);
    setTimeout(() => {
      setLang((l) => (l === 'ar' ? 'en' : 'ar'));
      langRef.current = langRef.current === 'ar' ? 'en' : 'ar';
      setTextVisible(true);
    }, 180);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  const currentLang = lang;

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
      opacity: textVisible ? 1 : 0,
      transition: 'opacity 180ms ease',
    }}>
      {/* Top nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 32px', position: 'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/download.png" alt="" style={{ width: 48, height: 48, objectFit: 'contain', flexShrink: 0 }} />
          <span style={{
            fontSize: 17, fontWeight: 600, color: 'var(--fg)',
            letterSpacing: '-0.01em', lineHeight: '20px',
            height: 20, display: 'flex', alignItems: 'center',
          }}>
            <span>{t[currentLang].nav}</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Language Toggle */}
          <button
            onClick={toggleLang}
            className="lang-toggle"
            aria-label="Switch language"
          >
            <div className="lang-toggle-slider" data-lang={currentLang} />
            <span
              className={`lang-toggle-label ${currentLang === 'ar' ? 'active' : ''}`}
              style={{ color: currentLang === 'ar' ? '#ffffff' : undefined }}
            >
              عربي
            </span>
            <span
              className={`lang-toggle-label ${currentLang === 'en' ? 'active' : ''}`}
              style={{ color: currentLang === 'en' ? '#ffffff' : undefined }}
            >
              EN
            </span>
          </button>

          <button
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        padding: '0 24px', textAlign: 'center',
        position: 'relative', minHeight: 0,
      }}>
        {/* Centered content wrapper */}
        <div className="hero-stack" style={{
          flex: 1, width: '100%', maxWidth: 800,
        }}>
        {/* Decorative background circles */}
        <div style={{
          position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,0,0,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Icon */}
        <div style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.95)',
          transition: 'opacity 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}>
          <img
            src="/download.png"
            alt="Quran"
            style={{
              width: 200, height: 200, objectFit: 'contain',
              filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.08))',
            }}
          />
        </div>

        {/* Verse */}
        <div style={{
          maxWidth: 800,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'color 200ms ease, opacity 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.15s, transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.15s',
        }}>
          <div className="verse-glow" style={{
            fontFamily: "'KFGQPC HAFS Uthmanic Script', 'Scheherazade New', serif",
            fontSize: 'clamp(28px, 4.5vw, 44px)',
            fontWeight: 400,
            lineHeight: 1.9,
            color: 'var(--fg)',
            margin: 0,
            direction: 'rtl',
            letterSpacing: '0.02em',
            textAlign: 'center',
          }}>
            <p style={{ margin: 0 }}>
              &#123; نَّحْنُ أَعْلَمُ بِمَا يَقُولُونَ ۖ وَمَا أَنتَ عَلَيْهِم بِجَبَّارٍ ۖ
            </p>
            <p className="verse-shine" style={{ margin: '8px 0 0' }}>
              فَذَكِّرْ بِالْقُرْآنِ مَن يَخَافُ وَعِيدِ &#125;
            </p>
          </div>
        </div>

        {/* Reference */}
        <div style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(16px)',
          transition: 'color 200ms ease, opacity 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.3s, transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.3s',
        }}>
          <span style={{
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            fontSize: 16, fontWeight: 400,
            color: 'var(--muted)', direction: 'rtl',
            display: 'inline-block',
          }}>
            سورة ق : اية ٤٥
          </span>
        </div>

        {/* Divider */}
        <div style={{
          width: 60, height: 2, background: 'var(--accent)',
          borderRadius: 1,
          opacity: visible ? 1 : 0,
          transform: visible ? 'scaleX(1)' : 'scaleX(0)',
          transition: 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.4s',
        }} />

        {/* Subtitle */}
        <p className="hero-subtitle-safe" style={{
          color: 'var(--muted)', margin: 0,
          direction: currentLang === 'ar' ? 'rtl' : 'ltr',
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(16px)',
            transition: 'color 200ms ease, opacity 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.45s, transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.45s',
          }}>
          <span>{t[currentLang].subtitle}</span>
        </p>

        {/* CTA */}
        <div style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.55s, transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.55s',
        }}>
          <button
            onClick={goToDashboard}
            className="btn-primary cta-safe"
            style={{
              background: 'var(--accent)', color: 'var(--accent-on)',
              border: 'none', borderRadius: 9999, fontWeight: 600,
              letterSpacing: '-0.01em', cursor: 'pointer',
              boxShadow: '0 0 0.5px 0 rgba(0,117,74,0.2), 0 4px 16px 0 rgba(0,117,74,0.18)',
              transition: 'all 180ms ease',
              fontFamily: "'IBM Plex Sans Arabic', sans-serif",
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span>{t[currentLang].start}</span>
          </button>
        </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '28px 40px', textAlign: 'center',
        borderTop: '1px solid var(--border-soft)',
        flexShrink: 0, marginTop: 'auto',
      }}>
        <p style={{
          fontSize: 14, color: 'var(--muted)', margin: 0,
          fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          lineHeight: 1.6,
        }}>
          <span>{t[currentLang].built}</span>
        </p>
      </footer>
    </div>
  );
}
