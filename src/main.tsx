import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes/router';
import { registerServiceWorker } from './pwa';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

/**
 * Production only. In dev the worker would sit in front of Vite's module
 * graph and serve stale chunks, which is a confusing way to lose an hour.
 */
if (import.meta.env.PROD) registerServiceWorker();
