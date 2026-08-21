/**
 * @file apps/desktop/src/renderer/screens/OverviewScreen.tsx
 * Overview screen hosting the Project Dashboard.
 */

import React from 'react';
import { ProjectDashboard } from '../features/dashboard/index.js';

export function OverviewScreen(): React.JSX.Element {
  return <ProjectDashboard />;
}
