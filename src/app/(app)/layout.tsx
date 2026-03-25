import BottomNav from '@/components/lockedin/BottomNav';

/**
 * Layout shared by all screens in the (app) route group.
 * Renders the fixed BottomNav below every page.
 * The BottomNav itself inserts a spacer div so content is never hidden.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
