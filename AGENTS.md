<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Longevity-first redesign (v8 / v9 schema)

This codebase shifted from a powerlifting-first app to a longevity-first one. The unifying abstraction is **Training Arcs** — athlete-named, persistent training contexts (e.g. "Get Healthy", "Back to Powerlifting", "New Dad / No Time") that wrap goals, priorities, constraints, and coach guidance.

Key invariants to preserve:
- **One ACTIVE arc at a time.** The coach reads it on every turn (see `buildArcSection` in `src/lib/ai/coach.ts`). Engine reads it from `getActiveArc()` in `src/lib/arcs/`.
- **Barbell and weighted-calisthenics strength are co-equal.** `/health/strength` shows both side-by-side. Never frame the app as powerlifting-only.
- **Default training goal is `LONGEVITY`**, not `COMPETITION_PREP`. Meet routes (`/meet/*`) are soft-gated by the active arc's `COMPETITION` priority — see `src/app/(app)/meet/layout.tsx`.
- **Injuries hard-filter the swap engine** via `applyInjuryFilters` in `src/lib/injuries/`. AthleteMemory(kind=INJURY) is a fallback annotation, NOT the source of truth.
- **Mobility lives in `src/lib/mobility/`**, parallel to (not under) `src/lib/exercises/`. The strength swap engine never sees mobility movements.

Architecture map:
- `src/lib/arcs/` — arc CRUD + presets + label maps
- `src/lib/injuries/` — injury CRUD + symptom logging + `applyInjuryFilters` (pure)
- `src/lib/mobility/` — library (~37 movements), 6 routine templates, rule-based generator, ROM tracking
- `src/lib/engine/longevity.ts` — composite score (7 pillars; pure pillar scorers + Dexie-backed orchestrator)
- `src/lib/ai/coach-cache.ts` — Gemini prompt cache lifecycle (foundation; sender wiring deferred to phase 6b)
- `src/app/(app)/health/` — longevity dashboard + cardio + injuries + strength
- `src/app/(app)/settings/arcs/` — arc management UI
- `src/app/(app)/mobility/` — daily flows + library + step-through runner

Schema versions: Dexie v8 added arcs / injuries / mobility / longevity; v9 added coach caching tables. Backup format v8 covers both. Migrations are in `src/lib/db/database.ts` — keep additive and never modify previous versions.

When adding a new entity that affects the coach's understanding of the athlete, wire `invalidateCache()` into the writer so the next coach turn rebuilds with fresh context.
