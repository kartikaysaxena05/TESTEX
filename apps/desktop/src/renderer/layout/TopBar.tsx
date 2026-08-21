import { useLocation } from 'react-router-dom';
import { getRouteByPath } from '../navigation/navigation.js';
import { Badge, type BadgeVariant } from '../ui/index.js';

export type BridgeConnectionState = 'loading' | 'ready' | 'unavailable' | 'error';

interface TopBarProps {
  bridgeState: BridgeConnectionState;
}

export function TopBar({ bridgeState }: TopBarProps) {
  const location = useLocation();
  const currentRoute = getRouteByPath(location.pathname);

  const title = currentRoute ? currentRoute.title : 'Page Not Found';
  const subtitle = currentRoute
    ? currentRoute.description
    : 'The requested view does not exist in this workspace';

  const getStatusLabel = () => {
    switch (bridgeState) {
      case 'ready':
        return 'System Ready';
      case 'loading':
        return 'Connecting...';
      case 'unavailable':
      case 'error':
      default:
        return 'Desktop Unavailable';
    }
  };

  const getBadgeVariant = (): BadgeVariant => {
    switch (bridgeState) {
      case 'ready':
        return 'success';
      case 'loading':
        return 'warning';
      case 'unavailable':
      case 'error':
      default:
        return 'danger';
    }
  };

  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{title}</h1>
        <span className="topbar-subtitle">{subtitle}</span>
      </div>

      <div className="topbar-right">
        <Badge
          variant={getBadgeVariant()}
          dot
          role="status"
          aria-live="polite"
          title={`Desktop Bridge Status: ${getStatusLabel()}`}
        >
          {getStatusLabel()}
        </Badge>
      </div>
    </header>
  );
}
