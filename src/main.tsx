import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from './ErrorBoundary';
import Landing from './Landing';
import App from './App';
import './index.css';

type Route = 'landing' | 'studio';

function routeOf(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  return clean === '' ? 'landing' : 'studio';
}

function Router() {
  const [shown, setShown] = useState<Route>(() => routeOf(window.location.hash));
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      const next = routeOf(window.location.hash);
      setShown((current) => {
        if (next !== current) setLeaving(true);
        return current;
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => {
      setShown(routeOf(window.location.hash));
      setLeaving(false);
    }, 260);
    return () => window.clearTimeout(id);
  }, [leaving]);

  return (
    <div className={leaving ? 'route is-leaving' : 'route'}>
      {shown === 'landing' ? <Landing /> : <App />}
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
