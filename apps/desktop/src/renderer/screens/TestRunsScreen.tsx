import { EmptyState } from '../ui/index.js';

export function TestRunsScreen() {
  return (
    <EmptyState
      screenId="test-runs"
      title="No Test Runs Recorded"
      description="Autonomous web test execution history, diagnostics, and test artifacts will appear here."
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
          <polygon points="10 8 16 12 10 16 10 8" />
        </svg>
      }
    />
  );
}
