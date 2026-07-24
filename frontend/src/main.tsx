import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import WorkoutsPage from './pages/WorkoutsPage.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/workouts" element={<WorkoutsPage />} />
        <Route path="*" element={<Navigate to="/workouts" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
