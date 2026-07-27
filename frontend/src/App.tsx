import {useCallback, useEffect, useRef} from 'react';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import {useAuth} from 'react-oidc-context';
import Layout from './components/Layout.tsx';
import WorkoutsPage from './pages/WorkoutsPage.tsx';
import MapPage from './pages/MapPage.tsx';
import {setAccessToken} from './auth/token.ts';
import {appConfig} from './config.ts';

function Splash({label, onRetry}: { label: string; onRetry?: () => void }) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-300">
            <p className="text-sm">{label}</p>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="rounded bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700"
                >
                    Sign in
                </button>
            )}
        </div>
    );
}

function AppRoutes() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<Layout/>}>
                    <Route path="/workouts" element={<WorkoutsPage/>}/>
                    <Route path="/map" element={<MapPage/>}/>
                </Route>
                <Route path="*" element={<Navigate to="/workouts" replace/>}/>
            </Routes>
        </BrowserRouter>
    );
}

function AuthGate() {
    const auth = useAuth();
    const startedSignin = useRef(false);

    setAccessToken(auth.user?.access_token ?? null);

    const signIn = useCallback(async () => {
        await auth.removeUser();
        await auth.signinRedirect();
    }, [auth]);

    useEffect(() => {
        if (auth.isLoading || auth.isAuthenticated || startedSignin.current) {
            return;
        }
        startedSignin.current = true;
        void signIn();
    }, [auth.isLoading, auth.isAuthenticated, signIn]);

    if (auth.isLoading) {
        return <Splash label="Loading…"/>;
    }

    if (!auth.isAuthenticated) {
        return (
            <Splash
                label={auth.error ? `Sign-in failed: ${auth.error.message}` : 'Redirecting to sign in…'}
                onRetry={() => void signIn()}
            />
        );
    }

    return <AppRoutes/>;
}

export default function App() {
    if (!appConfig.authEnabled) {
        return <AppRoutes/>;
    }
    return <AuthGate/>;
}
