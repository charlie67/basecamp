import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from 'react-oidc-context';
import './index.css';
import App from './App.tsx';
import { oidcConfig } from './auth/oidcConfig.ts';
import { appConfig } from './config.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {appConfig.authEnabled ? (
      <AuthProvider {...oidcConfig}>
        <App />
      </AuthProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
