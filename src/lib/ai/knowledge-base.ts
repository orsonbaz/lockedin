/**
 * knowledge-base.ts — Comprehensive powerlifting coaching & nutrition knowledge.
 *
 * This module contains domain knowledge that gets injected into the AI coach
 * system prompt. It covers:
 *   - RPE/RIR training theory
 *   - Periodization principles
 *   - Exercise selection & technique cues
 *   - Injury prevention & management
 *   - Nutrition & weight management for powerlifters
 *   - Meet preparation & peaking
 *   - Recovery science
 *
 * All content is written in a compressed coaching-style format to minimize
 * token usage while maximizing information density.
 */

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
- Weak point fixes:
  - Weak out of hole: Pause squats, pin squats, leg press, belt squats.
  - Sticking point mid-range: Tempo squats, half squats, front squats.
  - Forward lean: Front squats, SSB squats, heel-elevated squats.
  - Knee cave: Banded squats, adductor work, single-leg pressing.

### Bench Press
- Setup: Arch (natural thoracic extension, NOT lumbar). Shoulder blades retracted and depressed ("in your back pockets").
- Grip: Ring finger on rings (standard), or adjusted for arm length. Wrists straight or slightly cocked back.
- Touch point: Just below nipple line (xiphoid process area). Varies by arch and arm length.
- Drive: Leg drive — feet flat (IPF) or on toes (some feds). Press back toward face off chest, then straight up.
- Pause: On competition commands — "Start," "Press," "Rack." Practice with a 1-2 second pause.
- Common errors: Flaring elbows too early (shoulder stress), uneven press, losing leg drive.
- Weak point fixes:
  - Weak off chest: Spoto press, long pause bench, DB bench, push-ups.
  - Weak at lockout: Board press, floor press, close-grip bench, tricep work.
  - Shoulder pain: Widen grip slightly, improve arch, add rotator cuff work, reduce frequency.

### Deadlift
- Conventional setup: Feet hip-width. Shins 1" from bar. Grip just outside knees. "Push the floor away."
- Sumo setup: Wide stance (toes reach plates). Grip inside knees. "Spread the floor." Hips close to bar.
- Brace: Same belly breath as squat. Lock lats ("protect your armpits" / "bend the bar around your shins").
- Pull: Bar stays against body entire pull. Hips and shoulders rise together. Lock hips, don't hyperextend.
- Common errors: Hips shooting up (weak quads or starting hips too low), rounded upper back (weak lats), hitching.
- Weak point fixes:
  - Weak off floor: Deficit deadlifts, pause deadlifts, front squats (quad strength).
  - Weak at lockout: Block/rack pulls, hip thrusts, Romanian deadlifts, barbell rows.
  - Grip failure: Hook grip, mixed grip rotation, heavy holds, fat grips.
  - Rounding back: Pause deadlifts, rows, direct spinal erector work.

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

// ── Nutrition for Powerlifters ────────────────────────────────────────────────

export const NUTRITION_KNOWLEDGE = `
## Nutrition for Powerlifters

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

// ── Assembler ─────────────────────────────────────────────────────────────────

/**
 * Returns the full knowledge base as a single string.
 * This is injected into the system prompt when using Groq (online mode)
 * where we have more context window.
 *
 * For on-device mode, use getCompactKnowledge() instead.
 */
export function getFullKnowledge(): string {
  return [
    RPE_KNOWLEDGE,
    PERIODIZATION_KNOWLEDGE,
    EXERCISE_KNOWLEDGE,
    NUTRITION_KNOWLEDGE,
    RECOVERY_KNOWLEDGE,
    MEET_PREP_KNOWLEDGE,
    INJURY_KNOWLEDGE,
    PROGRAMMING_KNOWLEDGE,
  ].join('\n');
}

/**
 * Returns a compact knowledge base for on-device mode (smaller context window).
 * Focuses on the most actionable knowledge.
 */
export function getCompactKnowledge(): string {
  return [
    EXERCISE_KNOWLEDGE,
    NUTRITION_KNOWLEDGE,
    PROGRAMMING_KNOWLEDGE,
  ].join('\n');
}

/**
 * Returns knowledge relevant to a specific topic.
 */
export function getTopicKnowledge(topic: string): string {
  const t = topic.toLowerCase();
  const sections: string[] = [];

  if (t.includes('rpe') || t.includes('load') || t.includes('intensity'))
    sections.push(RPE_KNOWLEDGE);
  if (t.includes('periodiz') || t.includes('block') || t.includes('program') || t.includes('volume'))
    sections.push(PERIODIZATION_KNOWLEDGE);
  if (t.includes('exercis') || t.includes('squat') || t.includes('bench') || t.includes('deadlift') || t.includes('technique') || t.includes('cue') || t.includes('weak'))
    sections.push(EXERCISE_KNOWLEDGE);
  if (t.includes('nutrit') || t.includes('diet') || t.includes('calor') || t.includes('protein') || t.includes('carb') || t.includes('fat') || t.includes('supplement') || t.includes('meal') || t.includes('weight') || t.includes('cut') || t.includes('bulk'))
    sections.push(NUTRITION_KNOWLEDGE);
  if (t.includes('recover') || t.includes('sleep') || t.includes('stress') || t.includes('hrv') || t.includes('sore'))
    sections.push(RECOVERY_KNOWLEDGE);
  if (t.includes('meet') || t.includes('compet') || t.includes('peak') || t.includes('attempt') || t.includes('opener'))
    sections.push(MEET_PREP_KNOWLEDGE);
  if (t.includes('injur') || t.includes('pain') || t.includes('shoulder') || t.includes('knee') || t.includes('back') || t.includes('hip') || t.includes('elbow'))
    sections.push(INJURY_KNOWLEDGE);
  if (t.includes('adjust') || t.includes('max') || t.includes('swap') || t.includes('modif') || t.includes('chang') || t.includes('frequency'))
    sections.push(PROGRAMMING_KNOWLEDGE);

  // If nothing matched, return the most universally useful sections
  if (sections.length === 0) {
    sections.push(EXERCISE_KNOWLEDGE, NUTRITION_KNOWLEDGE, PROGRAMMING_KNOWLEDGE);
  }

  return sections.join('\n');
}
