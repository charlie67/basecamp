import { useState, type ComponentType, type SVGProps } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { MapIcon, SunriseIcon, SunsetIcon, UserIcon } from './icons.tsx';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  // The active tab's pill: sky for the map, orange for the sun pages, matching
  // the accent each page uses for its own controls.
  activePill: string;
  activeIcon: string;
}

const navLinks: NavItem[] = [
  { to: '/map', label: 'Map', icon: MapIcon, activePill: 'bg-sky-900', activeIcon: 'text-sky-300' },
  { to: '/sunrise', label: 'Sunrise', icon: SunriseIcon, activePill: 'bg-orange-900', activeIcon: 'text-orange-300' },
  { to: '/sunset', label: 'Sunset', icon: SunsetIcon, activePill: 'bg-orange-900', activeIcon: 'text-orange-300' },
];

const TAB_CLASS = 'flex flex-col items-center justify-center gap-1 text-xs';

/**
 * The page frame. On a desktop the pages are links in a header; on a phone they
 * move to a tab bar along the bottom, within reach of a thumb, and the map gets
 * the whole of the screen above it.
 */
export default function Layout() {
  const auth = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    // dvh rather than vh: on a phone 100vh is the height with the browser's own
    // toolbars hidden, which pushes the tab bar off the bottom of the screen.
    <div className="flex h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="hidden items-center justify-between border-b border-slate-800 px-4 py-3 md:flex">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold">Base Camp</span>
          <nav className="flex gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-sm ${
                    isActive ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <button
          type="button"
          onClick={() => void auth.signoutRedirect()}
          className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100"
        >
          Sign out
        </button>
      </header>

      {/* Relative, so the phone pages can lay full-screen views over the map. */}
      <main className="relative min-h-0 flex-1">
        <Outlet />
      </main>

      <nav
        aria-label="Pages"
        className="grid grid-cols-4 border-t border-slate-800 bg-slate-950 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {navLinks.map(({ to, label, icon: Icon, activePill, activeIcon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `${TAB_CLASS} h-16 ${isActive ? 'font-semibold text-slate-100' : 'text-slate-400'}`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full ${
                    isActive ? `${activePill} ${activeIcon}` : ''
                  }`}
                >
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((open) => !open)}
          className={`${TAB_CLASS} h-16 ${accountOpen ? 'font-semibold text-slate-100' : 'text-slate-400'}`}
        >
          <span
            className={`flex h-8 w-14 items-center justify-center rounded-full ${accountOpen ? 'bg-slate-800' : ''}`}
          >
            <UserIcon className="h-[22px] w-[22px]" />
          </span>
          Account
        </button>
      </nav>

      {accountOpen && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Close account menu"
            tabIndex={-1}
            onClick={() => setAccountOpen(false)}
            className="fixed inset-0 z-[1400]"
          />
          <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-2 z-[1401] w-48 rounded-2xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
            <button
              type="button"
              onClick={() => void auth.signoutRedirect()}
              className="flex h-12 w-full items-center rounded-xl px-4 text-left text-base text-slate-100 hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
