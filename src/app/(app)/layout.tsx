import BottomNav from '@/components/lockedin/BottomNav';
import { ErrorBoundary } from '@/components/lockedin/ErrorBoundary';

/**
 * Layout shared by all screens in the (app) route group.
 * Renders the fixed BottomNav below every page.
 * The BottomNav itself inserts a spacer div so content is never hidden.
 * ErrorBoundary catches unhandled React errors and shows a recovery UI.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      {children}
      <BottomNav />
    </ErrorBoundary>
  );
}
