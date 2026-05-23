import BottomNav from '@/components/lockedin/BottomNav';
import ArcHeaderChip from '@/components/lockedin/ArcHeaderChip';
import { ErrorBoundary } from '@/components/lockedin/ErrorBoundary';
import ApiKeyGate from '@/components/lockedin/ApiKeyGate';

/**
 * Layout shared by all screens in the (app) route group.
 * ApiKeyGate blocks the app until a valid Gemini key is confirmed — the AI
 * coach is the brain of the app and is required for session generation.
 * ErrorBoundary catches unhandled React errors and shows a recovery UI.
 * ArcHeaderChip surfaces the active training arc on every screen.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ApiKeyGate>
        <ArcHeaderChip />
        {children}
        <BottomNav />
      </ApiKeyGate>
    </ErrorBoundary>
  );
}
