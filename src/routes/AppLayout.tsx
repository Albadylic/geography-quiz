import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStatsStore } from '@/store/statsStore';

const navItems = [
  { to: '/', label: 'Play' },
  { to: '/revision', label: 'Revise' },
  { to: '/stats', label: 'Stats' },
  { to: '/settings', label: 'Settings' },
];

export function AppLayout() {
  const { pathname } = useLocation();
  const reducedMotion = useStatsStore((state) => state.data.settings.reducedMotion);

  /**
   * §11 honours `prefers-reduced-motion` in CSS. This adds the *setting* on top
   * of it, for someone whose system preference is off but who still wants the
   * animation gone here.
   */
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
  }, [reducedMotion]);

  // The active session screen runs without chrome so the flags can go
  // edge-to-edge (§10).
  const chromeless = /^\/play\/[^/]+$/.test(pathname);

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      {/*
        First tab stop on every page. Visually hidden until focused, which is
        what makes it useful to a keyboard user and invisible to everyone else.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-signal-yellow focus:px-4 focus:py-3 focus:text-ink"
      >
        Skip to main content
      </a>

      {!chromeless && (
        <header className="border-b-2 border-line">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <NavLink to="/" className="display-md text-lg text-paper">
              <span className="bg-signal-red px-2 py-1 text-paper">GEO</span>
              <span className="pl-1">QUIZ</span>
            </NavLink>
            <nav aria-label="Main" className="ml-auto flex gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    [
                      'label-caps px-3 py-2 text-xs transition-colors',
                      isActive
                        ? 'bg-paper text-ink'
                        : 'text-paper-dim hover:bg-ink-raised hover:text-paper',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>
      )}

      {/* tabIndex -1 so the skip link can move focus here, not just scroll. */}
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
