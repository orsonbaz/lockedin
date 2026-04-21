'use client';

/**
 * BottomNav — Fixed 6-tab navigation bar.
 * Appears on all screens inside src/app/(app)/layout.tsx.
 */

import { usePathname, useRouter } from 'next/navigation';
import {
  House, Dumbbell, Bot, TrendingUp, Target, Flame,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT  = '#D4844C';
const MUTED   = '#787882';
const BG      = '#1C1C1F';
const BORDER  = '#2E2E33';

// ── Tab definitions ───────────────────────────────────────────────────────────
interface Tab {
  label: string;
  icon:  LucideIcon;
  href:  string;
  /** Extra paths that also count as "active" for this tab */
  matchPrefixes?: string[];
}

const TABS: Tab[] = [
  {
    label:         'Home',
    icon:          House,
    href:          '/home',
  },
  {
    label:         'Session',
    icon:          Dumbbell,
    href:          '/session/today',
    matchPrefixes: ['/session/'],
  },
  {
    label:         'Nutrition',
    icon:          Flame,
    href:          '/nutrition',
    matchPrefixes: ['/nutrition/'],
  },
  {
    label: 'Coach',
    icon:  Bot,
    href:  '/coach',
  },
  {
    label: 'Progress',
    icon:  TrendingUp,
    href:  '/progress',
  },
  {
    label: 'Goals',
    icon:  Target,
    href:  '/goals',
  },
];

function isActive(tab: Tab, pathname: string): boolean {
  if (pathname === tab.href) return true;
  if (tab.matchPrefixes) {
    return tab.matchPrefixes.some((prefix) => pathname.startsWith(prefix));
  }
  return false;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BottomNav() {
  const pathname = usePathname();
  const router   = useRouter();

  return (
    <>
      {/* Spacer so content isn't hidden behind the fixed bar */}
      <div
        style={{
          height: `calc(72px + env(safe-area-inset-bottom, 0px))`,
        }}
        aria-hidden
      />

      {/* Fixed bar */}
      <nav
        style={{
          position:       'fixed',
          bottom:         0,
          left:           0,
          right:          0,
          height:         `calc(72px + env(safe-area-inset-bottom, 0px))`,
          paddingBottom:  'env(safe-area-inset-bottom, 0px)',
          backgroundColor: BG,
          borderTop:      `1px solid ${BORDER}`,
          zIndex:         50,
          display:        'flex',
          alignItems:     'stretch',
        }}
      >
        {TABS.map((tab) => {
          const active = isActive(tab, pathname);
          const Icon   = tab.icon;

          return (
            <button
              key={tab.href}
              type="button"
              onClick={() => router.push(tab.href)}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              style={{
                flex:           1,
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            '3px',
                border:         'none',
                background:     'none',
                cursor:         'pointer',
                padding:        '0 4px',
                WebkitTapHighlightColor: 'transparent',
                outline:        'none',
                transition:     'opacity 0.15s',
              }}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 1.8}
                color={active ? ACCENT : MUTED}
                style={{
                  filter: active
                    ? `drop-shadow(0 0 6px ${ACCENT}80)`
                    : 'none',
                  transition: 'color 0.15s, filter 0.15s',
                }}
              />
              <span
                style={{
                  fontSize:   '9.5px',
                  fontWeight: active ? 700 : 500,
                  color:      active ? ACCENT : MUTED,
                  lineHeight: 1,
                  letterSpacing: '0.01em',
                  transition: 'color 0.15s',
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
