import { useNavigate } from 'react-router-dom';
import { EmptyState, Button } from '../ui/index.js';

export function NotFoundScreen() {
  const navigate = useNavigate();

  return (
    <EmptyState
      screenId="not-found"
      title="Page Not Found"
      description="The requested view does not exist in the software quality engineering platform."
      icon={
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      }
      action={
        <Button variant="primary" size="md" onClick={() => navigate('/overview')}>
          Return to Overview
        </Button>
      }
    />
  );
}
