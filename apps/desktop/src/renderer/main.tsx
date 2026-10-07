import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { AppErrorBoundary } from './components/AppErrorBoundary.js';
import { setupRendererErrorCapture } from './utils/setupRendererErrorCapture.js';
import './styles/tokens.css';
import './styles/globals.css';
import './styles/layout.css';
import './styles/utilities.css';
import './ui/ui.css';
import './features/dashboard/project-dashboard.css';
import './features/test-runs/test-runs.css';
import './screens/projects/projects-screen.css';
import './screens/requirements/requirements-screen.css';
import './screens/auth/auth-screen.css';
import './screens/settings-screen.css';

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
