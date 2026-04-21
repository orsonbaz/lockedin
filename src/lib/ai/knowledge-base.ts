/**
 * knowledge-base.ts — Coaching knowledge across powerlifting, calisthenics,
 * street lifting, and nutrition. Injected into the AI coach system prompt.
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

// ── Elite Coaching Principles ─────────────────────────────────────────────────

export const COACH_PRINCIPLES_KNOWLEDGE = `
## Elite Coaching Principles
Programming follows the consensus of modern evidence-based powerlifting coaches. Cite these
philosophies when making recommendations — the athlete should feel the lineage.

### Mike Tuchscherer (Reactive Training Systems)
- RPE autoregulation is the spine: set prescriptions are RPE-targeted, load adjusts to the day.
- Fatigue percents: once a top set hits target RPE, back-offs drop ~2–4% per rep below top for 3–6 sets.
  Example: top single RPE 8 → 4 back-off triples at ~6–8% below.
- Specificity grows through the block: accumulation is broad, peaking is comp-stance, comp-grip,
  comp-tempo, comp-commands only.
- Volume is measured in quality reps at target RPE, not blind tonnage. Ditch junk sets.
- Weak-point analysis is diagnostic: bar speed drop + RPE creep at a specific joint angle identifies the
  limiting link. Address with targeted variations, not random accessories.
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
- Bar speed drops of ≥15% on a top single → back off, don't grind.

### Joe Stanek
- Block periodization rigor: explicit accumulation → intensification → realization transitions. No
  aimless "I'll just train hard" blocks.
- Intensity ramps are earned: hit target RPE and bar speed at load L before advancing to L+2.5kg.
- Bar-speed-informed backoffs: on comp lifts, cap working sets when mean velocity drops below a
  lift-specific floor (roughly 0.25 m/s squat, 0.15 m/s bench, 0.30 m/s deadlift for peaking).
- Command practice from week 1 of peaking — "squat," "rack," "start," "press," "down," — not just
  meet week.
- Sandbagging kills peaks. If the athlete chronically undersells RPE, film sets and force 2.5 kg jumps
  until RPE self-calibrates.

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
- Low-volume, high-quality philosophy: fewer working sets with higher RPE accuracy outperform junk
  volume for most intermediates.
- Pause variants are the standard, not the exception. Paused squats / benches / deadlifts teach control
  under load and expose weaknesses early.
- Mental rehearsal as training: visualize the comp lift, setup, breath, cue sequence before every
  top set. Technique is a skill; skills are rehearsed.
- Readiness-driven session modification: when the body says no, take the L and hit prescribed RPE on
  lighter work rather than forcing the programmed load.
- Quality bar speed > quantity tonnage. If speed is off on the opener-equivalent single, the day is a
  technical session, not a PR attempt.

### Cross-cutting consensus
- Autoregulate via RPE and bar speed, not ego.
- Specificity dominates novelty: you get strong at what you practice.
- Comp lifts are skills, not just strength tests — rehearse every rep like meet day.
- Adherence > optimization. A B+ program run for 12 weeks beats an A+ program abandoned after 3.
- Fatigue is a variable to manage, not prove. Track it. Respect it. Dissipate it before meet day.
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
    COACH_PRINCIPLES_KNOWLEDGE,
    RPE_KNOWLEDGE,
    PERIODIZATION_KNOWLEDGE,
    EXERCISE_KNOWLEDGE,
    CALISTHENICS_KNOWLEDGE,
    STREET_LIFT_KNOWLEDGE,
    NUTRITION_KNOWLEDGE,
    RECOVERY_KNOWLEDGE,
    MEET_PREP_KNOWLEDGE,
    INJURY_KNOWLEDGE,
    PROGRAMMING_KNOWLEDGE,
  ].join('\n');
}

/**
 * Returns a compact knowledge base for on-device mode (smaller context window).
 * Focuses on the most actionable knowledge and cross-discipline coverage.
 */
export function getCompactKnowledge(): string {
  return [
    COACH_PRINCIPLES_KNOWLEDGE,
    EXERCISE_KNOWLEDGE,
    CALISTHENICS_KNOWLEDGE,
    NUTRITION_KNOWLEDGE,
    PROGRAMMING_KNOWLEDGE,
  ].join('\n');
}

/** Matches any whole-word keyword token in the topic string. */
function hasAny(t: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => t.includes(k));
}

const KW_RPE           = ['rpe', 'rir', 'load', 'intensity'] as const;
const KW_PERIODIZATION = ['periodiz', 'block', 'program', 'volume', 'mrv', 'mev', 'mav', 'dup'] as const;
const KW_EXERCISE      = [
  'exercis', 'squat', 'bench', 'deadlift', 'technique', 'cue', 'weak',
  'accessory', 'rdl', 'row', 'press', 'hinge',
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
const KW_RECOVERY      = ['recover', 'sleep', 'stress', 'hrv', 'sore', 'fatigue', 'rest', 'deload'] as const;
const KW_MEET          = ['meet', 'compet', 'peak', 'attempt', 'opener', 'weigh-in', 'weigh in', 'command'] as const;
const KW_INJURY        = [
  'injur', 'pain', 'hurt', 'shoulder', 'knee', 'back pain', 'lower back',
  'hip', 'elbow', 'wrist', 'tendin', 'strain',
] as const;
const KW_PROGRAMMING   = [
  'adjust', 'max', 'swap', 'modif', 'chang', 'frequency', 'responder',
  'overreach', 'phenotype', 'abbreviat',
] as const;
const KW_COACH         = [
  'tuchscherer', 'tuscher', 'rts ', 'reactive training',
  'joey flex', 'joeyflex',
  'joe stanek', 'stanek',
  'marcellus', 'millz', 'wallace',
  'noriega', 'sean noriega',
  'autoregul', 'bar speed', 'velocity', 'specificity', 'adherence',
  'philosoph', 'princip', 'approach',
] as const;

/**
 * Returns knowledge relevant to a specific topic. Keywords are matched
 * case-insensitively as substrings.
 */
export function getTopicKnowledge(topic: string): string {
  const t = topic.toLowerCase();
  const sections: string[] = [];

  if (hasAny(t, KW_RPE))           sections.push(RPE_KNOWLEDGE);
  if (hasAny(t, KW_PERIODIZATION)) sections.push(PERIODIZATION_KNOWLEDGE);
  if (hasAny(t, KW_EXERCISE))      sections.push(EXERCISE_KNOWLEDGE);
  if (hasAny(t, KW_CALISTHENICS))  sections.push(CALISTHENICS_KNOWLEDGE);
  if (hasAny(t, KW_STREET_LIFT))   sections.push(STREET_LIFT_KNOWLEDGE);
  if (hasAny(t, KW_NUTRITION))     sections.push(NUTRITION_KNOWLEDGE);
  if (hasAny(t, KW_RECOVERY))      sections.push(RECOVERY_KNOWLEDGE);
  if (hasAny(t, KW_MEET))          sections.push(MEET_PREP_KNOWLEDGE);
  if (hasAny(t, KW_INJURY))        sections.push(INJURY_KNOWLEDGE);
  if (hasAny(t, KW_PROGRAMMING))   sections.push(PROGRAMMING_KNOWLEDGE);
  if (hasAny(t, KW_COACH))         sections.push(COACH_PRINCIPLES_KNOWLEDGE);

  // If nothing matched, return the most universally useful sections
  if (sections.length === 0) {
    sections.push(COACH_PRINCIPLES_KNOWLEDGE, EXERCISE_KNOWLEDGE, CALISTHENICS_KNOWLEDGE, NUTRITION_KNOWLEDGE, PROGRAMMING_KNOWLEDGE);
  }

  return sections.join('\n');
}
