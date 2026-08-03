import {NavLink, Outlet} from 'react-router-dom';
import {useAuth} from 'react-oidc-context';

const navLinks = [
    {to: '/map', label: 'Map'},
];

export default function Layout() {
    const auth = useAuth();

    return (
        <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
            <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <div className="flex items-center gap-6">
                    <span className="text-lg font-semibold">Base Camp</span>
                    <nav className="flex gap-1">
                        {navLinks.map((link) => (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                className={({isActive}) =>
                                    `rounded px-3 py-1.5 text-sm ${
                                        isActive
                                            ? 'bg-slate-800 text-slate-100'
                                            : 'text-slate-400 hover:text-slate-200'
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
            <main className="min-h-0 flex-1">
                <Outlet/>
            </main>
        </div>
    );
}
