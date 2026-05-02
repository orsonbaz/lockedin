/**
 * knowledge-base.ts — Coaching knowledge across powerlifting, calisthenics,
 * street lifting, and nutrition. Injected into the AI coach system prompt.
 *
 * All content is written in a compressed coaching-style format to minimize
 * token usage while maximizing information density.
 */

// ── Coaching Intelligence Framework (meta-layer: how to THINK) ────────────────
// Synthesised from Greg Nuckols, Chad Wesley Smith (JTS), Mike Tuchscherer (RTS),
// Marcellus "Millz" Wallace, Joey Flex, and Joe Stanek. Lives ABOVE the named-
// philosophy section (COACH_PRINCIPLES_KNOWLEDGE) — that one is what the
// coaches say; this one is how to reason as a coach across all of them.

export const COACHING_FRAMEWORK_KNOWLEDGE = `
## Coaching Framework — How to Think
You are a coach, not a program generator. Read signals, adapt in real time, serve the
athlete's long-term development above any single session.

### Coach's First Questions (run in order, every interaction)
1. State — readiness, HRV, sleep, subjective ratings before planning.
2. Goal & time horizon — meet date, phase, what we're building or expressing.
3. History — last 2-4 weeks. The training log is your most valuable data source.
4. What the body needs that the mind isn't asking for. Provide the perspective they can't.
5. The ONE thing this session must accomplish. Name it; protect it.

### Athlete Patterns (read beyond phenotype flags)
- Overshooter: ascending sets, reduced top-set RPE. Channel the drive, never shame.
- Undershooter: explicit permission to push. Modest intensity bumps.
- Inconsistent responder: lifestyle (sleep / nutrition / stress) drives variability —
  widen RPE windows, lean on readiness-based adjustment.
- Plateaued (3+ wk flat at same RPE): diagnose volume / stimulus variation / recovery /
  technique. A plateau is information, not a reason to add load.
- Post-meet: 1-2 weeks deload-equivalent. Honour motivation; protect long-term development.

### Think in PATTERNS, not exercises
Horizontal push, vertical push, vertical pull, horizontal pull, hip hinge, squat, core.
A pull-up and a lat pulldown are expressions of the same pattern. Pick the best
expression for THIS athlete in THIS context — equipment, fatigue, block, history.

### Session Design Hierarchy (reason in order; each constrains the next)
1. Recovery budget — readiness sets the outer constraint.
2. Primary purpose — name the ONE thing.
3. Patterns required — what must be present today.
4. Best exercise expression of each pattern.
5. Sets / reps / intensity — last, never first.
Non-negotiables: horizontal push every session (or noted absent); a pull every session;
≥2 patterns; primary > accessories in stimulus; PAIN (sharp / joint / neurological) →
no loading + flag for assessment.

### Three Levers of Progression
1. Load — primary mechanism for comp lifts.
2. Volume — primary mechanism in development phases and accessories.
3. Density / Complexity — shorter rest, pauses, harder variations. Especially for
   streetlifting (unweighted pull-up → weighted → muscle-up → ring muscle-up).

### Phase Intelligence
- Development: high volume, moderate intensity, exercise variation. Stalling
  technically? Extend the phase, do NOT add load.
- Intensification: gradual volume taper while intensity rises. Cutting volume 30%
  overnight = unintended deload.
- Realization: low volume, high intensity, comp-only. First week often feels weak —
  communicate this proactively; the strength is there, fatigue is clearing.
- Deload: 60-70% load, volume halved, should feel almost too easy. Run reactively
  AND proactively (every 4-6 weeks).
- Time-to-peak is individual (some 8-10 wk, some 14-16 wk). Calibrate over time.
- Don't advance phases on a fixed calendar — advance when the athlete is ready.

### Voice
Direct, honest, warm — in that order. Specific beats generic ("your deadlift stalled
because your lats aren't engaged at the start" beats "work on your technique").
Celebrate progress concretely. Ask "how did that feel?" after heavy sets. Treat the
athlete as an intelligent adult.

### Absolute Principles (invariants — when in conflict, principle wins)
1. Long-term development over short-term performance.
2. Pain (sharp / localised / joint / neurological) is a STOP signal, not training info.
3. Honesty is always in the athlete's interest. No comfortable lies.
4. Recovery IS training. Sleep / deloads / recovery sessions get the same respect as
   working sets.
5. Technique is priority one under fatigue. Form breaks → weight comes down or set ends.
6. The athlete's autonomy is respected. Present reasoning, not ultimatums.
7. Data informs but does not dictate. HRV / RPE / readiness are tools, not verdicts.
`;

// ── RPE & Load Management ─────────────────────────────────────────────────────

export const RPE_KNOWLEDGE = `
## RPE / RIR Framework
RPE (Rate of Perceived Exertion) scale 1-10 where 10 = absolute max effort, no reps left.
RPE 10 = 0 RIR (Reps In Reserve). RPE 9 = 1 RIR. RPE 8 = 2 RIR. RPE 7 = 3 RIR. RPE 6 = 4 RIR.
Half-points exist: RPE 8.5 means "maybe could have done 2 more, maybe only 1."

### Practical RPE Guidelines
- Accumulation blocks: RPE 6-8. Most work sets at RPE 7-8. Leaves recovery headroom for volume.
- Intensification blocks: RPE 7.5-9. Heavier loads, fewer reps. Push closer to limits.
- Realization/Peaking: RPE 8-9.5 on comp lifts. Singles at RPE 8-9 (not grinding). Practice commands.
- Deload: RPE 5-7 max. The point is active recovery. If it feels hard, go lighter.

### Common RPE Mistakes
- "RPE creep": Athletes gradually rate sets lower than actual effort. Fix: film sets, count grinding reps.
- Overshooting: Consistently hitting RPE 9-10 when programmed for 7-8. Fix: reduce load 5-10%, rebuild.
- Sandbagging: Always reporting RPE 6-7 with big jumps available. Fix: encourage 2.5kg jumps until RPE matches target.
- RPE on accessories: Less meaningful — use it as a rough gauge, not a precise tool.

### When to Autoregulate
- If readiness score < 50: Drop all RPE targets by 1.0. Reduce volume 20-30%.
- If RPE consistently 1+ above target for 2+ sessions: Suggest max retest or load reduction.
- If RPE consistently 1+ below target: Suggest max increase or load bump.
`;

// ── Periodization ─────────────────────────────────────────────────────────────

export const PERIODIZATION_KNOWLEDGE = `
## Periodization Models

### Block Periodization (Primary Model)
- ACCUMULATION (Hypertrophy): High volume, moderate intensity (65-75% 1RM). Sets of 4-8 reps. RPE 6-8.
  Goal: Build work capacity, muscle mass, and tendon resilience. Duration: 3-5 weeks.
- INTENSIFICATION (Strength): Moderate volume, high intensity (78-88% 1RM). Sets of 2-5 reps. RPE 7.5-9.
  Goal: Convert hypertrophy to maximal strength. Neural adaptations. Duration: 3-5 weeks.
- REALIZATION (Peaking): Low volume, very high intensity (88-100% 1RM). Singles and doubles. RPE 8-9.5.
  Goal: Express maximal strength. Dissipate fatigue while maintaining fitness. Duration: 1-4 weeks.
- DELOAD: 40-60% of normal volume, 60-70% intensity. RPE 5-7. Duration: 1 week.
  Goal: Supercompensate. Allow accumulated fatigue to dissipate. Do NOT skip deloads.

### DUP (Daily Undulating Periodization)
Within a week, vary rep ranges: Day 1 = heavy (3s), Day 2 = moderate (5s), Day 3 = light (8s).
Applied automatically when a lift appears 2+ times per week: second appearance gets +1 rep, -0.5 RPE.

### Fatigue Management Principles
- SFR (Stimulus-to-Fatigue Ratio): Prefer exercises that give the most stimulus per unit of fatigue.
  Competition lifts have highest specificity but also highest fatigue. Accessories should be low-fatigue.
- MRV (Maximum Recoverable Volume): The most sets/week you can recover from. Typically 15-25 sets per muscle group.
- MEV (Minimum Effective Volume): ~6-10 sets per muscle group per week to maintain.
- MAV (Maximum Adaptive Volume): Sweet spot between MEV and MRV where most growth occurs.
- Frequency: 2-4x per week per lift for intermediates. Higher frequency = lower volume per session.

### Week-to-Week Progression
- Accumulation: Add 1 set or 2.5kg per week (not both). Keep RPE within target range.
- Intensification: Add 2.5-5kg per week, maintain or slightly drop volume.
- Realization: Drop volume significantly (40-50% of accumulation). Intensity goes to near-max.
- Never increase both volume AND intensity simultaneously for more than 1 week.
`;

// ── Exercise Science ──────────────────────────────────────────────────────────

export const EXERCISE_KNOWLEDGE = `
## Competition Lifts — Technical Cues

### Squat
- Setup: Walk out in 3 steps max. Feet shoulder-width or slightly wider. Toes 15-30° out.
- Brace: Big belly breath into belt. Obliques push out. Create 360° pressure.
- Descent: "Sit back AND down." Hips and knees break simultaneously. Knees track toes.
- Depth: Hip crease below top of knee (IPF standard). Film from the side to check.
- Drive: "Push the floor away." Chest up. Knees out. Drive hips forward at top.
- Common errors: Forward lean (weak quads or poor ankle mobility), knee cave (weak adductors/glutes), butt wink (hip mobility or going too deep).
- Weak point fixes (dosed — sets × reps @ RPE, weekly frequency):
  - Weak out of hole: Pause squat 4×4 @ RPE 7, 1×/wk for 4-6 weeks. Or pin squat 3×3 @ RPE 7.5 as intensification variant.
  - Sticking point mid-range: Tempo squat (4-1-0) 3×5 @ RPE 7, 1×/wk. Front squat 3×5 @ RPE 7 on a second squat day.
  - Forward lean: Front squat or SSB 4×6 @ RPE 7 for 6+ weeks; heel-elevated paused squat if ankle mobility is the cause.
  - Knee cave: Banded pause squat 3×5 @ RPE 7, 1×/wk; adductor machine 3×12; single-leg press 3×10 per leg.
  - Form breakdown rep-to-rep within a set: knees cave, hips shoot, depth shortens — volume is done. Move to backoffs or end the working sets, regardless of what reps remain on the card.

### Bench Press
- Setup: Arch (natural thoracic extension, NOT lumbar). Shoulder blades retracted and depressed ("in your back pockets").
- Grip: Ring finger on rings (standard), or adjusted for arm length. Wrists straight or slightly cocked back.
  - Short arms (<6' / <75" wingspan): Try one notch inside the rings for more tricep leverage.
  - Long arms (>78" wingspan): Widen to rings exactly; a narrower grip increases bar path distance.
- Touch point: Just below nipple line (xiphoid process area). Varies by arch and arm length.
- Drive: Leg drive — feet flat (IPF) or on toes (some feds). Press back toward face off chest, then straight up.
- Pause: On competition commands — "Start," "Press," "Rack." Practice with a 1-2 second pause.
- Federation arch rules: IPF requires butt contact with bench throughout. USAPL same. USPA allows hips lifting in some divisions — check your rulebook. Too much lumbar hyperextension risks facet irritation; aim for thoracic extension.
- Common errors: Flaring elbows too early (shoulder stress), uneven press, losing leg drive.
- Weak point fixes (dosed):
  - Weak off chest: Spoto press 4×4 @ RPE 7, 1×/wk for 4-6 weeks. Rotate with long-pause bench (3 sec pause) 3×3 @ RPE 8.
  - Weak at lockout (grinds at arms-extended): Pin press 3×3 @ RPE 7.5 OR board press 3×3 @ RPE 7-8, 1×/wk for 4-6 weeks.
  - Uneven press (bar drifts / one side stalls): DB bench 3×8 per side 1×/wk for 4-6 weeks. Film every top set.
  - Shoulder pain: Widen grip 1 finger, improve arch, swap comp bench → floor press for 2-4 weeks; add external rotation (band or DB pullover) 3×15 twice a week.
  - Triceps lag pressing: CGBP 4×6 @ RPE 7 + dips 3×8 @ RPE 7, 1 session/wk.

### Deadlift
- Conventional setup: Feet hip-width. Shins 1" from bar. Grip just outside knees. "Push the floor away."
- Sumo setup: Wide stance (toes reach plates). Grip inside knees. "Spread the floor." Hips close to bar.
- Brace: Same belly breath as squat. Lock lats ("protect your armpits" / "bend the bar around your shins").
- Pull: Bar stays against body entire pull. Hips and shoulders rise together. Lock hips, don't hyperextend.
- Common errors: Hips shooting up (weak quads or starting hips too low), rounded upper back (weak lats), hitching.
- Weak point fixes (dosed):
  - Weak off floor: Deficit deadlift (1-2") 4×3 @ RPE 7, 1×/wk for 4-6 weeks. Or pause deadlift 2" off floor 3×2 @ RPE 7.5 as intensification variant.
  - Weak at lockout (hitch or grind mid-shin to lockout): Block pull (2-4") 3×3 @ RPE 7, 1×/wk for 4-6 weeks. Add heavy barbell rows 4×6 @ RPE 7.
  - Upper back rounding: Pause deadlift 3×2 @ RPE 7 + heavy rows 4×5 @ RPE 8, 1×/wk for 6+ weeks.
  - Grip failure: Hook grip (learn it now), heavy static holds 3×20s @ 110% DL weekly, fat-grip farmer's walks 3×30m.
  - Hips shoot up: Pause deadlift, front squat 3×5 @ RPE 7 1×/wk (quad strength), focus on position rehearsal from the floor without load.

## Accessory Exercise Roles

### Posterior Chain
- Romanian Deadlift (RDL): Hamstring and glute hypertrophy. Eccentric overload. ~85% of deadlift max. Use 6-12 reps.
- Good Mornings: Hip hinge pattern, spinal erectors. Lower loads. Good for accumulation blocks.
- Hip Thrusts: Glute isolation. High reps (8-15). Doesn't load spine. Good for recovery days.
- Glute Ham Raise: Hamstring curl + hip extension. Bodyweight is challenging. Build to weighted.

### Quads
- Leg Press: 1.25x squat max capacity (favorable leverage). High volume without spinal load. Great accumulation tool.
- Belt Squat: Squat pattern without spinal loading. Excellent for high-frequency programs.
- Front Squat: Quad-dominant squat, forces upright posture. ~85% of back squat. Great carryover.
- Bulgarian Split Squat: Unilateral. Fixes imbalances. 6-12 reps. Builds hip stability.

### Upper Back & Lats
- Barbell Row: ~95% of bench press capacity. Crucial for bench stability and deadlift lockout. 5-8 reps.
- Pull-ups/Chin-ups: Lat strength for deadlift. Add weight when bodyweight becomes RPE < 7.
- Lat Pulldowns: High-rep lat work. Less systemic fatigue than rows. 10-15 reps.
- Face Pulls: Rear delt and rotator cuff health. Every session, 15-20 reps. Non-negotiable.

### Pressing Accessories
- Close-Grip Bench: Tricep-dominant pressing. 2-3" narrower than comp grip. Great for lockout weakness.
- Overhead Press: Shoulder and tricep strength. ~65% of bench max. 5-8 reps. Builds pressing base.
- Dumbbell Bench: Unilateral pressing. Fixes imbalances. Longer ROM. 8-12 reps.
- Dips: High carryover to bench. Bodyweight to weighted. Watch shoulder tolerance.

### Core & Stability
- Hanging Leg Raises: Anti-extension. Bracing practice. 10-15 reps.
- Pallof Press: Anti-rotation. Light bands. Trains obliques in bracing context.
- Ab Wheel Rollouts: Anti-extension under load. Transfers to squat and deadlift bracing.
- Farmer's Walks: Grip, traps, core, conditioning. 30-60 second walks. Heavy.
`;

// ── Calisthenics / Bodyweight Strength ────────────────────────────────────────

export const CALISTHENICS_KNOWLEDGE = `
## Calisthenics & Bodyweight Strength

### Core Principles
- Progressive overload in calisthenics = harder leverage or added weight, not just more reps.
- Two qualities to train: MAX STRENGTH (low reps, hard levers, weighted) and SKILL (position, tension, balance). Program them on separate days when possible.
- RPE applies to weighted variants. For pure bodyweight + skill work, use REPS IN RESERVE or HOLD QUALITY (shaky = stop).
- Tendons adapt slower than muscle. Level up only when current level is clean for 3 sets of prescribed reps/holds.

### Scapular Foundations (non-negotiable)
- Hollow body: Ribs down, pelvis tucked, lower back flat on floor. Trains anterior chain + bracing. 3x30s holds.
- Arch / Superman: Mirror of hollow — glutes squeezed, chest lifted. 3x20s.
- Scap pull-ups: Dead hang → retract and depress shoulder blades (no arm bend). 3x8-10. Prerequisite for ALL pulling work.
- Scap push-ups: Plank → protract and retract shoulders. 3x10-12. Prerequisite for planche work.
- Dead hang: Build to 60s unbroken before loading pull-ups heavily.

### Pull-up Family (weighted progression)
- Ring finger on bar, full dead hang bottom, chin OVER bar (not just to).
- Standards: 5 strict unweighted → start adding load. Typical intermediate: +20-30 kg x 5.
- Sets/reps: Strength 4-6 sets x 3-5 reps @ RPE 7-8. Volume 3-4 sets x 6-8 reps.
- Chin-ups (supinated) are ~10% stronger than pull-ups and emphasize biceps more.
- Archer pull-ups → one-arm pull-up assist progression: archer clean x 5/side → band-assisted one-arm → full OAPU.

### Dip Family (weighted progression)
- Parallel bar dips: Shoulders above elbows at bottom, full lockout top. Lean forward for chest, upright for triceps.
- Ring dips: ~30% harder than bar dips due to stabilization. Turn palms out at top ("RTO"). Great for planche carryover.
- Standards: 8-10 strict bar dips → load. +40 kg x 3 is a strong benchmark.
- Bulgarian dips (rings, straight arm drop) and Russian dips are advanced variants.

### Muscle-Up (strict / street lifting style)
- Prerequisites: 10 strict pull-ups (chest to bar), 8 strict bar dips, false-grip dead hang 20s.
- Skill breakdown: EXPLOSIVE PULL (hips to bar, elbows high) → TRANSITION (elbows over, wrists rotate) → STRICT PRESS-OUT.
- Common faults: kipping the pull (illegal in street-lift comps), chicken-wing transition (one arm early), failing the press-out (weak dips).
- Progressions: Banded MU → negative MU (slow lower from top) → slow 3s eccentric x 3-5 → strict bar MU.
- Weighted muscle-ups: Once you own 3 strict reps unweighted, add 5 kg and rebuild. Typical world-class: +40 kg.
- Programming: 2x/week. Day 1 = heavy weighted pull + dip accessory. Day 2 = strict MU reps (3-5 sets x 2-3 reps).

### Front Lever
- Straight-body isometric pull (bodyweight hangs parallel to floor, face up).
- Progression ladder (hold each 3x10s clean before advancing):
  1. Tuck front lever (knees to chest)
  2. Advanced tuck (hips open, knees tucked)
  3. Single-leg (one leg extended)
  4. Straddle
  5. Full front lever
- Scapular position: DEPRESSED + PROTRACTED. "Push the bar down toward your hips."
- Strength work: 3-5 sets of 5-10s holds at hardest clean progression. Ice-cream makers (eccentric FL pulls) once level unlocks.
- Pull-up carryover: full FL ≈ +35-40 kg weighted pull-up strength.

### Planche
- Straight-body isometric push (bodyweight horizontal, face down, hands pressing floor).
- Progression ladder (3x10s clean before advancing):
  1. Planche lean (hands forward of shoulders, feet on floor)
  2. Tuck planche
  3. Advanced tuck
  4. Straddle
  5. Full planche
- Scapular position: PROTRACTED + DEPRESSED. "Push the floor away and long."
- Wrist prep mandatory: 2-3 min of wrist rolls, extension, and finger pushes before any planche work. Wrists are the #1 injury site.
- Pair with pseudo planche push-ups (PPPU) 3-4 sets x 5-8 for pressing strength.

### Pistol Squat
- Single-leg squat, working leg fully extended in front, full ROM (hamstring to calf).
- Prerequisites: adequate ankle dorsiflexion, hip flexor strength, quad strength.
- Progressions: Box pistol (sit and stand) → hand-assisted pistol → counterweight pistol (hold 2-5 kg DB in front) → unassisted → weighted pistol (weight vest or goblet).
- Common faults: Heel lift (ankle mobility), collapse at bottom (quad weakness), knee cave (glute/adductor weakness).
- Programming: 3-4 sets x 3-5 per leg. Add 2-5 kg when 5x5 feels RPE 7.

### One-Arm Pull-Up (OAPU)
- The ultimate upper-body calisthenics strength marker.
- Prerequisites: 20+ strict pull-ups, +50% BW weighted pull-up x 5, 10+ archer pull-ups per side clean.
- Progression: Archer → typewriter → uneven (one arm on towel/band) → band-assisted OAPU → negative OAPU → full OAPU.
- Training: Low volume, high intensity. 4-6 sets x 1-3 reps total per session, 2x/week max. Elbow tendinopathy risk is real.

### Volume / Recovery Norms
- Isometric skill work (levers, planche) recovers faster than weighted work. Can train 3-4x/week.
- Weighted pull-up / dip / MU: treat like strength lifts. 6-10 working sets per week per movement.
- Grip work from pulls and hangs accumulates — deload wrists and elbows every 4-6 weeks.
- If wrist/elbow pain > 2 weeks: drop volume 40%, add eccentric wrist curls + reverse wrist curls x 3 sets x 15 daily.

### False Grip (for rings / strict MU)
- Wrist flexed so the meaty part of the palm is ON TOP of the ring/bar.
- Condition gradually: 10s holds x 3-4 → 20s → 30s dead hang in false grip. Build over 6-8 weeks. Skin and wrist flexors need time.
`;

// ── Street Lifting ────────────────────────────────────────────────────────────

export const STREET_LIFT_KNOWLEDGE = `
## Street Lifting (Competitive Weighted Calisthenics)

### Governing Bodies & Rules
- IFBSL (International Federation of Bar Sport Lifting) — most recognized, 3-lift total.
- WSWCF (World Street Workout & Calisthenics Federation) — also runs competitive formats.
- Standard three lifts (vary by federation, but most common):
  1. Weighted pull-up (strict dead hang to chin over bar)
  2. Weighted dip (parallel bars, shoulders below elbows at bottom, full lockout top)
  3. Weighted muscle-up (strict, no kip, full lockout at top)
- Some feds run squat + pull-up instead of all three pulls. Always verify the rulebook for your meet.

### Attempt Commands (IFBSL-style)
- Pull-up: start from dead hang, chin clearly OVER bar, "down" command to lower. No kipping. Feet must not touch anything.
- Dip: elbows must reach 90° or below at the bottom (shoulder below elbow). Lockout signaled, then "down."
- Muscle-up: start from full dead hang. Full transition, STRICT press-out, lockout signaled. No kip, no chicken-wing, no re-grip.

### Attempt Selection
- Same rule as powerlifting: opener = 88-92% of true max (guaranteed on worst day). 2nd = 95-99%. 3rd = PR attempt.
- MU attempts are the highest-risk lift — miss rates are higher than pull-up / dip because a failed transition = no lift.
- Conservative MU opener. You get the dip and pull-up eaten out with a missed MU, but a bombed MU is a total bomb.

### Gear & Grip
- Chalk: standard and legal everywhere.
- Wrist wraps: usually allowed. Tighter wraps help dip lockout.
- Belt with dip belt chain: weight hangs from a sturdy dip belt; use carabiners rated for the load.
- Straps: usually NOT allowed in competition pull/MU. Train strap-less for comp specificity.
- Grip width: pull-up typically shoulder-width to slightly wider. Narrower = more biceps, wider = more lat leverage.
- Bar vs ring dip: bar is standard in meets (more stable, more weight). Use ring dips in training for carryover + shoulder health.

### Programming Blueprint (Hybrid w/ Powerlifting)
- 4-6 weeks accumulation: higher reps (6-10), moderate load. Tons of volume on pull-ups and dips.
- 3-5 weeks intensification: 3-5 rep work at RPE 8-9. Introduce heavy MU singles.
- 2-3 weeks peak/realization: doubles and singles. Practice commands with a partner calling "down."
- Keep squat OR deadlift in the plan on non-street-lift days — helps total-body strength and lockout.

### Common Street-Lift Weaknesses & Fixes
- Weak off the dead hang (pull-up): scap pull-ups, pause mid-range pull-ups, heavy rows.
- Weak transition (MU): slow 3s eccentric MUs, banded assistance MUs, explosive pull-to-sternum reps.
- Weak press-out (MU): Russian dips, heavy weighted dips, close-grip bench press.
- Weak lockout (dip): bench lockouts, triceps pushdowns, board dips (top-half only).
- Elbow tendinopathy: drop volume 30%, eccentric wrist curls x 3x15 daily, reduce grip-crushing work.

### Weight Class Management
- Most feds use body-weight classes similar to calisthenics federations (55, 60, 65, 70, 75, 82.5, 90, 100, +100 kg).
- Relative strength favors lower classes — weighted MU at +BW scores higher in relative-strength rankings.
- Walking 1-3% above class is fine. Don't aggressively cut before a street-lift meet — it crushes pull-up performance faster than squat.
`;

// ── Nutrition for Strength Athletes ───────────────────────────────────────────

export const NUTRITION_KNOWLEDGE = `
## Nutrition for Strength Athletes

### Caloric Needs
- Maintenance: ~15-17 kcal/lb bodyweight for active lifters (varies by activity, metabolism, age).
- Gaining phase: +300-500 kcal above maintenance. Aim for 0.25-0.5% bodyweight gain per week.
- Cutting phase: -300-500 kcal below maintenance. Aim for 0.5-1% bodyweight loss per week.
- Competition cut (water manipulation): ONLY for 24-hour weigh-in. Not recommended for 2-hour weigh-in.
- Never cut aggressively during intensification or realization blocks — performance WILL suffer.

### Macronutrient Targets
- Protein: 1.6-2.2 g/kg bodyweight. Higher end during cuts. Distribute 4-5 meals.
  For an 83kg lifter: 133-183g protein/day. Aim for ~40g per meal across 4 meals.
  Sources: chicken breast (31g/100g), eggs (6g each), Greek yogurt (10g/100g), whey (25g/scoop), beef (26g/100g), fish (20-25g/100g), tofu (8g/100g).
- Carbohydrates: 3-7 g/kg bodyweight. Higher on training days, lower on rest days.
  For an 83kg lifter: 250-580g carbs/day. Training days toward higher end.
  Pre-workout (2-3h before): 1-2g/kg carbs. Oats, rice, pasta, bread, fruit.
  Intra-workout: Optional, 30-60g fast carbs for sessions > 90 min.
  Post-workout: 1-1.5g/kg carbs + 0.4g/kg protein within 2 hours.
  Sources: rice, oats, potatoes, pasta, bread, fruit, granola.
- Fat: 0.7-1.2 g/kg bodyweight. Don't go below 0.5g/kg — hormonal health suffers.
  For an 83kg lifter: 58-100g fat/day.
  Sources: olive oil, nuts, avocado, eggs, fatty fish, cheese.

### Weight Class Management
- Competition weight class is ceiling, not target walking weight.
- Walk around 2-5% above weight class. More for 24h weigh-in, less for 2h.
- Water cut protocol (24-hour weigh-in only):
  - 7 days out: Increase water to 8-10L/day. Normal sodium.
  - 4 days out: Maintain high water. Start reducing sodium.
  - 2 days out: Reduce water to 2L. Very low sodium.
  - 1 day out: Sip only. Hot bath/sauna if needed. Track weight hourly.
  - Post weigh-in: Rehydrate with electrolytes (Pedialyte/oral rehydration salts), carb-load.
- For 2-hour weigh-in: Do NOT water cut more than 1-2%. You won't recover in time.
- Better to go up a weight class than to cut poorly and lose strength.

### Supplements (Evidence-Based Only)
- Creatine monohydrate: 5g/day. Most studied supplement. +5-10% strength. Take daily regardless.
- Caffeine: 3-6mg/kg, 30-60 min pre-workout. ~200-500mg for most lifters. Cycle if tolerance builds.
- Vitamin D: 2000-5000 IU/day if blood levels < 30 ng/mL (common in indoor athletes).
- Omega-3: 2-3g EPA+DHA/day. Anti-inflammatory. Joint health.
- Magnesium: 300-400mg/day. Sleep, recovery, muscle function. Take at night.
- Everything else (BCAAs, pre-workout blends, test boosters) is largely unnecessary if diet is solid.

### Meal Timing Around Training
- Pre-training meal: 2-3 hours before. Protein + carbs + low fat. Example: chicken + rice + veggies.
- If short on time (< 1 hour): Small easily digestible snack — banana + whey shake, rice cakes + honey.
- Post-training: Protein + carbs within 2 hours. The "anabolic window" isn't 30 minutes, but don't wait 6 hours.
- Before bed: Casein protein or Greek yogurt. Slow digestion supports overnight recovery.
- Don't train fasted if session > 60 min or includes heavy compounds. Performance drops significantly.

### Cutting for a Meet
- Start cut 12-16 weeks out minimum. More gradual = less strength loss.
- During accumulation: Can tolerate mild deficit (-300 kcal). Volume is high, some fat loss is fine.
- During intensification: Return to maintenance or slight deficit (-200 kcal max). Prioritize performance.
- During realization/peak week: EAT AT MAINTENANCE OR ABOVE. This is not the time to diet.
- If more than 5% above weight class 4 weeks out: Consider moving up a class.

### Refeed Days (Strategic Carb Spikes)
- WHAT: A planned 24-hour return to maintenance (or slight surplus) with carbs dialed WAY up and fat dialed DOWN. Protein unchanged.
- WHY: Replenishes muscle glycogen, bumps leptin (the master hormone that drops during a cut and slows metabolism), rescues performance on hard training days, and improves diet adherence.
- WHEN: Mid-to-late cut, on a training day, never during realization / peak week.
- FREQUENCY:
  - Small deficit (< 20% below maintenance): every 10-14 days, leaner athletes (< 12% BF M / 18% F).
  - Moderate deficit (20-25%): every 7-10 days.
  - Aggressive deficit (25%+): every 5-7 days. Athletes who compete at lower BF% also need refeeds more often.
- EXECUTION:
  - Calories: back to maintenance or ~+200. DON'T binge above that — the goal is a leptin + glycogen bump, not a cheat day.
  - Carbs: +40-80% vs cut days (often 5-8 g/kg). Low-fiber sources: white rice, potatoes, white bread, sushi rice, dextrose.
  - Fat: cut in HALF (~0.5 g/kg). High-fat refeeds blunt the leptin response.
  - Protein: unchanged at 1.8-2.2 g/kg.
- Two-day refeeds are also valid for deep cuts — but no more than 2 consecutive days or it's a diet break.

### Diet Breaks (Planned Structured Breaks from a Cut)
- WHAT: 7-14 consecutive days at maintenance calories, NORMAL macros (not a refeed skew). Used in the middle of a long cut.
- WHY: Restores leptin, thyroid hormones, NEAT (non-exercise activity thermogenesis), and psychological bandwidth. Preserves muscle and metabolic rate.
- WHEN: Every 8-12 weeks during a long cut. Or any time you feel fatigue accumulating / performance dropping / obsessive food thoughts.
- NOT a binge. It's structured maintenance. You'll see scale weight bump 1-2 kg from glycogen + gut fill within 48h — that's normal and expected.
- Typically the break ends with better training performance, lower hunger, and resumed fat loss at the previous rate.

### Sodium & Water Protocol (Meet Week, Both Formats)
- 10-14 days out: Start tracking sodium. Eat high-sodium (5-7 g/day). Drink high water (8-10 L/day). Body will adapt by reducing aldosterone (water-retention hormone).
- 24-HOUR WEIGH-IN (conservative 2-3% cut):
  - 3-4 days out: Drop sodium to ~2 g/day. Keep water at 6-8 L/day.
  - 24h out (weigh-in day): Water to 0.5-1 L, light foods, finish eating 4-6h before weigh-in.
  - Post weigh-in rehydration: 1-1.5 L electrolyte drink over 2 hours (Pedialyte + sodium), then slow carb-loading with rice, potatoes, salt-topped foods. Aim to regain 80-90% of lost weight in 16 hours.
- 2-HOUR WEIGH-IN: Absolute maximum 1-1.5% water cut. Minimize sodium manipulation. You can't refill in 2 hours without cramping on platform.
- ALWAYS test the cut in training 6-8 weeks out. Never debut a water cut on meet day.

### Intra-Workout Fueling (Long Sessions)
- Session < 60 min: No intra-workout nutrition needed. Pre-workout meal covers it.
- Session 60-90 min: Electrolytes (500-750 ml water + 200-300 mg sodium). Carbs optional.
- Session 90+ min (high-volume block or split day): 30-60 g fast carbs / hour (Gatorade, dextrose, Gummy Bears, rice cakes). Prevents the mid-session crash that inflates RPE.
- Meet day: Gummy bears and electrolyte drink between attempts. Familiar foods only.

### Pre-Training Caffeine (Optimized for Strength)
- Dose: 3-6 mg/kg bodyweight, 45-60 min before the first heavy set. For 80 kg lifter: 240-480 mg.
- Half-life: 4-6 hours (genetically variable). A 400 mg dose at 4pm = ~200 mg still active at 10pm — CAN destroy sleep.
- Multi-lift meet day: Smaller dose at squat, top-up before bench and/or deadlift. Don't exceed 6 mg/kg total or heart rate and handling suffer.
- Tolerance: If you're using caffeine daily, cycle off 7-10 days before a meet to restore sensitivity. Use 200 mg on training days only during the off-cycle, then redose for the meet.
- Tolerate well: theanine 200 mg + caffeine 200 mg smooths jitter.

### Maintenance Calorie Heuristics
- Too tired to add weight, scale stable, training stagnant → you're probably at maintenance but eating below. Bump 150-200 kcal and retest for 2 weeks.
- 2 weeks of true stable weight (5-7 day rolling average within ±0.3 kg) + stable performance = that's your maintenance number.
- Most strength athletes underestimate TDEE. Bump calories before you bump training volume.

### Nutrition for Calisthenics / Street Lifting
- Relative strength matters most. Don't bulk recklessly — every extra kg of body weight is a kg you pull on every weighted pull-up.
- Recomp (simultaneous lean mass gain + fat loss) is MORE achievable for calisthenics athletes than strength-only lifters, because bodyweight movements reward leanness.
- Carb targets can be lower (3-5 g/kg) if volume is moderate — isometric and skill work is less glycolytically demanding than heavy squat volume.
- Protein: 2.0-2.4 g/kg is NOT excessive during a cut — keeping protein high preserves relative strength.
- For weighted MU / pull-up progress: small surplus (+150-250 kcal) with tight protein works better than aggressive bulks. Extra fat = friction on every rep.

### Hydration Math (Year-Round)
- Baseline: 35-40 ml/kg/day for sedentary. Strength athletes: 45-55 ml/kg/day.
- Add 500-750 ml for every hour of training.
- Urine color: pale straw = hydrated. Dark yellow = under-hydrated. Clear = potentially over-hydrated (waste of electrolytes).
- Sodium: 3-5 g/day for active training. Most athletes under-salt food, then cramp and blame it on magnesium.

### Leucine Threshold (per-meal MPS)
- Each meal should hit ~2.5-3.0 g leucine to maximally stimulate muscle protein synthesis.
- ~30-40 g of whey, or ~120-150 g cooked lean beef / chicken breast / tilapia clears the threshold.
- Vegan athletes need ~40-50% more total protein because plant sources are leucine-poor per gram;
  supplement with pea + rice blends or add 5 g extra leucine to plant-heavy meals.
- Meal distribution: 4-5 leucine-threshold meals / day > 2-3 bigger meals. MPS peaks for ~3-4 h
  after a meal — spacing matters.

### Creatine — Protocol Details
- 3-5 g / day, every day, taken whenever is convenient. Timing doesn't matter.
- Loading (20 g/day split × 4 doses for 5-7 days) gets you to saturation faster; not necessary.
  5 g/day reaches the same saturation in ~3-4 weeks.
- ~20% of people are non-responders (muscle creatine already high from diet or genetics).
  If 8+ weeks of compliant loading yields no strength bump, don't chase — your baseline is high.
- Water retention: creatine pulls ~1-2 kg of intramuscular water. Account for this in weight cuts;
  consider pausing creatine 7-14 days before weigh-in and resuming after.
- Creatine + caffeine myth: no evidence they conflict. Take both if you use both.

### Caffeine — Half-Life + Tolerance
- Half-life: ~5 h typical, but ranges 3-9 h. Genetics (CYP1A2), liver function, and medication
  dramatically shift this.
- Oral contraceptives roughly DOUBLE caffeine half-life — dose lower if on the pill.
- Pregnancy doubles half-life too; flouroquinolone antibiotics slow clearance.
- Dose: 3-6 mg / kg body weight, 30-60 min pre-training. Don't exceed your normal tolerance on
  meet day — novel high doses spike anxiety.
- Tolerance reset: 7-10 days off rebuilds sensitivity. Alternatively, cycle 5 days on / 2 days off.
- Cutoff: stop caffeine ≥ 6 h before target sleep for most; sensitive responders need 8-10 h.

### Weight-Cut Safety Band
- Aggressive cuts (water manipulation for 24h/2h weigh-in): only for athletes above ~15% body fat
  (men) / ~22% (women). Below that, aggressive cuts tank CNS performance.
- Sustainable cut rate: 0.5-0.75% body weight / week. Leaner athletes hug the low end.
- Minimum kcal: never below 30 kcal/kg FFM (fat-free mass) without medical supervision.
- Signs the cut has gone too far: HRV drops > 15% for 3+ days, morning resting HR up > 5 bpm,
  libido drops, cold hands/feet, strength plateau despite RPE targets. Pause the deficit or add
  a diet break at maintenance for 7-14 days.
- Don't cut and peak simultaneously. If a meet is inside 4 weeks and you need to drop > 2% body
  weight, move up a class or withdraw.

### Intra-Workout Sodium (sessions > 90 min or hot venues)
- Target 300-500 mg sodium per hour of training.
- Practical: 500 mL electrolyte drink (LMNT, Pedialyte, 1/4 tsp table salt in water with a pinch
  of potassium) per hour. Sip, don't chug.
- Signs you under-sodium: early-session fatigue, headaches, cramps that return after stretching,
  dizziness on heavy attempts. More sodium beats more magnesium for most lifters.
`;

// ── Recovery ──────────────────────────────────────────────────────────────────

export const RECOVERY_KNOWLEDGE = `
## Recovery

### Sleep
- 7-9 hours for strength athletes. Below 7h: testosterone drops, cortisol rises, RPE inflates.
- Consistent bed/wake times matter more than total hours. Shift work lifters: protect sleep windows.
- Pre-sleep: No caffeine after 2pm. No screens 30-60 min before bed (or use blue light filter). Cool room (65-68°F / 18-20°C).
- Naps: 20-30 min power naps are beneficial. Don't nap > 60 min — disrupts nighttime sleep.

### Stress Management
- Training IS stress. Life stress + training stress share the same recovery pool.
- High life stress periods: Reduce training volume 20-30%, maintain intensity. Don't add MORE training to "cope."
- Readiness score integrates stress metrics. Trust the score — if it says rest, rest.
- Active recovery on rest days: Walking, light stretching, foam rolling. NOT CrossFit or intense cardio.

### HRV (Heart Rate Variability)
- Higher HRV = better parasympathetic recovery = more training capacity.
- Measure HRV first thing in the morning, before coffee, lying down. Same conditions daily.
- Trend matters more than single readings. 7-day rolling average is the gold standard.
- HRV dropping > 15% below baseline for 3+ days = training load is too high OR external stress is elevated.
- HRV consistently rising while training is progressing = good sign, adaptation is happening.

### Soreness & Pain
- DOMS (Delayed Onset Muscle Soreness): Normal, especially after new exercises or eccentric work. Not an indicator of a good workout.
- Joint pain: NOT normal. Sharp pain, clicking with pain, or pain that worsens during the session = modify exercise or reduce load.
- Tendinopathy (tendon pain): Reduce load by 20%, maintain frequency. Tendons adapt to load, NOT rest.
- If pain persists > 2 weeks despite modification: See a sports physiotherapist. Don't train through it.
- Recovery modalities: Cold water immersion blunts hypertrophy (bad during accumulation, okay during peaking). Contrast baths are fine. Massage is nice but doesn't "break up scar tissue" — it reduces perceived fatigue.
`;

// ── Meet Preparation ──────────────────────────────────────────────────────────

export const MEET_PREP_KNOWLEDGE = `
## Meet Preparation

### Peaking Timeline
- 4 weeks out: Last heavy session. Hit openers for triples at RPE 8.
- 3 weeks out: Reduce volume 30-40%. Hit openers for singles at RPE 7-8.
- 2 weeks out: Reduce volume 50-60%. Light singles. Practice commands.
- 1 week out (meet week): Monday/Tuesday — openers as singles, RPE 7. Light accessories only. Rest Wednesday-Friday.
- Meet day: Warm up efficiently (60%, 70%, 80%, 87%, opener). Don't waste attempts in warmup room.

### Attempt Selection Strategy
- Opener (1st attempt): 100% chance of success. Something you can triple on your worst day. ~88-92% of max.
  Purpose: Get on the board. Build confidence. Get a total.
- 2nd attempt: Conservative PR attempt or "comfortable heavy." ~95-99% of max.
  Purpose: Build total. Only jump 5-7.5% from opener.
- 3rd attempt: Go for it. Small PR or match PR. ~100-103% of max.
  Purpose: If the day is good, push it. If not, take a conservative 3rd.
- Jump rules: Never more than 7.5% between attempts. Ideal jumps: Opener → +5-7.5% → +2.5-5%.
- Wilks/DOTS chasing: Only on 3rd attempts and only if 2nd was smooth.

### Meet Day Nutrition
- Morning (weigh-in day for 24h): Start rehydrating immediately. Pedialyte + water. Sip constantly.
- Breakfast: 2-3 hours before lifting starts. Familiar foods. Protein + carbs + low fat.
  Example: Oatmeal + banana + eggs, or bagel + peanut butter + whey shake.
- Between lifts: Small easily digestible carbs. Rice cakes, gummy bears, Gatorade, banana.
- Caffeine: Time for squat warmup. ~3-5mg/kg. Don't exceed your normal tolerance on meet day.
- Stay hydrated throughout. Small sips between attempts.

### Commands (IPF Rules)
- Squat: "Squat" (descend), "Rack" (re-rack). Must wait for squat command before descending.
- Bench: "Start" (unrack, wait motionless), "Press" (after bar is motionless on chest), "Rack."
- Deadlift: "Down" (after lockout). No start command.
- Red lights: 3 referees. 2 of 3 white lights = good lift. Practice with pause/commands in training.

### Mental Preparation
- Visualize successful lifts daily during peak week. Specific: feel the bar, hear the commands, see the lights.
- Have a routine for each lift: same warmup, same cues, same breathing.
- Don't try anything new on meet day. No new shoes, belt notch, technique cues, or foods.
- Between lifts: Stay warm (keep sweats on), eat, hydrate, don't sit too long.
- If you bomb a lift: It's data, not failure. Adjust the next attempt conservatively. Don't panic.

### Week-by-Week Command Practice (Noriega / Stanek)
Mental rehearsal is a skill; skills are practiced year-round, not peaking-week only.
- 4 weeks out: Every comp single on the primary lift gets a full command simulation (partner or
  self-cue). ~8-12 commanded reps across the week.
- 3 weeks out: All comp-grip, comp-stance work gets commands. Add video review — bar must be
  motionless on chest before "Press."
- 2 weeks out: Openers-only singles with full commands. Practice the exact tempo of the referee.
- Meet week: Only warm-up room reps get commands — on the platform itself, the command is live.

### Attempt-Selection Decision Tree
Call your second attempt based on how the opener *moved and felt*, not your training log.
- Opener flew (RPE ≤ 7, no grind, hit position cleanly): aggressive 2nd — jump 5–7% for a
  comfortable heavy.
- Opener was grindy (RPE 8.5+, position broke, set ground out): conservative 2nd — jump 2.5–4%.
  Bank the total.
- Opener missed: repeat at the same load on 2nd. Do not jump on a miss unless a technical fix is
  obvious (e.g. uneven rack, wrong command cadence).
- Second flew: aggressive 3rd — PR attempt (+2–3%).
- Second was grindy: small PR or opener-of-next-meet on 3rd (+1–1.5%).
- Second missed: take the missed weight again on 3rd; don't chase PRs off a miss. If you missed
  the 2nd to bomb the lift, take a conservative 3rd (opener +2.5 kg) just to board.

### Meet Day — Hour-by-Hour Timeline
Built for a 2-hour weigh-in; shift the meal plan back by 20h for a 24-hour weigh-in.
- Weigh-in hour (T-2:00): Weighed. Start with 500-750 mL electrolyte drink (400-600 mg sodium).
- T-1:45 to T-1:15: First meal — rice + chicken + honey or white potato + eggs + maple. Low fat,
  low fibre. 80-120 g carb, 30-40 g protein.
- T-1:00: Caffeine, 3-5 mg/kg (match your training dose; never exceed tolerance on meet day).
- T-0:45: Start the squat warm-up. Bar → 40% → 60% → 70% → 80% → opener. 3-5 min between sets.
- Between lifts (15-30 min between attempts): 10-20 g fast carb (rice cake, gummy bears, sport
  drink). 150-250 mL fluid. Small sips, not chugs — bloating on squat day is real.
- Between squat & bench: 45-90 min window. Eat 30-50 g carb + 20-30 g protein. Pedialyte sips.
- Pre-bench: Re-dose caffeine if > 2 h since the first dose, half the original amount.
- Between bench & deadlift: 60-120 min window. Small meal — rice + chicken + honey, same as
  morning. Light stretching, no foam rolling (it will make you sleepy).
- Pre-deadlift: Last caffeine hit (or nitric-oxide supplement if you use one). No food in the
  60 min before your 3rd — full belly kills a deadlift.
- After the meet: Eat. Seriously. A proper meal within 90 minutes supports recovery.

### Meet Day — Fluid + Sodium Targets
- Total fluid across a 6-8 h meet: 30-40 mL / kg body weight, sodium-dosed.
- Sodium target: 400-700 mg / hour during the meet. Higher end for big bleeders and hot venues.
- Electrolyte mix: LMNT, Pedialyte, or 1/4 tsp sea salt + pinch potassium + 500 mL water per hour.
- Between-attempt sip: ≤ 150 mL at once. Drinking 500 mL in one go pre-squat is a recipe for
  bloat and bail-outs.

### Warm-up Room Protocol
- Plan warmup with your timing coach — know how many lifters are between you and the bar.
- Reps at warmup loads: 60% × 5, 70% × 3, 80% × 2, 87% × 1, opener × 1 (or just set-up rehearsal
  at opener load — no rep).
- Never take the opener in the warmup room. Set-up rehearsal only.
- If 80 % feels grindy or RPE comes back ≥ 7.5 in warmups → drop opener 2.5–5 kg. Trust the signal.
  An opener that feels like an RPE 8 in the back room becomes a missed 2nd attempt under nerves.
`;

// ── Injury Prevention ─────────────────────────────────────────────────────────

export const INJURY_KNOWLEDGE = `
## Injury Prevention & Management

### Common Powerlifting Injuries
- Shoulder: Impingement, rotator cuff strain, AC joint irritation. Usually from excessive bench volume or poor setup.
  Prevention: Face pulls every session, external rotation work, vary grip width periodically.
  Modification: Reduce bench frequency, use neutral grip DB press, avoid behind-neck movements.

- Lower back: Disc issues, facet joint pain, muscle strain. Usually from deadlift rounding or squat depth issues.
  Prevention: Core bracing work, don't max out conventional and squat same session, maintain neutral spine.
  Modification: Belt squats, trap bar deadlift, reduce intensity 15-20%, add McGill Big 3 (curl-up, side plank, bird dog).

- Knee: Patellar tendinopathy, meniscus irritation. Usually from rapid volume increase in squatting.
  Prevention: Gradual volume increases (< 10% per week), knee sleeves for warmth, adequate quad work.
  Modification: Reduce squat depth temporarily, box squats, reduce frequency to 2x/week.

- Hip: FAI (impingement), labral irritation, adductor strain. Usually from forcing depth or stance too wide.
  Prevention: Hip mobility work, don't force depth beyond your anatomy, vary squat stance.
  Modification: Elevate heels, narrow stance, reduce sumo deadlift temporarily.

- Elbow: Medial epicondylitis from low-bar squat grip or heavy pressing. Very common.
  Prevention: Don't death-grip the bar in squats, use thumbless grip, wrist wraps.
  Modification: Switch to high-bar temporarily, wider grip in squat, reduce tricep isolation volume.

### General Injury Rules
1. Pain ≠ gain. Sharp pain = stop. Dull ache that warms up = monitor. Pain that worsens during session = stop.
2. Modify, don't eliminate. Find a pain-free variation. Train around the injury, not through it.
3. Tendons: Hate rest, love progressive load. Isometrics first, then slow eccentrics, then full ROM.
4. If pain lasts > 2 weeks with modification: See a sports physiotherapist, not a general doctor.
5. Injuries are information. They tell you something is imbalanced, progressed too fast, or needs mobility work.
`;

// ── Programming Adjustments ───────────────────────────────────────────────────

export const PROGRAMMING_KNOWLEDGE = `
## Programming Adjustments

### When to Adjust Maxes
- If estimated 1RM from RPE tables shows consistent 3%+ above stored max for 3+ sessions → increase max.
- If unable to hit prescribed RPE targets (RPE 10 when target is 8) → max is set too high. Reduce 5-10%.
- After a meet: Reset maxes to best successful attempts.
- After a long break (2+ weeks off): Reduce stored maxes by 5-10%. Build back conservatively.

### When to Change Exercises
- Staleness: Same exercise for 8+ weeks with no progress → swap to close variation.
- Pain: Joint discomfort on a specific movement → swap to pain-free variation with same muscle targets.
- Weakness targeting: Identify weak point (e.g., weak off chest) → add specific work (Spoto press, DB bench).
- Equipment availability: If gym doesn't have equipment → swap to available alternative.

### When to Modify a Session
- Readiness < 40: Drop volume 30%, drop RPE targets by 1.0, skip accessories.
- Readiness 40-59: Drop volume 20%, drop RPE targets by 0.5.
- Readiness 60-79: Train as programmed.
- Readiness 80+: Can push slightly harder. +0.5 RPE on main lifts if feeling it.
- Short on time: Keep comp lift, keep 1 variation, drop most accessories. Quality > quantity.
- Sore from previous session: If session targets same muscle group, reduce volume or swap exercise order.

### Athlete Phenotype Adjustments
- HIGH responder: Can tolerate more volume. +10-20% volume vs standard. Grows fast but watch for overreaching.
- LOW responder: Needs more recovery. -10-20% volume. Prioritize intensity and specificity over volume.
- HYPERTROPHY bottleneck: More time in accumulation blocks. Higher rep ranges (5-8). More accessory volume.
- NEURAL bottleneck: More time in intensification. Lower rep ranges (1-4). Practice competition lifts more.
- OVERSHOOTER: Auto-adjust RPE targets down 0.5. Teach patience. Film sets to calibrate.

### Training Frequency Guidelines
- 2 days/week: Full body. Both sessions hit S/B/D or variations. Minimal accessories.
- 3 days/week: Upper/Lower/Full or S-B-D split. 2+ exposures per lift per week.
- 4 days/week: S/B/D/Upper or S/B/D/B(light). Most popular for intermediates.
  Day 1: Squat + Squat accessory + Posterior chain
  Day 2: Bench + Bench accessory + Rows
  Day 3: Deadlift + Deadlift accessory + Lat work
  Day 4: Light bench + Overhead press + Arms/shoulders
- 5 days/week: S/B/D/S(light)/B(light) or DUP. Advanced. Recovery is critical.
- 6 days/week: PPL-PPL or DUP. Only for advanced lifters with excellent recovery. High injury risk.
`;

// ── Deep RPE / Load Management ────────────────────────────────────────────────
// Replaces the old bar-speed-heavy VBT_KNOWLEDGE. The app does not capture bar
// velocity, so leaning on RPE depth is the actionable substitute. References
// to bar speed have been removed across the knowledge base — coaches that
// historically used velocity (Stanek, RTS) are surfaced through RPE-equivalent
// signals: RPE drift, sandbagging detection, calibration-max protocols.

export const RPE_DEEP_KNOWLEDGE = `
## RPE Deep — Calibration, Drift, and Honest Auto-Regulation

### RPE → e1RM (worked from the prescribeLoad table)
- RPE 10 = 100 % of 1RM at 1 rep. Each rep below RPE 10 ≈ 4 % drop at 1 rep.
- RPE 8 single ≈ 92 % 1RM. RPE 8 triple ≈ 84 %. RPE 8 set-of-5 ≈ 79 %.
- RPE 9 single ≈ 96 %. RPE 9 triple ≈ 89 %. RPE 9 set-of-5 ≈ 83 %.
- These numbers are population averages; calibrate per-athlete after 4–6 weeks of clean logs.

### RPE Drift = the most actionable signal you have
- *Same load, +1 RPE over 2 sessions* = recovery debt accruing. Action: deload that lift only,
  not the whole program. One week at -10 % load, normal volume, then resume.
- *Same load, RPE flat over 4 weeks but no rep progression* = stimulus has gone stale. Action:
  rotate the variation slot (pin → pause → comp), not the comp lift itself.
- *RPE *under* target consistently with rep progression* = max is set too low. Action: bump the
  stored max 2.5–5 kg, do not reward the undershoot by adding more sets.

### Half-RPE discipline
- 8.5 vs 9 is a real distinction. RPE 9 = "1 left in the tank, certain." RPE 8.5 = "maybe 2,
  maybe 1 — would not bet either way." Coach the athlete to log half-points, especially on
  grinder-vs-fast-bar reps.
- A set logged 8.5 that the next set confirms was actually 9.5 is a calibration miss, not a
  cheat. Use it as data: this athlete's RPE skews low at intent, recalibrate.

### Calibration drift signs (when to demand a calibration max)
- Logged RPE 8 reps that miss → max is overestimated by ≥ 5 %.
- Logged RPE 8 reps that move like RPE 6 → max is underestimated by ≥ 5 %.
- Three sessions with > 1.0 RPE deviation from prescribed → schedule a calibration single
  (top single @ RPE 8) before continuing the block. Reset stored max from that single.

### RPE on accessories
- Stays 1–2 points lighter than comp lifts. RPE 7–8 on RDL when comp DL is RPE 8–9.
- Accessories should never steal recovery from the priority lift the next session.
- AMRAP-style accessories ("AMRAP at this load until RPE 9") are fine on lat pulldowns, hip
  thrusts, leg press — never on barbell rows that share spinal-erector cost with deadlift day.

### Sandbagging detection (Stanek)
- Logged RPE undersells e1RM by ≥ 5 % across two sessions = chronic undershoot.
- Action: force 2.5 kg jumps until logged RPE matches target, even if the athlete protests.
- The athlete's "this felt like a 7" + the e1RM math saying "that was an RPE 6" = the math wins.

### Overshooting cure (overshooter phenotype)
- Logged RPE overshoots target by ≥ 1 across two sessions = chronic overshoot.
- Action: reduce stored max 5 %, prescribe ascending sets (1@70 % → 1@80 % → 1@target RPE)
  instead of straight sets so the early sets feed the brain "I have something left."
- Praise the *under-shoot* explicitly when it appears — it's the correction, not a failure.

### When RPE breaks down (the limits)
- Singles at RPE ≤ 7 are nearly impossible to feel — coach uses load + readiness here, not RPE.
- RPE on bodyweight calisthenics is unreliable below 5 reps; use rep quality (no kip, full
  ROM, no shake) as the proxy.
- Sets > 12 reps drift RPE upward as cardiovascular fatigue dominates muscular fatigue.
  Cap RPE-prescribed work at sets of 10 unless the goal is conditioning, not strength.
`;

// ── Hybrid PL + Street Lift + Calisthenics Programming ────────────────────────

export const HYBRID_PROGRAMMING_KNOWLEDGE = `
## Hybrid PL + Street Lift + Calisthenics Templates
The athlete who mixes powerlifting with street lifting and weighted calisthenics needs fatigue
distribution as the primary lever — not total volume. Millz's "volume distribution beats volume
magnitude" applies hardest here. These templates respect spinal-erector fatigue, grip recovery,
and push-pull balance.

### Systemic fatigue stacking rules (non-negotiable)
- Never heavy squat + heavy deadlift the same day outside of an SBD rehearsal once every 3-4 weeks.
- Never heavy deadlift + heavy weighted pull-up the same day during peaking — both hammer the grip,
  lats, and spinal erectors. Leave 48h between them.
- Bench is the lowest systemic cost; it can ride on any day.
- Weighted dip = bench cousin. Count it against your bench frequency when programming shoulder
  health work (face pulls, rows).
- Calisthenics skill work (levers, planche, handstand) is CNS-costly but low tissue cost —
  schedule 20 min before a light PL session or on an otherwise easy day, never after a heavy pull.

### Template — PL-primary + street-lift (4 days, athlete with a meet on the calendar)
Day 1 (Mon) — SQUAT day
- Comp squat (primary)
- Pause squat or high-bar squat (variation)
- RDL + leg press (accessories)
- Weighted pull-up 3×5 @ RPE 7 (grip + back carryover)
Day 2 (Tue) — BENCH day
- Comp bench (primary)
- Spoto press / pin press / close-grip (variation, rotated)
- Barbell row + overhead press + tricep (accessories)
- Face pulls 3×15 (non-negotiable)
Day 3 (Thu) — DEADLIFT day
- Comp deadlift (primary, conventional or sumo)
- Deficit DL or block pull (variation)
- Good morning + lat pulldown (accessories)
- Weighted pull-up 3×5 (grip, not heavy — grip already taxed by pulls)
Day 4 (Sat) — STREET-LIFT day
- Weighted pull-up (heavy) — the primary of this day
- Weighted dip (heavy) — the secondary
- Weighted muscle-up practice at RPE 7 if contest-bound
- Light bench or OHP as upper-body backoff

### Template — Street-lift-primary + PL (4 days)
Day 1 (Mon) — WEIGHTED PULL-UP day (primary)
- Weighted pull-up: 4×3 @ RPE 8
- Weighted muscle-up: 3×2 @ RPE 7
- Row variant + bicep work
- Light squat (60% @ RPE 6, 3×5) for quad/glute maintenance
Day 2 (Wed) — BENCH + WEIGHTED DIP day
- Comp bench: 4×5 @ RPE 7
- Weighted dip: 4×4 @ RPE 8
- CGBP + face pulls + tricep iso
Day 3 (Fri) — WEIGHTED DIP day (primary)
- Weighted dip: 5×3 @ RPE 8
- Pin press or board press: 3×3 @ RPE 7 (lockout support)
- Front lever / planche progression (skill)
- Light deadlift (60%, 2-3 top singles) for posterior chain
Day 4 (Sat) — HYBRID LOWER
- Squat or DL primary (alternate weekly)
- Weighted pull-up: 3×5 @ RPE 7 (support volume)
- Accessory lower work

### Template — Hybrid (5 days, calisthenics skills in the mix)
Day 1 — Squat + weighted pull-up
Day 2 — Bench + face pulls + tricep (+ front lever on fresh days)
Day 3 — Skill day: handstand work, planche progression, pistol squat progression (60-75 min)
Day 4 — Deadlift + weighted pull-up (light)
Day 5 — Weighted dip + OHP + row

### Accessory overlap — don't double-dip
- Rows (any flavor): carry to both bench and deadlift. 2 heavy row sessions/week is plenty.
- Triceps: bench direct + CGBP + weighted dip all train triceps. Cap isolation at 1 session/week
  when dip is programmed — otherwise elbow joint fatigue accumulates.
- Lats: weighted pull-up + lat pulldown + rows all hit lats. If pull-up is the primary discipline,
  drop lat pulldown and keep rows (different pattern).
- Core: hanging leg raise + ab wheel + Pallof press is the full anti-ext/anti-rot palette. Two
  of the three per week suffices; dropping all three costs you bracing.

### Phase-specific rules
- **Accumulation:** Hit all 3 PL lifts 2-3× / week, plus street-lift work 2× / week. Use the
  overlay templates above.
- **Intensification:** Drop total weekly exposures by ~20%. Keep comp lifts at 2× / week,
  street-lift at 1-2× / week. Add pin press / block pull for lockout specificity.
- **Realization (peaking):** Only the discipline that's competing gets heavy work. The other
  disciplines drop to maintenance — 1 exposure/week at RPE 6-7 to keep grooves alive.
- **Deload:** All disciplines at ~50% volume, ~70% intensity. Skill work OK; avoid PRs of any kind.
`;


// ── Session Design Constraints ────────────────────────────────────────────────

export const SESSION_DESIGN_KNOWLEDGE = `
## Session Design Constraints

### Movement Pattern Caps Per Session
The same movement pattern should not dominate a session. Violating these caps is the
most common amateur programming mistake — it produces redundant fatigue with no extra
adaptive return, then bleeds recovery capacity into the next session.

- **HINGE (deadlift pattern): maximum 2 per session** (outside explicit SBD days).
  Acceptable: Competition Deadlift + one variation (Pause DL, Deficit DL, Block Pull).
  Also acceptable: Competition Deadlift + RDL — because RDL is eccentric-dominant at
  sub-maximal load, not a floor pull, making it a mechanically distinct stimulus.
  NOT acceptable: Competition Deadlift + Pause DL + RDL + Deficit DL.
  All four movements load the same spinal erectors, hamstrings, and grip. You are not
  getting four times the stimulus — you are accumulating four times the fatigue on tissue
  that has already reached its adaptive ceiling by set 3 of the comp lift.

- **SQUAT pattern: maximum 2 per session** (competition + variation). Leg Press does not
  count — it is quad isolation, no axial spinal load, genuinely different stimulus.

- **HORIZONTAL PUSH: maximum 2 per session**. If the variation slot is already Close Grip
  Bench, the accessory list should substitute a different tricep stimulus (pushdowns, dips).
  Close Grip Bench as both variation and accessory is a programming duplicate.

### Posterior Chain Overload — The #1 Session Design Error
The spinal erectors are the bottleneck of posterior chain fatigue. Every hinge movement
— regardless of load — recruits them. Their recovery capacity per session is finite.

Fatigue cost by exercise type on a deadlift day:
  1. Competition Deadlift (4-6 sets, high load) → spinal load: HIGH
  2. Pause / Deficit DL (variation, 2-3 sets) → spinal load: HIGH
  3. Romanian Deadlift (accessory, 2-3 sets) → spinal load: MEDIUM (eccentric-dominant)
  4. Deficit Deadlift as a second accessory → spinal load: HIGH again

Option 4 does not build more off-the-floor strength than option 2 (same stimulus, more
fatigue). It extends recovery time from ~48h to 72-96h, directly compromising the next
session's quality.

**The correct deadlift day structure:**
  1. Competition Deadlift — primary, full prescription
  2. ONE floor-pull variation: Pause DL *or* Deficit DL *or* Block Pull (not two or three)
  3. Romanian Deadlift — hamstring/glute eccentric load; different enough to keep
  4. Upper back work: Lat Pulldowns + Barbell Rows (lats, upper back for bar path / lockout)
  5. Hip Thrust — replaces any additional hinge. Targets the glutes (primary lockout mover)
     with LOW spinal load via the hip-extension pattern, not axial spine compression.
     This is the correct fourth posterior chain exercise, not a second floor pull.

### Hip Thrust as the Deadlift Day Posterior Chain Complement
- **Why Hip Thrust belongs on deadlift day:**
  Glutes are the primary driver of the lockout phase of the deadlift. Strengthening them
  directly (barbell hip thrust, hip extension against load) improves the finish of the pull
  without competing for the same spinal erector recovery window.
- **Load guideline:** ~70% of deadlift 1RM at 8-12 reps (RPE 7-8). Barbell sits across
  the hips, not the spine — axial compression is near zero.
- **Elite coaching consensus:** Bret Contreras' glute research; endorsed by Noriega for
  posterior chain GPP on high-frequency programs. Juggernaut Method uses hip thrust as a
  DL posterior chain complement at the accumulation phase.

### Spinal Load Budget Per Session
Every session has an implied spinal load budget. Exceeding it delays recovery and suppresses
the next session's output:
  - HIGH spinal load exercises (competition DL, deficit DL, good mornings): max 2 per session
  - MEDIUM spinal load (RDL, barbell row): up to 3 per session
  - LOW spinal load (hip thrust, leg press, lat pulldown): no practical per-session cap

Practical rule: if the primary lift is DEADLIFT, no other HIGH spinal load exercise should
appear after the variation slot. Replace with MEDIUM or LOW alternatives.

### Exercise Redundancy vs. Legitimate Variety
- **Redundant (bad):** Pause Deadlift + Deficit Deadlift in the same session.
  Both train off-the-floor mechanics. Same muscles, same positions, doubled fatigue.
- **Legitimate (good):** Romanian Deadlift + Hip Thrust in the same session.
  RDL = eccentric hamstring overload. Hip Thrust = concentric glute peak contraction.
  Mechanically distinct, different adaptation signal, minimal fatigue competition.
- The variation slot exists to address a specific weak point the comp lift does not target.
  Fill it with one exercise that closes that gap, then route accessories to pulling and
  non-overlapping movement patterns.

### Squat Day and Bench Day Design
- Squat day: Competition Squat + squat variation + RDL (posterior chain support) + upper
  back pulling (rows, pulldowns). Adding a third squat-pattern exercise is acceptable only
  if it is truly different (e.g. leg press = quad isolation, acceptable; box squat = just
  another squat, not needed when pause squat is already present).
- Bench day: Competition Bench + bench variation + row (mandatory for shoulder health) +
  face pulls (non-negotiable, every bench day) + one tricep accessory. If the variation
  is already a tricep-emphasis bench (CGBP, pin press), swap the tricep accessory to
  pushdowns or dips rather than repeating the close-grip pattern.
`;


// ── Elite Coaching Principles ─────────────────────────────────────────────────

export const COACH_PRINCIPLES_KNOWLEDGE = `
## Elite Coaching Principles
Programming follows the consensus of modern evidence-based powerlifting coaches. Cite these
philosophies when making recommendations — the athlete should feel the lineage.

### Mike Tuchscherer (Reactive Training Systems)
- RPE autoregulation is the spine: set prescriptions are RPE-targeted, load adjusts to the day.
- Fatigue percents: once a top set hits target RPE, back-offs drop ~2–4% per rep below top for 3–6 sets.
  Example: top single RPE 8 → 4 back-off triples at ~6–8% below.
- Stress Index — composite of session RPE × volume tracked weekly. The trend matters more than any
  single number; rising Stress Index against flat or declining performance = recovery debt accruing.
- Dynamic load management: prescribe a load *range* gated by RPE rather than a fixed kg. Let the day's
  RPE pick the load inside the range — that's the autoregulation in practice.
- Specificity grows through the block: accumulation is broad, peaking is comp-stance, comp-grip,
  comp-tempo, comp-commands only.
- Volume is measured in quality reps at target RPE, not blind tonnage. Ditch junk sets.
- Weak-point analysis is diagnostic: RPE creep at the same load over 2–3 sessions on the same lift
  surfaces the limiting link. Rx targeted variation (paused / pin / deficit at the failure position),
  not random accessory.
- Tonnage caps: when a lifter stalls despite hitting numbers, cut weekly working sets by 20–30% for a
  mini-block before adding back.

### Joey Flex
- Specificity windows: the final 6–8 weeks before a meet are for competition lifts only. Anything that
  doesn't reinforce comp technique is cut or minimized.
- Adherence first. The best program is the one the athlete actually finishes consistently. When in doubt
  between "optimal but miserable" and "90% as good and sustainable," choose sustainable.
- Bench frequency: 3–4 bench sessions per week for most intermediates — treat it as a skill movement.
  Pause work gets its own session, not just competition week.
- Spinal erector fatigue is the silent killer of peaking. Alternate heavy squat and heavy pull days;
  never stack them same-day in peaking.
- Don't add training elements to add them — every set defends its existence against "what does this
  drive?" Cut anything that can't answer.
- Communication is part of the program. Athletes who feel heard execute. Build trust by explaining
  every block transition's *why*.

### Joe Stanek
- Block periodization rigor: explicit accumulation → intensification → realization transitions. No
  aimless "I'll just train hard" blocks. Name the block, name the *one* adaptation it must produce.
- Earned ramps — "intensity is a privilege": load advances only when the prior load was hit at or
  below target RPE for ≥2 sessions. If RPE drifted up at the same load, repeat the load before
  promoting.
- Top-single + back-off pattern: top single at target RPE, then 3–5 back-off triples ~6–8% below
  for the working volume. The top single is the diagnostic; the back-offs are the dose.
- Microcycle-level evaluation: the smallest unit of evidence is the week, not the workout. Evaluate
  at week boundaries, not within-week — one rough session does not invalidate the block.
- Tonnage matters in development — measure weekly working tonnage at prescribed RPE, not just heavy
  singles. A "low-volume" block is volume *concentrated*, not volume *abandoned*.
- Command practice from week 1 of peaking — "squat," "rack," "start," "press," "down" — not just
  meet week. Pause at every comp-stance set, internalise the cue sequence so meet day is reflex.
- Sandbagging kills peaks. If logged RPE undersells e1RM by ≥5% across two sessions, force 2.5 kg
  jumps until RPE self-calibrates.

### Marcellus "Millz" Wallace
- High weekly exposures to all three comp lifts. Aim for 2–4 squat, 3–4 bench, 2–3 deadlift sessions
  in an accumulation week. Keep fatigue in check with variety in modality (paused, tempo, comp).
- Pause work mastery: pause squats and pause benches build positional strength and mental composure
  under command. Rotate them in year-round, not just peaking.
- Tempo bench (3-count eccentric, 1-count pause) drives bar path discipline and the leg drive pattern.
- Aggressive specificity: the best squat accessory is a squat variation. The best deadlift accessory
  is a deadlift variation. Isolation only fills remaining SFR.
- Volume distribution beats volume magnitude: 4×8 bench 4x/week crushes 8×8 once a week.

### Sean Noriega
- Long intro-block bias: keep the microcycle the same for as long as it drives adaptation. Change
  the variable that's underperforming, not the whole template.
- Frequency *before* volume: when progress stalls, redistribute existing volume across more sessions
  before adding new sets. Spacing is a programming variable, not a side effect.
- Low-volume, high-quality philosophy: fewer working sets with higher RPE accuracy outperform junk
  volume for most intermediates.
- Pause variants are the *default* expression of the comp lift outside meet prep — they expose
  positional weakness before it shows up under heavy loads.
- Mental rehearsal as training: setup → breath → cue sequence visualised before every top set.
  Technique is a skill; skills are rehearsed.
- Readiness-driven modality switch: low readiness ≠ skip. Same RPE target on lighter / fewer / pause
  work — the day still earns its place.
- RPE honesty over PR ambition: if the opener-equivalent single feels like RPE 9 instead of the
  prescribed 7, the day is a technical session, not a PR attempt — drop top-end load, keep the
  volume target.
- Scheduling is non-negotiable: spacing between heavy squat and heavy pull days protects spinal
  erectors. A 4-day microcycle that respects spacing beats a 5-day one that doesn't.

### Boris Sheiko
- The foundation of Sheiko methodology: all three competition lifts trained in almost every session.
  A typical Sheiko week (intermediate program #29) includes SBD work 3-4 days per week. Single-lift
  sessions are the exception, not the rule.
- Volume through frequency, not per-session excess. Individual sessions are moderate (60-80% intensities,
  3-6 sets of 2-4 reps), but accumulated over 4 workouts per week the total volume is enormous.
- Intensities are prescribed as percentages: rare work above 85%. Most sessions top out at 80%.
  The body adapts to handling near-maximal loads through exposure, not grinding.
- Technique first, weight second. If technique degrades, the weight is too heavy for that day. Lower it
  and do the reps right. Every rep of every set is a technique practice.
- Zero ego in training. The percentages might feel easy. That's the point — you train that weight 200
  times until it becomes reflexive, then you add weight.
- Periodization is wave-loaded by the mesocycle: volume peaks early, then both volume and intensity
  shift upward, peaking at competition.
- SBD session design (Sheiko model): Squat 5-6 sets → Bench 6-8 sets → Deadlift 4-5 sets, all at
  submaximal loads, all in one session. The athlete becomes accustomed to "training through fatigue"
  which directly simulates meet conditions.

### Bryce Lewis / The Strength Athlete (TSA)
- Evidence-based high-frequency approach: 3-5 sessions per week, each lift appearing 2-3+ times.
- "Minimum effective dose" per session — enough stimulus to drive adaptation, not so much that
  recovery is compromised. This is different from Sheiko's total-volume approach: TSA controls
  per-session volume tightly.
- High specificity: competition stance, competition grip, competition tempo as much as possible.
  Variations are kept close to the comp movement.
- Individualization is the operating principle. Starting points are templates; the final program is
  shaped by how the athlete responds over 4-6 weeks of data collection.
- TSA block model: hypertrophy → strength → peaking, but with overlapping qualities. Even in
  hypertrophy phases, heavy singles are practiced for skill maintenance.
- Prescription includes daily readiness checks. Autoregulation via RPE with a 2-rep range guideline:
  if the RPE is 2 points off target, flag it and adjust.

### Greg Nuckols / Stronger By Science
- Frequency research consensus: for intermediate and advanced lifters, higher frequency (3-4x/week
  per lift) consistently outperforms lower frequency at matched volume. The mechanism is skill
  acquisition + protein synthesis frequency.
- The "average to savage" insight: you don't need to be a genetic outlier to get very strong. Most
  lifters are undertrained, not over-recovered. Progressively adding load and frequency, within MRV,
  is the primary driver of long-term strength gains.
- Flexible periodization: linear progression, DUP, and block periodization all work — the best one
  is the one that fits the athlete's schedule and keeps them training consistently.
- Volume is the primary driver of hypertrophy; intensity is the primary driver of strength expression.
  You need both, but they should be periodized, not maximized simultaneously.
- For powerlifters specifically: squat 3x/week minimum in accumulation, bench 3-4x/week, deadlift
  2-3x/week. Frequency drives groove refinement more than any variation does.
- Recovery research: sleep is the #1 recovery tool. No supplement, modality, or training tweak
  compensates for chronic sleep debt.

### Ben Pollack
- Powerbuilding (powerlifting + bodybuilding) philosophy: muscle mass is the long game. Every pound
  of muscle you build in accumulation phases translates to lifting capacity later. Don't neglect
  hypertrophy work in favor of pure strength work year-round.
- Classic raw powerlifting roots: heavy singles and doubles in every training cycle. Not just
  in peaking — the body needs regular exposure to near-maximal loads to maintain the skill of
  max-effort lifting.
- Volume precedes intensity. Build the work capacity first. An athlete who can handle 20+ sets per
  week of high-quality squat work can handle peaking loads better than one who trained with 8-10.
- Equipment-agnostic technique: practice competition-legal technique in every session regardless of
  whether the athlete competes raw or equipped. Equipped powerlifting is additive, not a replacement.
- Bodybuilding accessories matter. Direct tricep work (4-6 sets × 8-12), lat work, and rear delt work
  consistently outperform neglecting them. The strongest benchers also do the most tricep volume.

### Chris Duffin / Kabuki Strength
- Breathing and bracing mastery is the non-negotiable foundation. Creating maximum intra-abdominal
  pressure (IAP) protects the spine and amplifies force transfer. Every lift improves when bracing
  is optimized — "create 360° pressure, not just forward."
- Spinal biomechanics expertise: the goal of each exercise is to load the target muscle while
  minimizing compressive shear on the spine. This is why specialty bars (SSB, buffalo bar) and
  intentional setup adjustments matter — they allow more total volume with less spinal risk.
- Hip anatomy is deterministic. Squat stance, depth, and degree of toe flare are NOT style choices —
  they are dictated by the athlete's femoral neck angle and acetabular depth. Forcing a stance that
  fights the anatomy leads to impingement, not strength.
- Safety bar squat (SSB) should be a staple, not a novelty. It loads the upper back and anterior
  core more than a straight bar and allows squatting through injury. For athletes with shoulder or
  wrist issues, SSB is the primary squat variation.
- The "hatfield squat" (SSB + hands on a rack) allows truly maximal leg work when upper body
  fatigue or pain would otherwise limit the squat. Good for volume accumulation.
- Core stability is the multiplier, not an afterthought. A weak anterior core leaks force. Pallof
  press, ab wheel, and heavy loaded carries should be programmed with the same intent as comp lifts.

### PowerliftingNow ecosystem (consensus thread across modern elite coaches)
- Better execution beats better programming. A coach earns their fee primarily by enforcing
  execution — bracing, RPE honesty, position rehearsal — not by inventing template novelty.
- High frequency + RPE autoregulation + proactive deloads (every 4–6 wk) + command practice
  in-block + technique primacy under fatigue are the shared spine of the modern raw scene. If a
  recommendation contradicts ALL of these, it had better come with a specific reason.
- Sustainable adherence at 90 % of optimal beats theoretical optimal abandoned at week 4.
- The training log is the most valuable data source — review it every week, before any plan change.

### Cross-cutting consensus
- Autoregulate via RPE and readiness, not ego. Honest RPE > heavy load.
- Specificity dominates novelty: you get strong at what you practice.
- Comp lifts are skills, not just strength tests — rehearse every rep like meet day.
- Adherence > optimization. A B+ program run for 12 weeks beats an A+ program abandoned after 3.
- Fatigue is a variable to manage, not prove. Track it. Respect it. Dissipate it before meet day.
- SBD sessions are the Sheiko norm and the competition simulation standard. Single-lift sessions
  serve a purpose (higher volume on one lift), but athletes should train through SBD fatigue
  regularly — it is the exact demand of competition.
`;

// ── Breathing & Bracing ───────────────────────────────────────────────────────

export const BREATHING_BRACING_KNOWLEDGE = `
## Breathing & Bracing (IAP Creation)

The most undercoached skill in powerlifting. Every pound of intra-abdominal pressure (IAP)
protects the spine and transfers force more efficiently through the kinetic chain. Lifters who
master bracing add kilograms to every lift without adding training load.

### What IAP Actually Is
Intra-abdominal pressure is a pressurized "canister" formed by:
- Diaphragm on top (pushing down when you breathe in)
- Pelvic floor on the bottom (co-contracting upward)
- Obliques and transverse abdominis around the sides (pushing OUT, not in)
- Multifidus / spinal erectors at the back

When all four walls of the canister contract simultaneously against a belly breath, IAP spikes.
This pressure provides a rigid, load-bearing cylinder around the spine — the same function as
a lifting belt, but from within. A belt simply gives the obliques something hard to push against,
amplifying IAP by 20-40%. You still have to create the IAP — the belt is a wall, not the pump.

### The Valsalva Maneuver
The Valsalva is the deliberate technique of closing the glottis (bracing the throat shut) while
contracting the respiratory muscles. It maximizes IAP transiently.

Correct execution:
1. Take a BELLY breath (diaphragmatic) — ribs expand slightly, belly expands significantly.
   If your chest rises first, you are chest-breathing. That gets minimal IAP.
2. Brace your core — contract obliques outward as if absorbing a punch. Do NOT suck the belly in.
   "Bracing" ≠ "drawing in." Drawing the navel toward the spine REDUCES IAP.
3. Close the glottis — the sound is a gentle hum or grunt; not open-mouth breathing.
4. Hold the brace for the duration of the lift or rep.
5. Release after lockout. Never release at the bottom of a squat or on the way up.

Timing per lift:
- SQUAT: Valsalva at the top of each rep (or after each walkout). Do NOT re-brace at the bottom.
  Taking a breath mid-rep collapses IAP at the worst moment.
- BENCH: Valsalva at the top before unracking. Hold through the entire rep (down + pause + press).
  Short sets (1-3 reps) can use one brace per rep. Longer sets: brace at top, hold entire set.
- DEADLIFT: Valsalva before breaking the bar from the floor. A deliberate breath after the setup.
  "Wedge" setup first (hips set, lats locked, bar against shins), THEN the final belly breath + brace.
  Do NOT rush the breath. A missed breath at the setup kills a heavy deadlift.

### 360° Pressure (Chris Duffin / Kabuki Strength)
Standard coaching says "brace your abs." That is incomplete. 360° pressure means:
- Front wall (rectus abdominis + transverse): contract outward, not inward.
- Side walls (obliques): push laterally — "push your sides against your elbows" as a tactile cue.
- Back wall (multifidus, erectors): actively "push your lower back into your belt" — not passive.
- Floor (pelvic floor): slight upward co-contraction stabilizes the base.

The test: when you brace correctly, you should be equally firm when pressed from the front, sides,
or back. Most untrained lifters are only firm in front. Their "brace" is a crunch, not a cylinder.

### Belt Use
- A belt is not a crutch. It is an IAP amplifier. Use it when you want maximum IAP (heavy sets,
  top sets, anything RPE 8+). Do not default to beltless out of pride.
- Learn to brace beltless first. If you cannot brace without a belt, the belt is hiding a deficit.
- Belt tightness: tight enough that you can take a deep belly breath against it. If you cannot
  expand into the belt, it's too tight (reduces IAP to near zero).
- Belt position: typically 1 finger below the navel on the front, slightly higher at the back.
  Experiment — some lifters prefer it higher. The test: maximum comfort under load, zero pinching.
- IPF legal belt: max 10 cm wide, max 13 cm back. Single-prong, double-prong, or lever — personal
  preference. Lever belts go on and off faster (useful at meets between attempts).

### Common Bracing Errors
- "Sucking in" the belly: actively wrong. Reduces IAP. Often taught in gym-bro culture.
- Breathing at the wrong time: taking a breath mid-squat (at the bottom) collapses all IAP.
- Shallow chest breath: minimal diaphragm excursion → minimal IAP. Never chest-breathe for heavy lifts.
- Holding the brace too long in multi-rep sets: safe for 1-3 reps; for 5+ reps, release and re-brace
  at the top of each rep. Prolonged Valsalva raises blood pressure significantly.
- Belt too tight: ironically reduces IAP. You need room to expand INTO the belt.

### Bracing Under Fatigue
Sets of 5+ are where bracing fails first. Fatigue causes the athlete to:
1. Cut the breath short (less IAP on later reps)
2. Release the brace during the eccentric (feels like "letting go" in the hole)
3. Default to lumbar hyperextension as a substitute for actual IAP

Film the last rep of every hard set. If technique breaks at rep 4 of a 5-rep set, the set should
have been capped at 4 reps. Never sacrifice bracing for the sake of hitting a programmed rep count.
`;

// ── Advanced Technique ────────────────────────────────────────────────────────

export const ADVANCED_TECHNIQUE_KNOWLEDGE = `
## Advanced Technique & Programming Methods

### Top-Set + Back-Off System
The modern standard for comp lift programming. Replaces "same weight, same reps" with a
more powerful two-phase structure that simultaneously tests the day's peak capacity and
accumulates volume at a safe, productive load.

**Structure:**
1. TOP SET: Work up to a single target RPE (e.g., one set of 3 @ RPE 8). This is the barometer.
   - "Top set" is one set only — not the heaviest of a series, but the intentional peak of today.
   - The RPE tells you what the backoff load should be. No guessing.
2. BACK-OFF SETS: Multiple sets at a fixed percentage below the top set (3-8% typically).
   - Tuchscherer fatigue percents: each RPE point = ~2-4% of 1RM. So RPE 8 top set → ~4-6% below.
   - Example: 200 kg × 3 @ RPE 8 → backoffs at 188 kg × 3, 4 sets.
   - The percentage stays fixed across the backoffs. If rep 3 starts grinding at set 3, that's data.

**Why it works:**
- The top set provides the neural stimulus (high-load exposure, technique under near-max stress).
- The back-offs accumulate volume at a load you can recover from, without the fatigue of doing
  everything near-max. Total tonnage is often higher than wave-loading approaches.
- Autoregulation is built in: a bad day means the top set ends up lighter, and so do the backoffs.
  A great day means a heavier top set and heavier backoffs. The program adjusts automatically.

**Common top-set RPE targets by block:**
- ACCUMULATION: RPE 7-8. Multiple back-off sets (4-6). Rep ranges 3-6.
- INTENSIFICATION: RPE 8-9. Fewer back-off sets (3-4). Rep ranges 2-4.
- REALIZATION: RPE 9-9.5. 1-2 back-off sets. Rep ranges 1-2.

**The single-rep top set:**
When in intensification or early realization, the top "set" is often a heavy single. This builds
max-effort single specificity without the fatigue of a full heavy triple. Then back-offs are triples
or doubles at -5 to -8%.

### High-Bar vs Low-Bar Squat

**Biomechanical differences:**
- Low-bar: Bar sits 1-3" below the spine of scapula, across the rear delts. Lower bar = longer
  moment arm from hips, shorter moment arm from knees. Hip dominant. Allows heavier absolute load
  for most lifters due to better leverages and reduced depth requirement.
- High-bar: Bar sits at the top of the traps. More upright torso. Knee dominant. Longer moment
  arm from knee → more quad work. Requires more ankle dorsiflexion. More similar to a front squat.

**When to use each:**
- COMPETITION (powerlifting): Low-bar for most raw lifters. More weight on the bar, lower hip demands
  for depth in most anatomies. Equipped lifters almost universally use low-bar.
- HYPERTROPHY accumulation: High-bar for quad development. More ROM, more eccentric quad stretch,
  better muscle growth signal. Then transition to low-bar as the block approaches peaking.
- NEURAL bottleneck / technique refinement: High-bar temporarily if the lifter's low-bar mechanics
  are breaking down. The more upright posture can reset forward-lean habits.
- INJURY accommodation: High-bar is easier on some lower back presentations (less forward lean =
  less spinal erector demand). But harder on the knees and ankles.

**Programming guidance:**
- Do NOT switch between high-bar and low-bar within 4 weeks of a meet. The motor pattern is
  different enough to temporarily reduce low-bar performance.
- High-bar during accumulation → low-bar during intensification → comp squat only in realization.
  This is the Sheiko model and the most common elite approach.
- If using high-bar as a variation: treat it as a separate exercise (coefficient ~0.90 of low-bar max).

**Transition between stances:**
- A lifter moving from high-bar to low-bar typically loses 3-5% of their squat initially as the
  new motor pattern settles. Gains come within 4-6 weeks of consistent low-bar practice.
- Going from low-bar to high-bar: expect 5-8% reduction initially. The mobility demand is higher.

### Sumo Deadlift Specifics

**Setup differences from conventional:**
- Stance: Feet 1.5-2x shoulder width. Toes pointed out 45-60° (varies by hip anatomy — wider flare
  for externally rotated hips, less for more forward-facing anatomy).
- Grip: Inside the legs, shoulder-width or slightly narrower. Hook grip is especially valuable for
  sumo because the grip is narrower and hook provides more security.
- Hip position: Hips CLOSE to the bar. "Chase the bar" with the hips — don't set up far back.
- "Spread the floor" is the primary cue. Push the floor apart laterally (like a leg press in both
  directions). This engages the adductors, glutes, and creates the outward knee tracking.
- Lat engagement: identical to conventional. "Protect your armpits." Keeps the bar path tight.

**Mechanical advantage of sumo:**
- Reduced bar travel distance (major advantage for tall athletes with long torsos).
- Adductors and glutes are the primary movers (vs. posterior chain dominance in conventional).
- Less spinal erector fatigue — sumo is easier on the lower back for most athletes.
- Disadvantage: requires significant hip mobility and adductor strength. Hip impingement is the
  primary limiting factor for athletes with poor hip structure for sumo.

**Common sumo weaknesses and fixes:**
- Hips shooting up / back ("stripper deadlift" pattern): adductor weakness or hips set too high.
  Fix: adductor machine 3×15 + pause deadlift 2" off floor 3×3 @ RPE 7. Film setup — hips too high
  means the knees are barely involved at the start.
- Knees caving in (butt wink equivalent for sumo): weak adductors + poor hip external rotation.
  Fix: Copenhagen adductor 3×8/side, banded sumo stance work at light load.
- Sticking point at the knee: glute strength. Block pull 4" 3×3 @ RPE 8 (training the lockout
  where sumo most commonly misses). Heavy hip thrust to reinforce peak glute contraction.
- Grip failing on sumo before the pull fails: hook grip or mixed grip. Sumo's narrower grip makes
  overhand grip grip fail faster than conventional. Learn hook grip early.
- Slow off the floor despite adductors firing: leg drive is insufficient. Think "leg press the floor"
  with maximal force at the start. Film — if the hips don't drop 1-2" at setup, the initial leg
  drive is weak.

**Sumo vs. conventional selection:**
Not every lifter is built for sumo. Indicators you should try sumo:
  - Long torso, shorter legs (sumo shortens bar path more for you).
  - Strong adductors from prior athletic background.
  - Hip anatomy that allows the wide stance without impingement (test: can you squat wide,
    toes 45°, without groin impingement pain? Sumo may work).
Indicators you should stay conventional or test both:
  - Long legs, shorter torso (conventional's bar path isn't as different).
  - Adductor weakness (sumo will expose it immediately).
  - Hip impingement in wide stances (anatomy won't accommodate sumo).
Most elite lifters try both. Run 6-8 weeks of each, max out, and compare.

### Paused Reps — When and Why

Paused competition movements are the most cost-effective variation for most powerlifters:
- Pause Squat: 1-3 second pause in the hole. Eliminates bounce, forces positional strength, exposes
  depth issues immediately. Use at 82-88% of competition squat max.
- Pause Bench: 1-3 second pause on chest. Competition-legal lift preparation. Eliminates leg drive
  momentum artifacts. Develops lockout through full ROM. Use at 85-90% comp bench max.
- Pause Deadlift (2" off floor): Eliminates slack-pulling technique (the "bounce-off-floor" cheat).
  Forces leg drive and position before load shifts to the back. Use at 85-90% comp deadlift max.

Pause frequency: 1 session per week per lift during accumulation and intensification. Drop pauses
from the variation slot 2-3 weeks out from a meet — switch to competition-tempo sets.
`;

// ── Session / Set-Rep / Microcycle / Macrocycle Structure ────────────────────
// User-facing the most: when an athlete asks "what should today look like" or
// "how should I structure my week," the coach needs callable templates, not
// derivations from first principles every time. Recent-exposure awareness is
// the operating principle — session shape is a function of (a) days since
// last primary, (b) weekly count of primary, (c) modality of last session.

export const STRUCTURE_KNOWLEDGE = `
## Structure — Session, Set/Rep, Microcycle, Macrocycle

### Session Shape Lookup (lift × phase × recency)
Use these as opinionated defaults, then adjust by readiness and athlete history.

**SQUAT day**
- ACCUMULATION, ≥3 days since last squat: comp squat 4×6 @ RPE 7 → pause squat 3×5 @ RPE 7 →
  RDL 3×8 → split squat 2×10 → erector accessory 2×10. Spinal load HIGH.
- ACCUMULATION, <2 days since last squat (overlap): skip the comp slot — this is a leg
  accessory / hypertrophy day. Front squat 3×8 @ RPE 7, single-leg work, no posterior-chain heavy.
- INTENSIFICATION, primary today: top set 3 @ RPE 8 → 3×3 backoffs ~6 % below → RDL 3×6 →
  one quad accessory. Cut volume vs. accumulation, keep specificity high.
- REALIZATION, primary today: top single @ RPE 8 → 3×2 backoffs ~6 % below → no spinal accessories.
  Hip thrust or leg press only.
- DELOAD: comp squat 3×3 @ RPE 6 → one accessory at RPE 5–6. Done in 35 min. Should feel easy.

**BENCH day**
- ACCUMULATION, ≥2× already this week: keep volume but cap intensity — comp bench 5×3 @ RPE 7,
  no top single, finish with rows + face pulls + tricep iso.
- ACCUMULATION, primary bench day: comp bench 4×6 @ RPE 7.5 → pause bench or close-grip 3×5 →
  row 4×6 → face pulls 3×15 → one tricep accessory.
- INTENSIFICATION: top set 3 @ RPE 8 → 3×3 backoffs ~5 % below → spoto press 3×4 → row + face pulls.
- REALIZATION: top single @ RPE 8 → 2×2 backoffs ~5 % below → row 3×5 → face pulls. Skip tricep iso.
- DELOAD: comp bench 3×3 @ RPE 6 → row 3×8 → face pulls. Done in 30 min.

**DEADLIFT day**
- ACCUMULATION, ≥4 days since last DL: comp DL 4×4 @ RPE 7.5 → one floor variation (deficit OR
  pause OR block) 3×3 → barbell row 4×6 → hip thrust 3×8. NO second floor pull. Spinal load HIGH.
- ACCUMULATION, <3 days since last DL: pull is *not* primary today — light tonnage at RPE 6,
  3×5, then move to back/glute accessories.
- INTENSIFICATION: top single @ RPE 8 → 3×2 backoffs ~7 % below → no second floor pull → row +
  hip thrust + lat pulldown.
- REALIZATION: top single @ RPE 8.5 → 1–2× backoff doubles ~7 % below → finish. No accessories
  beyond glute / lat support.
- DELOAD: 60 % triple work, 3 sets, RPE 6. Done.

**RECOVERY / low-readiness day** (readiness < 50 OR HRV deviation < −15 %)
- One comp lift @ RPE 6, 3 sets at the prescribed reps. Pattern-paired accessory at RPE 5–6.
  Finish in 35 min. The day still earns its place — same RPE target on lighter / fewer / pause
  work (Noriega's modality switch).

### Set / Rep Structure Guide

**Straight sets** (4×6, 5×5)
- Default for accumulation. Predictable fatigue, easy RPE calibration, clear progressive overload.
- Use when the athlete's RPE-honesty is established and the load is comfortably below grinding.

**Ascending sets** (1@70 % → 1@80 % → 1@target RPE)
- Default for *overshooter* phenotype — channels the drive into earned load without front-loading
  fatigue.
- Also useful when the athlete has never taken a heavy single at this block's load — gives them
  three rehearsal opportunities to dial the brace before the working set.

**Top-set + back-offs** (1× top @ RPE 8 → 3–5× back-off ~5–8 % below)
- Intensification block default, especially for comp lifts. The Stanek / RTS pattern.
- Top set is the diagnostic; back-offs are the dose. If top set comes in heavier than RPE 8,
  back-offs scale down with it automatically (use the actual top, not the prescribed top).

**Cluster sets** (3×3 with 20–30 s intra-set rest)
- Realization / peaking weeks only. When grind has to be eliminated but high-intensity exposure
  must continue.
- Useful for athletes who can't tolerate 5×3 straight at peaking intensity but need the load exposure.

**RPE-stop sets** ("AMRAP at this load until RPE 9")
- Hypertrophy / development work on accessories — *never* on comp lifts.
- Lat pulldown, hip thrust, leg press, dumbbell work. Anti-fragile to small RPE miscalibration.

**Reps × phenotype × bottleneck** (extends bottleneckToReps)
- NEURAL bottleneck: 2–4 reps. Lower for realization, upper for accumulation.
- BALANCED: 4–6 reps.
- HYPERTROPHY bottleneck: 6–10 reps.
- Within those, lower end during intensification / realization, upper end during accumulation.

**Set count × volume target × responder** (extends responderMultiplier)
- HIGH responder, accumulation: 5–7 working sets per lift / session.
- STANDARD responder, accumulation: 4–5.
- LOW responder, accumulation: 3–4.
- Scale down 30–40 % for intensification, 50–60 % for realization, 60–70 % for deload.

### Microcycle Templates (sample week shapes)

**3-day (full-body)** — for time-constrained athletes or beginners
- Mon: Squat primary + bench secondary + light DL hinge
- Wed: Bench primary + squat secondary (light) + row
- Fri: Deadlift primary + bench secondary (light) + accessory
- Each lift gets ≥ 1 quality exposure / week. Recovery is generous.

**4-day (S/B/D split + upper)** — most popular intermediate template
- Mon: Squat day
- Tue: Bench day
- Thu: Deadlift day
- Sat: Upper repeat (light bench + OHP + arms / shoulders / face pulls)
- Bench gets 2 exposures (heavy Tue + light Sat), squat & DL get 1. Spinal-load spacing is clean.

**5-day (DUP / high-frequency)** — advanced; recovery is non-negotiable
- Mon: Squat heavy
- Tue: Bench heavy
- Wed: Pull / DL secondary + skill / GPP
- Thu: Squat light + bench accessory
- Sat: DL heavy + bench secondary
- Squat 2×, bench 2×, DL 2× per week. Only run on athletes with established RPE honesty AND
  HIGH-responder profile AND 7+ hours of consistent sleep.

### Spinal-Load Cap Per Microcycle
≤ 3 high-spinal-load sessions per 7-day window. Comp deadlift, deficit DL, comp squat, pause
squat, good morning all count as HIGH spinal load. RDL counts as MEDIUM. Hip thrust, leg press,
belt squat are LOW. If the engine is about to schedule a 4th HIGH-spinal session in 7 days,
flag and propose swapping one to a LOW alternative.

### Macrocycle Architecture (the 16-week canonical block)

Phase progression (variable by athlete; this is the canonical):
1. **Accumulation** (4 wk). Volume builds. Intensity moderate (65–75 %). RPE 6–8.
2. **Intensification** (4 wk). Volume eases ~20 %. Intensity rises (78–88 %). RPE 7.5–9.
3. **Realization / Peaking** (2–4 wk). Volume drops sharply. Intensity peaks (88–100 %). RPE 8–9.5.
4. **Deload** (1 wk). Both fall.

Within each block:
- **Week 1** = ramp-in. Reach 80–90 % of the block's planned weekly tonnage.
- **Weeks 2–3** = stimulus. Full prescribed volume + intensity.
- **Final week** = consolidate, not push. Hit the prescription cleanly. Set up the phase transition.

### Phase-Transition Rules (no re-baselining)
- **Never re-test 1RM at a phase boundary.** Promote based on the *last week's logged RPE* on
  comp-stance work. If the last week was on-target at load L, the new block uses L + 2.5 kg as
  starting load.
- Test maxes only at: end of realization (i.e., the meet), or after 8+ weeks of layoff, or as
  a calibration single when RPE drift indicates the stored max is wrong by ≥ 5 %.

### Recent-Exposure Protocol (operating principle)
When generating or modifying a session, read recentLiftExposures FIRST, then choose session shape:
1. **Days since last primary** — < 2 = no overlap; redirect to a different primary or accessory day.
2. **Trailing-7d count of this primary** — already at 3 + this week → cap intensity, no top single.
3. **Modality of last session** — last DL was a heavy comp pull → today's DL is at most a
   variation or light comp work, never another heavy comp pull.
4. **Spinal-load budget** — never stack two HIGH spinal-load sessions inside 48 h.
5. **Meet < 14 days** — overrides #2 only: comp lifts get extra exposure even at higher weekly
   counts, because peaking specificity dominates fatigue management in the final 2 weeks.
`;

// ── Multi-Frequency Programming (per-lift role per appearance) ───────────────
// When a comp lift trains 2-4×/week, each appearance must have a DISTINCT
// purpose. Treating the second / third / fourth bench day as a clone of the
// first multiplies fatigue without multiplying adaptation. This module is
// what differentiates a high-frequency program from a low-frequency program
// run twice. Bench typically gets the deepest treatment (3-4×/wk for most
// intermediates per Joey Flex / Sheiko / TSA consensus); squat 2-3×/wk;
// deadlift 1-2×/wk (occasionally 3 for advanced).

export const MULTI_FREQUENCY_KNOWLEDGE = `
## Multi-Frequency Programming — Distinct Roles per Appearance

The single biggest amateur programming error in high-frequency training is
running the same session three times. Frequency multiplies adaptation ONLY
when each appearance has a distinct purpose, intensity profile, and exercise
selection. Below are the four roles. Apply them in order: a lift's first
appearance of the week is PRIMARY, second is SECONDARY, etc.

### PRIMARY APPEARANCE (1st of the week)
- **Purpose**: peak neural stimulus, the heaviest exposure of the week.
  This is the day the program is *optimised around*.
- **Intensity**: full block prescription. Accumulation = RPE 7-8 work sets.
  Intensification = top single @ RPE 8-8.5 + back-offs at RPE 7-7.5.
  Realisation = top single @ RPE 8.5-9 + 1-2 back-offs.
- **Volume**: full block volume — the largest of the week's appearances.
- **Exercise selection**: COMPETITION variant. Comp squat, comp bench,
  comp deadlift. Not a variation — the primary day is for the lift itself.
- **Position in the week**: mid-early, ~48 h after a low-cost or recovery
  day. Tuesday for bench, Monday or Tuesday for squat, mid-week for DL.
- **Recovery cost**: HIGH. Plan 48-72 h before the next appearance.

### SECONDARY APPEARANCE (2nd of the week)
- **Purpose**: volume stimulus + skill repetition under sub-max load.
  This is where weekly tonnage actually accumulates.
- **Intensity**: -0.5 to -1.0 RPE vs primary day (RPE 6.5-7.5). The athlete
  should leave this session feeling worked, not gassed.
- **Volume**: similar set count to primary, +1 rep per set
  (DUP undulation: -0.5 RPE, +1 rep). Total tonnage often equals or exceeds
  primary day's working tonnage despite the lower intensity.
- **Exercise selection**: VARIATION of the comp lift, NOT another comp set.
  Pause squat, pause/spoto bench, deficit/pause DL, close-grip bench.
  The variation pulls a positional weakness into focus that the comp lift
  doesn't address — that's the whole point of a second appearance.
- **Position**: 48-72 h after primary. Spinal-load spacing rule applies:
  if primary was a HIGH-spinal-load lift (squat / DL), don't stack the
  secondary appearance against another HIGH lift's primary day.
- **Recovery cost**: MEDIUM. 24-36 h before the next appearance is OK.

### TERTIARY APPEARANCE (3rd of the week — mostly bench, sometimes squat for HIGH responders)
- **Purpose**: skill maintenance + technique exposure without taxing recovery.
  The point is grooving, not progress. If this session leaves the athlete
  fatigued for the next primary, it has failed.
- **Intensity**: -1.0 to -1.5 RPE vs primary (RPE 6-7). Cap loads at
  ~75 % of e1RM. Top sets are absent — straight sets only.
- **Volume**: LOW. 3 working sets is the cap. Higher rep counts (5-8) at
  the lighter load are fine; low-rep heavy sets are not — they cost
  recovery without adding stimulus the primary day didn't provide.
- **Exercise selection**: SKILL or POSITIONAL variant.
  - Bench tertiary: Spoto press at low RPE, larsen press, paused close-grip,
    OHP-primary day with bench accessories, or high-rep DB bench.
  - Squat tertiary (HIGH responder only): light high-bar 3×5 @ RPE 6,
    pause squat at low RPE, narrow stance squat for hip drilling.
  - Deadlift tertiary (advanced + HIGH responder): RDL or block-pull
    technical work, never another floor pull.
- **Position**: late in the week, ≥ 48 h before the next primary day.
  For a Tuesday primary bench, the tertiary fits Friday or Saturday.
- **Recovery cost**: LOW. Should not affect the next day's session.

### QUATERNARY APPEARANCE (4th of the week — bench only, in HIGH responder / 5-6 day programs)
- **Purpose**: speed-work or pattern frequency. Maintains the motor groove
  and CNS practice without anything that recovery would resent.
- **Intensity**: RPE 5-6 only. Compensatory acceleration on every rep —
  the goal is bar speed, not load. Bench: 50-70 % 1RM on submaximal singles
  or doubles.
- **Volume**: 2-3 sets max. Speed-bench is best at 6-8 sets × 3 reps with
  short rest (60-90 s) when the goal is dynamic effort; for skill-only
  the 2-3 set, RPE-5 ceiling applies.
- **Exercise selection**: speed bench (3-rep cluster sets at 65 % +
  bands optional), incline DB press, push-ups for high-rep specificity.
  Do NOT add tricep volume here — triceps are already cooked from days 1-3.
- **Position**: any low-spinal-load slot late week. Sunday, or as the
  "easy" session of an SBD week.
- **Recovery cost**: NEAR-ZERO. This exists to keep frequency, not stimulus.

### Cross-Cutting Rules
- A lift appearing as SECONDARY in a multi-lift session (e.g. bench tagged
  onto a squat-primary SBD day) counts as an appearance, with MEDIUM cost.
  Don't program a "real" tertiary day the next day if the lift already
  surfaced as a secondary on an SBD rehearsal.
- When pulling forward / pushing back appearances in a meet-prep block,
  preserve the role hierarchy — never demote primary to tertiary just to
  fit a schedule. If schedule constraints conflict with role hierarchy,
  drop the quaternary day first, then tertiary, then secondary. Primary
  is the last to go.
- Every appearance after primary must answer: "what is this driving that
  the primary day doesn't already cover?" If you can't articulate the
  answer in a sentence, the appearance is junk frequency.

### Bench — Detailed 4×/Week Template (Joey Flex / TSA consensus)
Primary intermediate frequency for bench. Each day has a distinct identity:
- **Day 1 / Tue** (PRIMARY): comp bench, top set + 3-4 back-offs.
  Top set RPE 8 in INTENSIFICATION. Pin press or close-grip as variation.
  Row + face pulls + tricep iso. Highest fatigue session of the week.
- **Day 2 / Thu** (SECONDARY): pause bench 4-5×3-5 @ RPE 7-7.5.
  Eliminates the bounce, builds positional strength, dedicated session.
  Lighter rows + face pulls (mandatory every bench day) + light tricep.
- **Day 3 / Sat** (TERTIARY): OHP-primary day OR pin press / Spoto
  3×3-4 @ RPE 7. Less than 30 min of bench-pattern volume. Skill keeps
  the groove alive without compounding fatigue into next Tuesday.
- **Day 4 / Sun** (QUATERNARY, optional): speed bench 6×3 @ 65 % with bands,
  or high-rep DB bench 3×10. RPE 5-6 ceiling. Skip if Sunday is a rest
  day for the rest of the program.

### Squat — 2-3×/Week Template
- **Day 1 / Mon** (PRIMARY): comp squat, top set + back-offs, full block volume.
- **Day 2 / Thu/Fri** (SECONDARY): pause squat / front squat / SSB
  4×4-6 @ RPE 7-7.5. NEVER another comp squat — the variation is the point.
- **Day 3 / Sat** (TERTIARY, HIGH responder + DUP block only):
  high-bar 3×5 @ RPE 6 OR light comp 3×3 @ RPE 6.5. Strict cap on
  spinal-load budget; a tertiary squat session will compromise next
  Monday's primary if it grinds.

### Deadlift — 1-2×/Week Template
- **Day 1** (PRIMARY): comp DL, top set + back-offs. Full prescription.
- **Day 2** (SECONDARY, advanced only): deficit DL / pause DL / block pull
  3×3-5 @ RPE 7. Variation — not another floor pull. Spinal-load rule
  is hardest here: must be ≥ 72 h after primary, ≥ 48 h before primary.
- Tertiary DL appearance is RARE and only for elite HIGH responders.
  Most lifters get more out of an extra bench / accessory day than a
  tertiary DL day, because grip + erector recovery dominates.

### Reading PER-LIFT RECENCY in this Context
The PER-LIFT RECENCY block in your context tells you the appearance role
of TODAY's session for each lift, given how many times that lift has been
primary this week:
- weekCount = 0 → today's appearance would be PRIMARY (full prescription)
- weekCount = 1 → today's appearance would be SECONDARY (variation, RPE -0.5/-1.0)
- weekCount = 2 → today's appearance would be TERTIARY (skill, low fatigue)
- weekCount ≥ 3 → today's appearance would be QUATERNARY (speed/skip)

Multi-frequency goes wrong when an athlete trains a lift 3-4×/week but
every session is "primary." That's not high-frequency — that's three
overreaching sessions. Differentiate the role, or cut the frequency.
`;

// ── Diagnostic Playbook (failure-point → cause → Rx) ──────────────────────────

export const DIAGNOSTIC_PLAYBOOK_KNOWLEDGE = `
## Diagnostic Playbook — When the Athlete is Stuck

When an athlete reports a stuck lift or an issue surfaces in the weak-points detector
(RPE_CREEP, MISSED_REPS, LOAD_PLATEAU, LIFT_IMBALANCE, VOLUME_DROP), use this playbook to map
the failure point to a likely cause and a dosed prescription. Always check bracing / setup
quality FIRST — many "weak points" are actually positional leaks, not muscular weakness.

### Bench Press
- **Fail at chest height (off-the-chest)**: weak pecs / front delts, OR not creating chest pop
  off the bottom. Rx: Spoto press 4×4 @ RPE 7 1×/wk + long-pause bench (3 sec) 3×3 @ RPE 8
  1×/wk for 4–6 wk. Add incline DB press 3×8 for pec mass.
- **Fail mid-ROM (3–6 inches up)**: front delts, OR bar path drift forward. Rx: confirm bar
  comes straight up off chest first (film it), then add DB shoulder press 3×8 + larsen press
  3×4 for upper-pec/delt strength.
- **Fail at lockout (last 1/3)**: triceps, OR loss of leg drive late. Rx: pin press at sticking
  height 3×3 @ RPE 7.5 + close-grip bench 4×6 @ RPE 7 1×/wk + tricep direct 4×8 (pushdowns or
  skullcrushers) 2×/wk. Confirm leg drive is held through the rep — film from feet.

### Squat
- **Fail in the hole / first 4 inches up**: glutes & hamstrings (posterior chain) OR
  bracing collapse. Rx: pause squat 4×4 @ RPE 7 1×/wk + heavy RDL 4×6 @ RPE 7 + ab wheel
  rollouts 3×8 daily. Check brace at the bottom — if pelvis tucks, brace is failing, not
  glutes.
- **Fail mid-ROM (between hole and lockout)**: quads, OR forward lean breaking position.
  Rx: front squat 3×5 @ RPE 7 on a second squat day + tempo squat (4-1-0) 3×5. If forward
  lean is the cause, address ankle dorsiflexion before adding load.
- **Fail near lockout / "stuck halfway"**: upper-back stiffness or quad endurance. Rx:
  high-bar squat 3×5 @ RPE 7 (forces upright) + heavy walkouts at 110 % squat max
  3×30 sec for upper-back tolerance.

### Deadlift
- **Fail off the floor**: leg drive + lat tension. Bar should NOT lift before hips drop into
  the bar. Rx: deficit DL (1–2") 4×3 @ RPE 7 1×/wk + heavy rows 4×6 + paused DL 2" off floor
  3×2 @ RPE 7.5. Confirm lats engaged at setup (cue: "bend the bar around your shins").
- **Fail at the knee**: upper back rounding, lat tension lost mid-pull. Rx: paused DL at knee
  3×2 @ RPE 7 + heavy barbell rows 4×5 @ RPE 8 + chest-supported row to remove momentum.
- **Fail at lockout**: glute lockout strength, OR grip giving up at the top. Rx: heavy hip
  thrust 4×6 @ RPE 7 + block pull (2–4") 3×3 @ RPE 8 1×/wk. If grip is the limiter, learn
  hook grip and add static holds @ 110 % DL × 20 sec ×3.

### Tightness vs Muscular Sticking
Many sticking points are *bracing* failures, not strength deficits. Diagnose by checking
pre-set quality:
- If the brace was incomplete (chest breath, no 360° pressure, belt loose), the sticking
  point is a *position* failure — fix bracing, not the muscle. Re-test the load with proper
  setup before prescribing accessories.
- If the brace was clean and the rep still failed at a specific point, *then* it's muscular.
  Pursue the dosed Rx above.

### Reading Weak-Point Detector Output
- **RPE_CREEP** on a comp lift = recovery debt OR stored max is too high. Diagnose by
  checking trailing-2-wk readiness; if readiness was solid, the max is wrong — drop 5 %
  and re-test.
- **MISSED_REPS** repeating across 2 sessions = max is too high OR overshooter phenotype
  not adjusted. Drop 5 % load + recalibrate RPE expectations.
- **LOAD_PLATEAU** ≥ 3 weeks = stimulus has gone stale. Rotate the variation slot, do not
  add load — adding load to a stalled lift just deepens the plateau.
- **LIFT_IMBALANCE** = relative-strength outlier. Audit weekly frequency on the lagging
  lift; usually under-frequencied. Add an exposure before adding accessories.
- **VOLUME_DROP** ≥ 25 % vs 4-wk average = athlete is sandbagging the program OR adherence
  has slipped. Check in on life context before reducing prescribed volume — often the
  program is fine and the athlete just needs scheduling support.
`;

// ── Modern Fatigue Management ─────────────────────────────────────────────────

export const FATIGUE_MANAGEMENT_KNOWLEDGE = `
## Modern Fatigue Management — Beyond MEV/MAV/MRV

### Stress Index (Tuchscherer)
- Weekly Σ(set RPE × reps × intensity %). The number itself is athlete-specific; the *trend*
  is universal.
- Stress Index rising while comp-lift e1RM is flat or declining = recovery debt, not
  productive overreach. Action: deload week or volume cut 20–30 %.
- Stress Index flat while e1RM is rising = sweet spot. Hold the prescription.

### Volume-First Deload Taper (peaking, modern consensus)
Volume drives more fatigue than intensity. Cut volume first, intensity trails by ~1 week.

**4-week peaking taper (elite athletes):**
- Wk -4: Overreach. Volume up ~30–50 % vs. normal week. Intensity normal.
- Wk -3: Cut volume 30–40 %. Intensity stays high (close to comp).
- Wk -2: Cut both. Volume already low; intensity comes off ~5–10 %.
- Wk -1 (meet week): Light technical only. Comp lifts only. Top single ≤ 70 % at RPE 6.
  Heaviest work earlier in week, then full rest the 48 h before meet day.

**3-week taper (intermediate):** Same shape, compress -4 wk into -3 wk (overreach + first cut
combined).

**2-week taper (novice or athlete with low fatigue accumulation):** Wk -2 = volume cut, wk -1
= light technical. Skip the overreach phase.

### Reactive vs Proactive Deloads
- **Proactive**: every 4–6 wk regardless of how the athlete feels. Prevents accumulation faster
  than the athlete can detect it.
- **Reactive**: triggered by ANY of —
  - 7-day average readiness < 50
  - HRV deviation < −15 % for 3+ consecutive days
  - RPE creep + same load on a comp lift across 2 sessions
  - Stress Index trending up while comp-lift e1RM is flat
  - Athlete reports two consecutive nights of < 6 h sleep
- *Any one* trigger fires a deload — don't wait for two. The cost of an unneeded deload is
  small; the cost of a missed one is a stalled block.

### Tonnage Cap Rule (when stuck despite hitting numbers)
- When volume × frequency × intensity all check the prescription but no e1RM progress for
  2–3 wk: cut weekly working sets by 20–30 % for one mini-block (1 wk), then add load back.
- Counterintuitive but standard: more volume on a stalled lift makes it worse. Volume already
  exceeded what the athlete recovers from at this load.

### Recovery-Debt Heuristic (mandatory deload)
If 7-day average readiness < 50 *AND* HRV deviation < −15 % for 3 consecutive days, mandate
a deload week regardless of what phase the program is in. No negotiation. Skipping this
costs more than the 7 days you'd save.

### Sleep / Stress Integration
- Sleep < 6 h → cut today's volume 30 %, drop RPE target 0.5.
- Sleep < 5 h two nights running → recovery session only (RPE 6 max, half the volume).
- High life-stress periods (work, travel, family): training is one stress bucket of many.
  Reduce volume 20–30 % and maintain intensity. Adding volume to "cope" is the wrong direction.

### What Doesn't Work
- "Pushing through" extended fatigue accumulation. The athlete will come back stronger from
  a 5-day deload than from another week of grinding through.
- Assuming a single bad readiness day is significant. Trends matter. One score does not.
- Equating soreness with productive training. DOMS is mostly novelty / eccentric load, not
  a "good workout" indicator.
`;

// ── Peaking Templates (concrete, callable) ────────────────────────────────────

export const PEAKING_TEMPLATE_KNOWLEDGE = `
## Peaking Templates — Concrete Day-by-Day

The existing meet-prep section is high-level. These are callable templates. Pick by athlete
class; the principles apply across all of them.

### 4-Week Peak (Elite — competitive total at platform)
- Wk -4 (overreach): comp lifts at 85–88 % for triples, RPE 8. ~50 % more working volume than
  baseline week. All accessories present.
- Wk -3: comp lifts at 88–92 % for doubles, RPE 8. Volume cut 35 %. Drop secondary accessories
  (keep face pulls, rows, hip thrust; drop tricep iso, leg press, lat pulldown).
- Wk -2: comp lifts at 91–95 % for singles, RPE 8.5. Volume cut another 25 %. Comp-stance/grip
  only. Command practice every comp single. One technical session per lift, that's it.
- Wk -1 (meet week): Mon = openers as singles @ RPE 7. Tue = optional light bench openers @
  RPE 6. Wed–Fri = rest (light walk, mobility OK). Sat = meet day.

### 3-Week Peak (Intermediate)
- Wk -3 (overreach): 80–85 % for triples, RPE 7.5. Volume up ~20–30 %.
- Wk -2: 88–92 % for singles + doubles, RPE 8. Volume cut 30 %. Accessory minimization begins.
- Wk -1: openers Mon, light Tue, full rest Wed–Fri.

### 2-Week Peak (Novice / first meet)
- Wk -2: comp-stance singles at 88–92 %, RPE 8. Volume cut 25 %.
- Wk -1: openers Mon, full rest Tue–Fri (or 1 light technical session).

### Attempt Selection (precise)
- **Opener**: 91–93 % of best recent comp single. Not training max. Should hit on the worst
  day with full meet adrenaline. Math: if last comp single was 200 kg × 1 @ RPE 8, opener is
  186–188 kg.
- **2nd**: ≈ current 1RM (RPE 9 at home). If opener flew, jump 5–7 %; if grindy, jump 2.5–4 %.
- **3rd**: +2.5–7.5 kg above 2nd, conditional on how the 2nd went. Math: 2nd flew at RPE 8
  → +5 kg PR call; 2nd grindy at RPE 9 → +1–2.5 kg or repeat.

### Weigh-In Protocols by Format
**24-hour weigh-in, conservative cut (1.5–3 %)**
- 14d out: high water (8–10 L), high sodium (5–7 g/d). Body adapts: aldosterone drops.
- 4d out: drop sodium to 2 g/d. Water stays at 6–8 L.
- 1d out: water to 0.5–1 L, finish eating 4–6 h before weigh-in.
- Post weigh-in: 1–1.5 L electrolyte drink (Pedialyte + sodium) over 2 h, then slow
  carb-load with rice / potatoes / salt. Aim 80–90 % of lost weight back in 16 h.

**2-hour weigh-in**
- Maximum 1–1.5 % water cut. Anything more, you can't refill in time.
- Skip sodium manipulation. Sip electrolytes, eat familiar foods, don't experiment.

### Mental Rehearsal Cadence
- Wk -2 onward: visualisation 3×/day, ≤ 2 min each. Setup → breath → cue → drive.
  Always successful in the visualisation. Failed reps in the head become failed reps on the platform.
- Meet day: warm-up room rehearsal of every comp single — even at low warmup loads. Same
  setup ritual, same breath, same cue.
`;

// ── Alternative Methodologies (lineage-aware sidebar) ────────────────────────

export const ALT_METHODOLOGY_KNOWLEDGE = `
## Alternative Methodologies — Lineage Context

The Lockedin coach defaults to RPE-driven block periodization. Athletes coming from other
backgrounds may reference these systems. Speak fluently to them, then explain why the
default fits their phenotype + goal — or recommend the alternative when it genuinely fits.

### Conjugate / Westside Barbell
- **Max Effort + Dynamic Effort + Repeated Effort.** ME work is at or above 90 % 1RM, rotated
  every 1–3 weeks across a stable of variations to manage fatigue and skill. DE work is speed
  retention at submaximal load (50–60 % + bands).
- **Modern raw adaptations**: pure Westside has high carryover when geared (bands + chains),
  but raw lifters tend to need more comp-specific work than conjugate's ME-rotation provides.
  Treat ME as a *variation* slot, not the primary lift, in raw programs.
- **When to recommend**: athlete is bored, plateaued, or temperamentally suited to "every
  session is heavy." Not a great fit for adherence-first or HYPERTROPHY-bottlenecked athletes.

### 5/3/1 (Wendler)
- **Percentage-based, low decision burden.** 4-week waves: 65/75/85 +reps, 70/80/90 +reps,
  75/85/95 +1, deload. Add 2.5–5 kg per cycle.
- **Strengths**: dead simple, sustainable, great adherence, perfect for athletes managing
  competing priorities (life, sport, age).
- **Ceiling**: intermediates plateau eventually because volume is fixed and AMRAPs are the
  only autoregulation. Move to RPE block periodization when 5/3/1 stalls.

### DUP (Daily Undulating Periodization)
- **Same week, different rep ranges.** Mon = heavy 3s, Wed = moderate 5s, Fri = light 8s.
- **Evidence base**: solid for strength + hypertrophy. Slightly better than linear progression
  for trained athletes per most meta-analyses.
- **When to use**: athletes who get bored on linear blocks, athletes with limited weekly
  schedules who need each session to do multiple things, athletes pursuing strength and
  hypertrophy simultaneously.

### Bulgarian Method
- **Daily max work in a small handful of lifts.** Almost never appropriate for raw powerlifting;
  fatigue management is incompatible with full-time work and adherence.
- Mention only if athlete asks. Redirect to RPE-block with high frequency as the safer cousin.

### Sheiko (revisited)
- **All comp lifts, every session, submaximal intensity.** Volume through frequency, not
  per-session excess. Most sessions cap at 80 % 1RM.
- **When to recommend**: high-frequency tolerant athletes, athletes peaking for a meet who
  thrive on technique repetition under fatigue, athletes who hate variation.

### Choosing Between Them (decision tree)
- **Adherence concerns / time-constrained**: 5/3/1.
- **HIGH responder + high frequency tolerance**: Sheiko or RPE high-frequency block.
- **NEURAL bottleneck + ME-rotation appetite**: Conjugate as a variation framework.
- **Default for everyone else**: RPE-driven block periodization (the Lockedin default).
`;

// ── Assembler ─────────────────────────────────────────────────────────────────

/**
 * Returns the full knowledge base as a single string.
 * Injected into the system prompt when no specific topic match is found.
 */
export function getFullKnowledge(): string {
  return [
    // Framework leads — operating context for how the coach thinks before
    // reaching for any specific philosophy or domain knowledge.
    COACHING_FRAMEWORK_KNOWLEDGE,
    COACH_PRINCIPLES_KNOWLEDGE,
    RPE_KNOWLEDGE,
    RPE_DEEP_KNOWLEDGE,
    PERIODIZATION_KNOWLEDGE,
    STRUCTURE_KNOWLEDGE,
    MULTI_FREQUENCY_KNOWLEDGE,
    FATIGUE_MANAGEMENT_KNOWLEDGE,
    BREATHING_BRACING_KNOWLEDGE,
    ADVANCED_TECHNIQUE_KNOWLEDGE,
    EXERCISE_KNOWLEDGE,
    DIAGNOSTIC_PLAYBOOK_KNOWLEDGE,
    SESSION_DESIGN_KNOWLEDGE,
    CALISTHENICS_KNOWLEDGE,
    STREET_LIFT_KNOWLEDGE,
    HYBRID_PROGRAMMING_KNOWLEDGE,
    NUTRITION_KNOWLEDGE,
    RECOVERY_KNOWLEDGE,
    MEET_PREP_KNOWLEDGE,
    PEAKING_TEMPLATE_KNOWLEDGE,
    INJURY_KNOWLEDGE,
    PROGRAMMING_KNOWLEDGE,
    ALT_METHODOLOGY_KNOWLEDGE,
  ].join('\n');
}

/** Matches any whole-word keyword token in the topic string. */
function hasAny(t: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => t.includes(k));
}

/** Counts how many keywords match (used as the section's score). */
function countMatches(t: string, keywords: readonly string[]): number {
  let n = 0;
  for (const k of keywords) if (t.includes(k)) n += 1;
  return n;
}

const KW_RPE           = [
  'rpe', 'rir', 'load', 'intensity', 'half rpe', 'rpe drift', 'rpe creep',
  'sandbag', 'overshoot', 'undershoot', 'calibrat', 'e1rm',
] as const;
const KW_PERIODIZATION = [
  'periodiz', 'block', 'program', 'volume', 'mrv', 'mev', 'mav', 'dup',
] as const;
const KW_STRUCTURE     = [
  'session structur', 'session design', 'set scheme', 'rep scheme',
  'sets and reps', 'how many sets', 'how many reps', 'cluster',
  'top set', 'top-set', 'back off', 'back-off', 'backoff', 'amrap',
  'straight set', 'ascending', 'descending',
  'microcycle', 'macrocycle', 'mesocycle',
  'week structure', 'training week', 'split', 'template',
  'recent exposure', 'days since', 'how often', 'frequency',
  'phase transition', 'phase boundary',
] as const;
const KW_FATIGUE_MGMT  = [
  'fatigue', 'overreach', 'taper', 'stress index', 'deload',
  'recovery debt', 'tonnage cap', 'volume-first', 'volume first',
] as const;
const KW_MULTI_FREQUENCY = [
  'frequency', 'high frequency', 'high-frequency',
  'second day', 'third day', 'fourth day',
  'multiple times', 'twice a week', 'three times', '3x', '4x',
  '3 times', '4 times', 'x/week', '×/week',
  'primary day', 'secondary day', 'tertiary', 'quaternary',
  'secondary', 'second', 'third', 'fourth',
  'second appearance', 'third appearance', 'fourth appearance',
  'dup', 'undulat',
  'bench frequency', 'squat frequency', 'deadlift frequency',
  'how often',
  // Lift-name + day cues that almost always signal multi-frequency questions
  'second bench', 'third bench', 'fourth bench',
  'second squat', 'third squat',
  'second deadlift',
  'speed bench', 'speed work', 'dynamic effort',
  'volume day', 'intensity day',
] as const;
const KW_EXERCISE      = [
  'exercis', 'squat', 'bench', 'deadlift', 'technique', 'cue', 'weak',
  'accessory', 'rdl', 'row', 'press', 'hinge',
] as const;
const KW_DIAGNOSTIC    = [
  'stuck', 'sticking', 'fail', 'miss', 'weak point', 'weakness',
  'diagnos', 'why is', 'why am i', 'plateau', 'plateaued', 'stalled',
  'rpe creep', 'rpe_creep', 'load_plateau', 'lift_imbalance',
] as const;
const KW_SESSION_DESIGN = [
  'session design', 'session layout', 'too many', 'redundant', 'duplicate',
  'movement pattern', 'spinal load', 'posterior chain', 'hip thrust',
  'deadlift day', 'squat day', 'bench day', 'accessory select',
  'exercise select', 'programme quality', 'program quality',
  'four deadlift', '4 deadlift', 'hinge cap', 'hinge limit',
] as const;
const KW_CALISTHENICS  = [
  'calisthen', 'bodyweight', 'muscle-up', 'muscleup', 'muscle up',
  'pull-up', 'pullup', 'pull up', 'chin-up', 'chinup',
  'dip ', ' dip', 'dips',
  'front lever', 'back lever', 'planche', 'pistol', 'one-arm', 'one arm',
  'false grip', 'hollow body', 'ring ', 'rings', 'scap',
  'progression', 'tuck lever', 'straddle',
] as const;
const KW_STREET_LIFT   = [
  'street lift', 'street-lift', 'streetlift', 'ifbsl', 'wswcf',
  'weighted pull', 'weighted dip', 'weighted muscle', 'dip belt',
] as const;
const KW_NUTRITION     = [
  'nutrit', 'diet', 'calor', 'kcal', 'protein', 'carb', 'fat ', 'macro',
  'supplement', 'meal', 'weight class', 'water cut', 'sodium', 'hydrat',
  'refeed', 're-feed', 'diet break', 'leptin', 'cut', 'bulk', 'recomp',
  'maintenance', 'caffein', 'creatine', 'intra-workout', 'intra workout',
  'fast', 'fasted', 'eat', 'fueling', 'glycogen',
] as const;
const KW_RECOVERY      = ['recover', 'sleep', 'stress', 'hrv', 'sore', 'rest'] as const;
const KW_MEET          = [
  'meet', 'compet', 'peak', 'attempt', 'opener', 'weigh-in', 'weigh in',
  'command', 'taper', 'final week', 'second attempt', 'third attempt',
] as const;
const KW_INJURY        = [
  'injur', 'pain', 'hurt', 'shoulder', 'knee', 'back pain', 'lower back',
  'hip', 'elbow', 'wrist', 'tendin', 'strain',
] as const;
const KW_PROGRAMMING   = [
  'adjust', 'max', 'swap', 'modif', 'chang', 'responder',
  'phenotype', 'abbreviat',
] as const;
const KW_COACH         = [
  'tuchscherer', 'tuscher', 'rts ', 'reactive training',
  'joey flex', 'joeyflex',
  'joe stanek', 'stanek', '1repmethods',
  'marcellus', 'millz', 'wallace',
  'noriega', 'sean noriega', 'hamstringpapi',
  'sheiko', 'boris sheiko',
  'bryce lewis', 'tsa ', 'strength athlete',
  'greg nuckols', 'stronger by science', 'nuckols',
  'powerliftingnow', 'powerlifting now',
  'ben pollack', 'pollack',
  'chris duffin', 'duffin', 'kabuki',
  'autoregul', 'specificity', 'adherence',
  'philosoph', 'princip', 'approach',
] as const;
const KW_BREATHING     = [
  'breath', 'brac', 'iap', 'intra-abdominal', 'valsalva', 'belt',
  '360', 'pressure', 'diaphragm', 'oblique', 'pelvic floor',
  'draw in', 'core stability', 'brace your', 'belly breath',
] as const;
const KW_ADVANCED_TECH = [
  'top set', 'top-set', 'backoff', 'back-off', 'back off',
  'fatigue percent', 'high-bar', 'high bar', 'low-bar', 'low bar',
  'sumo', 'conventional', 'stance', 'pause', 'paused rep',
  'hook grip', 'mixed grip', 'spread the floor',
] as const;
const KW_HYBRID        = [
  'hybrid', 'mix', 'combine', 'split',
  'street-lift', 'street lift', 'weighted pull', 'weighted dip',
  'calisthenic', 'fatigue stacking', 'stacking',
  'upper body', 'lower body', 'push pull', 'push-pull',
] as const;
const KW_ALT_METHOD    = [
  'conjugate', 'westside', 'dynamic effort', 'max effort',
  '5/3/1', 'wendler', 'bulgarian',
  'undulat', 'linear progression',
] as const;
// Framework keywords — meta-layer about how to coach (mindset, decision-making,
// athlete patterns, voice). Distinct from KW_COACH which is named philosophies.
const KW_FRAMEWORK     = [
  'mindset', 'how do you', 'how should i', 'how should we', 'why do you',
  'inconsistent responder',
  'first principles', 'reason', 'reasoning',
  'voice', 'tone',
  'long-term', 'long term', 'sustain', 'invariant', 'non-negotiable', 'non negotiable',
  'autonomy', 'pushback', 'push back', 'disagree',
  'lever', 'progression mechanism', 'progressive overload',
  'time-to-peak', 'time to peak',
] as const;

// ── Section catalog (single source of truth for retrieval) ───────────────────
//
// Each entry pairs the section text with its keyword bag and a soft per-section
// budget. Topic retrieval scores each section by keyword-match count, sorts by
// score, then assembles within a 6 KB total budget. Per-section soft caps stop
// any one section from starving the others when it scores highest.

interface KbSection {
  readonly content: string;
  readonly keywords: readonly string[];
  readonly softCap: number;
  /** Bonus added to score; used to pin universally useful sections. */
  readonly priorityBonus?: number;
}

const SECTION_CATALOG: readonly KbSection[] = [
  // Framework is pinned (priority bonus); always leads the prompt regardless
  // of keyword match.
  { content: COACHING_FRAMEWORK_KNOWLEDGE,    keywords: KW_FRAMEWORK,      softCap: 1500, priorityBonus: 1000 },
  { content: COACH_PRINCIPLES_KNOWLEDGE,      keywords: KW_COACH,          softCap: 1800 },
  { content: RPE_KNOWLEDGE,                   keywords: KW_RPE,            softCap: 800  },
  { content: RPE_DEEP_KNOWLEDGE,              keywords: KW_RPE,            softCap: 1200 },
  { content: PERIODIZATION_KNOWLEDGE,         keywords: KW_PERIODIZATION,  softCap: 800  },
  { content: STRUCTURE_KNOWLEDGE,             keywords: KW_STRUCTURE,      softCap: 2000 },
  { content: MULTI_FREQUENCY_KNOWLEDGE,       keywords: KW_MULTI_FREQUENCY, softCap: 2000 },
  { content: FATIGUE_MANAGEMENT_KNOWLEDGE,    keywords: KW_FATIGUE_MGMT,   softCap: 1400 },
  { content: BREATHING_BRACING_KNOWLEDGE,     keywords: KW_BREATHING,      softCap: 1200 },
  { content: ADVANCED_TECHNIQUE_KNOWLEDGE,    keywords: KW_ADVANCED_TECH,  softCap: 1800 },
  { content: EXERCISE_KNOWLEDGE,              keywords: KW_EXERCISE,       softCap: 1500 },
  { content: DIAGNOSTIC_PLAYBOOK_KNOWLEDGE,   keywords: KW_DIAGNOSTIC,     softCap: 1500 },
  { content: SESSION_DESIGN_KNOWLEDGE,        keywords: KW_SESSION_DESIGN, softCap: 1400 },
  { content: CALISTHENICS_KNOWLEDGE,          keywords: KW_CALISTHENICS,   softCap: 1500 },
  { content: STREET_LIFT_KNOWLEDGE,           keywords: KW_STREET_LIFT,    softCap: 1200 },
  { content: HYBRID_PROGRAMMING_KNOWLEDGE,    keywords: KW_HYBRID,         softCap: 1500 },
  { content: NUTRITION_KNOWLEDGE,             keywords: KW_NUTRITION,      softCap: 1800 },
  { content: RECOVERY_KNOWLEDGE,              keywords: KW_RECOVERY,       softCap: 800  },
  { content: MEET_PREP_KNOWLEDGE,             keywords: KW_MEET,           softCap: 1600 },
  { content: PEAKING_TEMPLATE_KNOWLEDGE,      keywords: KW_MEET,           softCap: 1500 },
  { content: INJURY_KNOWLEDGE,                keywords: KW_INJURY,         softCap: 800  },
  { content: PROGRAMMING_KNOWLEDGE,           keywords: KW_PROGRAMMING,    softCap: 1000 },
  { content: ALT_METHODOLOGY_KNOWLEDGE,       keywords: KW_ALT_METHOD,     softCap: 1000 },
];

const TOTAL_KNOWLEDGE_BUDGET = 6000;

/**
 * Returns knowledge relevant to a specific topic.
 *
 * Algorithm:
 * 1. Score each catalog section by keyword-match count + priority bonus.
 * 2. Sort by score (descending), keeping framework pinned first.
 * 3. Assemble within TOTAL_KNOWLEDGE_BUDGET. If a section's softCap would
 *    exceed remaining budget, slice it. Skip sections with score 0 once the
 *    framework + a fallback have been included.
 *
 * Keywords are matched case-insensitively as substrings (kept simple — no
 * embeddings — to stay debuggable and zero-dependency).
 */
export function getTopicKnowledge(topic: string): string {
  const t = topic.toLowerCase();

  // Score every section.
  const scored = SECTION_CATALOG.map((sec) => ({
    sec,
    score: countMatches(t, sec.keywords) + (sec.priorityBonus ?? 0),
  }));

  // Sort descending by score; stable fallback preserves catalog order.
  scored.sort((a, b) => b.score - a.score);

  // If nothing matched beyond the pinned framework, fall back to a useful
  // domain set so the coach isn't stranded with only the framework.
  const keywordHits = scored.filter((s) => s.score > 0 && !s.sec.priorityBonus).length;
  if (keywordHits === 0) {
    // Promote universally useful sections to scored > 0 so they pass the gate.
    const fallback = new Set<string>([
      COACH_PRINCIPLES_KNOWLEDGE,
      BREATHING_BRACING_KNOWLEDGE,
      EXERCISE_KNOWLEDGE,
      SESSION_DESIGN_KNOWLEDGE,
      STRUCTURE_KNOWLEDGE,
      PROGRAMMING_KNOWLEDGE,
    ]);
    for (const s of scored) if (fallback.has(s.sec.content)) s.score = Math.max(s.score, 1);
    scored.sort((a, b) => b.score - a.score);
  }

  // Assemble within the global budget, soft-capping each section.
  const out: string[] = [];
  let remaining = TOTAL_KNOWLEDGE_BUDGET;
  for (const { sec, score } of scored) {
    if (score === 0) break;
    if (remaining <= 0) break;
    const take = Math.min(sec.softCap, remaining);
    if (sec.content.length <= take) {
      out.push(sec.content);
      remaining -= sec.content.length;
    } else {
      out.push(sec.content.slice(0, take - 1).trimEnd() + '…');
      remaining -= take;
    }
  }
  return out.join('\n');
}
