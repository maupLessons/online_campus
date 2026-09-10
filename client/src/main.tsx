import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import SessionBoundary from './components/SessionBoundary';
import './index.css';
import './i18n';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionBoundary>
        <App />
      </SessionBoundary>
    </BrowserRouter>
  </StrictMode>,
);
