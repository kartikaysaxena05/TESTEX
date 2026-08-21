import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { AppErrorBoundary } from './components/AppErrorBoundary.js';
import { setupRendererErrorCapture } from './utils/setupRendererErrorCapture.js';
import './styles/tokens.css';
import './styles/globals.css';
import './styles/layout.css';
import './ui/ui.css';
import './features/dashboard/project-dashboard.css';

// Initialize global window and rejection listeners
setupRendererErrorCapture();

const container = document.getElementById('root');

if (!container) {
  throw new Error('Fatal: Failed to locate mounting root element "#root".');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
