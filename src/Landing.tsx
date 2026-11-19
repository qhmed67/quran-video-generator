import { useCallback, useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from './components/icons';
import { applyTheme, flipTheme, readTheme } from './lib/theme';
import type { Theme } from './lib/theme';

type Lang = 'ar' | 'en';

interface Copy {
  nav: string;
  eyebrow: string;
  title: string;
  lede: string;
  cta: string;
  hint: string;
  facts: { name: string; desc: string }[];
  previewLabel: string;
  verseRef: string;
  verse: string;
  ayahNumber: string;
  footer: string;
}

const COPY: Record<Lang, Copy> = {
  en: {
    nav: 'Quranic Video Generator',
    eyebrow: 'From mushaf to reel',
    title: 'Word-synced Qur’an reels, cut straight from the mushaf.',
    lede: 'Pick a surah range and a reciter. Captions follow the recitation — word by word when the reciter’s timing supports it, verse by verse when it doesn’t — set in the Uthmani script and exported as a finished MP4.',
    cta: 'Open the studio',
    hint: 'No account, no upload queue. The video renders in this browser.',
    facts: [
      {
        name: 'Uthmani script',
        desc: 'Captions are set in KFGQPC Hafs, the face the mushaf itself uses.',
      },
      {
        name: 'Two formats',
        desc: 'Vertical 9:16 for reels, square 1:1 for posts, both 1080 px wide.',
      },
      {
        name: 'Honest about timing',
        desc: 'Per-word segments from the reciter drive the highlight; where they are missing, ayat stay verse-accurate and the studio says so.',
      },
    ],
    previewLabel: 'Exported frame · Surah Qaf, ayah 45',
    verseRef: 'Surah Qaf · 45',
    verse: 'نَحْنُ أَعْلَمُ بِمَا يَقُولُونَ ۖ وَمَا أَنتَ عَلَيْهِم بِجَبَّارٍ ۖ فَذَكِّرْ بِالْقُرْآنِ مَن يَخَافُ وَعِيدِ',
    ayahNumber: '٤٥',
    footer: 'Built with love for the Ummah.',
  },
  ar: {
    nav: 'مولد الفيديو القرآني',
    eyebrow: 'من المصحف إلى الفيديو',
    title: 'فيديوهات قرآنية تتزامن كلماتها مع التلاوة، من المصحف مباشرة.',
    lede: 'اختر نطاق الآيات والقارئ. تتبع الكلمات التلاوة — كلمة بكلمة عند توفر توقيت الكلمات، وآية بآية عند غيابه — بخط المصحف العثماني، ثم تُصدَّر فيديو MP4 جاهزًا.',
    cta: 'افتح الاستوديو',
    hint: 'بدون حساب ولا طابور رفع. يُصدَّر الفيديو داخل هذا المتصفح.',
    facts: [
      { name: 'الخط العثماني', desc: 'النصوص بخط مجمع الملك فهد لطباعة المصحف الشريف.' },
      { name: 'صيغتان', desc: 'عمودي ٩:١٦ للريلز، ومربع ١:١ للمنشورات، بعرض ١٠٨٠ بكسل.' },
      {
        name: 'توقيت صادق',
        desc: 'يُستخدم توقيت الكلمات من القارئ عند توفره، وإلا تبقى الآيات متزامنة والاستوديو يوضّح ذلك.',
      },
    ],
    previewLabel: 'إطار مُصدَّر · سورة ق، الآية ٤٥',
    verseRef: 'سورة ق · ٤٥',
    verse: 'نَحْنُ أَعْلَمُ بِمَا يَقُولُونَ ۖ وَمَا أَنتَ عَلَيْهِم بِجَبَّارٍ ۖ فَذَكِّرْ بِالْقُرْآنِ مَن يَخَافُ وَعِيدِ',
    ayahNumber: '٤٥',
    footer: 'صُنع بحب للأمة.',
  },
};

const LANG_KEY = 'landing-lang';

export default function Landing() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [lang, setLang] = useState<Lang>(() => {
    const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(LANG_KEY);
    return saved === 'ar' || saved === 'en' ? saved : 'ar';
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  const toggleTheme = useCallback(() => setTheme((t) => flipTheme(t)), []);
  const copy = COPY[lang];
  const rtl = lang === 'ar';

  return (
    <div className="landing">
      <nav className="landing__nav">
        <a className="brand" href="#/">
          <img className="brand__mark" src="/download.png" alt="" />
          <span className="brand__text">
            <span className="brand__name">{copy.nav}</span>
          </span>
        </a>
        <div className="landing__nav-spacer" />
        <div className="lang-toggle" role="group" aria-label="Language">
          <button
            type="button"
            aria-pressed={lang === 'ar'}
            onClick={() => setLang('ar')}
            lang="ar"
          >
            عربي
          </button>
          <button
            type="button"
            aria-pressed={lang === 'en'}
            onClick={() => setLang('en')}
            lang="en"
          >
            EN
          </button>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </nav>

      <main className="landing__main">
        <section className="landing__copy" lang={lang} dir={rtl ? 'rtl' : 'ltr'}>
          <p className="eyebrow">
            <span className="rosette" aria-hidden="true" />
            {copy.eyebrow}
          </p>
          <h1 className="landing__title" dir={rtl ? 'rtl' : 'ltr'}>
            {copy.title}
          </h1>
          <p className="landing__lede">{copy.lede}</p>
          <div className="landing__cta">
            <a className="btn btn--primary" href="#/studio">
              {copy.cta}
            </a>
          </div>
          <p className="landing__hint">{copy.hint}</p>
          <ul className="facts">
            {copy.facts.map((fact) => (
              <li className="fact" key={fact.name}>
                <span className="rosette" aria-hidden="true" />
                <div>
                  <div className="fact__name">{fact.name}</div>
                  <div className="fact__desc">{fact.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing__preview" aria-label={copy.previewLabel}>
          <div className="reel" lang="ar" dir="rtl">
            <div className="reel__top">
              <span>{copy.verseRef}</span>
              <span dir="ltr">9:16</span>
            </div>
            <p className="reel__verse">
              {copy.verse}
              <span className="reel__ayah" aria-hidden="true">
                {copy.ayahNumber}
              </span>
            </p>
            <div className="reel__bottom">
              <div className="reel__ribbon" aria-hidden="true">
                <span className="is-active" style={{ flexGrow: 3 }} />
                <span style={{ flexGrow: 2 }} />
                <span style={{ flexGrow: 4 }} />
                <span style={{ flexGrow: 1 }} />
              </div>
              <div className="reel__meta">
                <span dir="ltr">00:04.2 / 00:20.0</span>
                <span dir="ltr">1080 × 1920</span>
              </div>
            </div>
          </div>
          <p className="preview-caption">
            <span className="rosette" aria-hidden="true" />
            {copy.previewLabel}
          </p>
        </section>
      </main>

      <footer className="landing__footer">
        <span>{copy.footer}</span>
        <span className="landing__footer-spacer" />
        <a className="btn btn--quiet btn--sm" href="#/studio">
          {copy.cta}
        </a>
      </footer>
    </div>
  );
}
