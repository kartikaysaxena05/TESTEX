import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ScreenErrorBoundary } from '../components/ScreenErrorBoundary.js';

export function Workspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceRef = useRef<HTMLElement>(null);

  // Scroll to top upon navigating to a new route
  useEffect(() => {
    if (workspaceRef.current) {
      workspaceRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <main ref={workspaceRef} className="workspace" data-testid="workspace" tabIndex={-1}>
      <ScreenErrorBoundary key={location.pathname} onNavigateOverview={() => navigate('/overview')}>
        <Outlet />
      </ScreenErrorBoundary>
    </main>
  );
}
