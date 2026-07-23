import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRouter } from './app/AppRouter';
import { AuthSessionProvider } from './app/auth/AuthSessionProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthSessionProvider>
        <AppRouter />
      </AuthSessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
