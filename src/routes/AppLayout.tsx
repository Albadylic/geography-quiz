import { NavLink, Outlet, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Play' },
  { to: '/revision', label: 'Revise' },
  { to: '/stats', label: 'Stats' },
  { to: '/settings', label: 'Settings' },
];

export function AppLayout() {
  const { pathname } = useLocation();
  // The active session screen runs without chrome so the flags can go
  // edge-to-edge (§10).
  const chromeless = /^\/play\/[^/]+$/.test(pathname);

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
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
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
