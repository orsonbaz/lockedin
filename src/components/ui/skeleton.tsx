import { cn } from '@/lib/utils';

/**
 * Skeleton — pulsing placeholder for loading states.
 * Styled for the Lockedin dark theme.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-xl', className)}
      style={{ backgroundColor: '#2A2A4A' }}
      {...props}
    />
  );
}
