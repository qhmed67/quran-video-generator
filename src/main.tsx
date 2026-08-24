import { StrictMode, useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from './ErrorBoundary';
import Landing from './Landing';
import App from './App';
import './index.css';

function Router() {
  const [route, setRoute] = useState(window.location.hash);
  const [displayed, setDisplayed] = useState<'landing' | 'app'>(
    (!route || route === '#' || route === '#/') ? 'landing' : 'app'
  );
  const [fadingOut, setFadingOut] = useState(false);
  const nextRoute = useRef(route);

  useEffect(() => {
    const handleHash = () => {
      const newHash = window.location.hash;
      const newTarget: 'landing' | 'app' =
        (!newHash || newHash === '#' || newHash === '#/') ? 'landing' : 'app';

      if (newTarget !== displayed) {
        setFadingOut(true);
        nextRoute.current = newHash;
        setTimeout(() => {
          setRoute(newHash);
          setDisplayed(newTarget);
          setFadingOut(false);
        }, 300);
      } else {
        setRoute(newHash);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [displayed]);

  const showLanding = displayed === 'landing';

  return (
    <div style={{
      height: '100%',
      opacity: fadingOut ? 0 : 1,
      transform: fadingOut ? 'translateY(-6px)' : 'translateY(0)',
      transition: 'opacity 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    }}>
      {showLanding ? <Landing /> : <App />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Router />
    </ErrorBoundary>
  </StrictMode>,
);
