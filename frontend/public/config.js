// Runtime configuration placeholder.
//
// Local dev: this stays empty — values come from frontend/.env.local (VITE_* vars).
// Deployed container: docker/start.sh regenerates this file from environment
// variables at startup, so the same image can be reconfigured per-deployment
// without rebuilding the JS bundle.
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {};
