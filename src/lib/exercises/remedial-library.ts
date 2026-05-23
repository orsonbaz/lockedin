/**
 * remedial-library.ts — Dosed rehab / prehab / mobility exercises the coach
 * draws from when an athlete mentions an injury or restriction.
 *
 * Each entry is grounded in current evidence (cited inline). The library is
 * intentionally OPINIONATED — many entries push back against the "stretch
 * what feels tight" default that's no longer best practice (e.g. tight hip
 * flexors are usually a strength/stability problem, not a length problem;
 * tendinopathy responds better to heavy slow resistance than pure stretching;
 * "tight" hamstrings often need eccentric loading more than they need range).
 *
 * Used as a structured data source by the chat coach + session author. The
 * LLM also reads the prose `REMEDIAL_KNOWLEDGE` module in `knowledge-base.ts`
 * which encodes the same principles + the decision framework.
 */

/** Canonical complaint identifiers — keep snake_case so they survive prompt
 * round-trips intact. New entries should map to one of these or extend the
 * union. Stored on AthleteMemory tags too, so adding here is the source of
 * truth for "what the coach knows how to address." */
export type Complaint =
  | 'tight_hip_flexors'
  | 'tight_hamstrings'
  | 'low_back_stiffness'
  | 'low_back_pain_acute'
  | 'tight_upper_traps'
  | 'shoulder_impingement'
  | 'rotator_cuff_irritation'
  | 'glute_inhibition'
  | 'patellar_tendinopathy'
  | 'achilles_tendinopathy'
  | 'lateral_epicondylitis'      // tennis elbow
  | 'medial_epicondylitis'       // golfer's elbow
  | 'wrist_pain_pressing'
  | 'ankle_dorsiflexion_limited'
  | 'thoracic_extension_limited'
  | 'si_joint_irritation'
  | 'plantar_fasciopathy'
  | 'knee_tracking_valgus'
  | 'anterior_knee_pain'
  | 'tight_pecs_internal_rotation';

export type RemedialMechanism =
  | 'STRENGTHEN'
  | 'ACTIVATE'        // wake up an inhibited muscle (glute med, serratus, etc.)
  | 'MOBILIZE'        // joint-level ROM work (T-spine, hip, ankle)
  | 'STABILIZE'       // motor control + bracing endurance (McGill big 3 etc.)
  | 'ECCENTRIC'       // controlled lengthening under load (Nordic, Spanish squat)
  | 'ISOMETRIC'       // hold under load (analgesic for tendons)
  | 'HEAVY_SLOW'      // HSR — tempo-controlled high-load reps for tendons
  | 'NEURAL_GLIDE'    // nerve mobilisation (rare; only when indicated)
  | 'STRETCH';        // static stretch — included where evidence supports

export type EvidenceLevel = 'STRONG' | 'MODERATE' | 'EMERGING';

export interface RemedialExercise {
  id: string;
  name: string;
  /** Complaints this exercise addresses (a single exercise often serves several). */
  complaints: readonly Complaint[];
  mechanism: RemedialMechanism;
  /** Dosing — at least one of reps OR holdSeconds must be set. */
  dosing: {
    sets: number;
    reps?: number;
    holdSeconds?: number;
    /** Tempo string like "3-1-3" (eccentric-pause-concentric) when relevant. */
    tempo?: string;
    /** Times per week — distinct from frequency-as-loading-pattern. */
    frequencyPerWeek: number;
    /** When to progress to the next variant. Free text, athlete-readable. */
    progressionCriteria: string;
  };
  evidenceLevel: EvidenceLevel;
  /** Conditions that flip the exercise from helpful to harmful. */
  contraindications: readonly string[];
  /** Athlete-facing setup cues — short, scannable. */
  cues: readonly string[];
  /** One-sentence justification grounded in current evidence. */
  rationale: string;
}

// ── HIP FLEXORS — strengthen-first, not stretch-first ────────────────────────
// Modern view: hip flexor "tightness" is more often a stability/weakness
// issue than a length issue. The psoas can be both tight AND weak from
// prolonged sitting (Cleveland Clinic, IJSPT 2024). Strengthening through
// 30-60° of hip flexion produces > 60 % MVIC of iliopsoas (PMC 11546833).
// Acute static stretching also temporarily decreases strength (Warneke &
// Lohmann 2024 systematic review) — bad before training.

export const REMEDIAL_LIBRARY: readonly RemedialExercise[] = [
  {
    id: 'standing_band_hip_flexion',
    name: 'Standing Band Hip Flexion',
    complaints: ['tight_hip_flexors', 'glute_inhibition'],
    mechanism: 'STRENGTHEN',
    dosing: {
      sets: 3, reps: 12, frequencyPerWeek: 3,
      progressionCriteria: 'When 3 × 12 feels easy, increase band tension.',
    },
    evidenceLevel: 'MODERATE',
    contraindications: ['acute hip impingement / labral tear', 'sharp groin pain at top of rep'],
    cues: [
      'Band around foot, opposite end anchored low and behind.',
      'Drive knee past 90° hip flexion under tension.',
      'Brace abs — no lumbar extension to "reach" higher.',
    ],
    rationale: 'Strengthens the iliopsoas through > 60° hip flexion where it is most active; addresses the weakness side of "tight" hip flexors that pure stretching misses.',
  },
  {
    id: 'kettlebell_dead_bug',
    name: 'Loaded Dead Bug (KB or DB)',
    complaints: ['tight_hip_flexors', 'low_back_stiffness', 'low_back_pain_acute', 'glute_inhibition'],
    mechanism: 'STABILIZE',
    dosing: {
      sets: 3, reps: 8, tempo: '3-1-3', frequencyPerWeek: 4,
      progressionCriteria: 'Hold a heavier weight overhead and/or add an exhale-driven pause at full extension.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['acute disc protrusion with leg pain'],
    cues: [
      'Press the lower back into the floor — that pressure stays the entire set.',
      'Exhale fully as the heel reaches the floor.',
      'Opposite arm/leg only — never lose the brace.',
    ],
    rationale: 'McGill Big 3 staple. Trains the anti-extension brace + hip flexor dissociation that "tight hips" actually need; ranks high on transversus abdominis activation in EMG studies.',
  },
  {
    id: 'couch_stretch',
    name: 'Couch Stretch (with brace)',
    complaints: ['tight_hip_flexors', 'tight_pecs_internal_rotation'],
    mechanism: 'STRETCH',
    dosing: {
      sets: 2, holdSeconds: 60, frequencyPerWeek: 4,
      progressionCriteria: 'Squeeze glute of stretching leg harder; reach overhead opposite arm.',
    },
    evidenceLevel: 'MODERATE',
    contraindications: ['anterior hip pain that increases with the stretch'],
    cues: [
      'Posterior pelvic tilt FIRST — squeeze the glute, tuck the tailbone.',
      'Without the tilt, you stretch the lumbar spine, not the hip flexor.',
      'Save it for AFTER training, not before — acute static stretching reduces strength briefly.',
    ],
    rationale: 'Useful as one input alongside strengthening, not as the primary intervention. Recent reviews show stretching does increase ROM but its strength effects on the under-active iliopsoas are negligible — it does not address the weakness component.',
  },
  {
    id: 'copenhagen_plank_short',
    name: 'Copenhagen Plank (short lever)',
    complaints: ['tight_hip_flexors', 'glute_inhibition', 'knee_tracking_valgus', 'si_joint_irritation'],
    mechanism: 'STRENGTHEN',
    dosing: {
      sets: 3, holdSeconds: 20, frequencyPerWeek: 2,
      progressionCriteria: 'Hold 30 s clean, then progress to long-lever (foot on bench) variant.',
    },
    evidenceLevel: 'MODERATE',
    contraindications: ['adductor strain (acute)'],
    cues: [
      'Top knee on bench, bottom leg hanging — hold a side plank.',
      'Pelvis stays stacked, no sag.',
      'Adductor + obliques light up. If only obliques, raise the bench.',
    ],
    rationale: 'Adductor + obliques are the unsung stabilisers of the deep hip; strengthening them removes a common driver of compensatory hip flexor over-recruitment.',
  },

  // ── HAMSTRINGS — eccentric loading > static stretching ────────────────────
  // Nordic curls + Romanian deadlifts increase fascicle length (i.e. produce
  // the lengthening effect stretching is meant to deliver) AND build eccentric
  // strength that protects against strain. 92 % success rate at preventing
  // re-injury in the 3-phase eccentric protocol (Aspetar / Askling).
  {
    id: 'nordic_hamstring_curl',
    name: 'Nordic Hamstring Curl (eccentric)',
    complaints: ['tight_hamstrings'],
    mechanism: 'ECCENTRIC',
    dosing: {
      sets: 3, reps: 5, tempo: '5-0-X', frequencyPerWeek: 2,
      progressionCriteria: 'Lower controlled to 90° with no hand-catch → progress to 60° → full ROM.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['acute hamstring strain (within 2 weeks)', 'sharp posterior knee pain'],
    cues: [
      'Knees padded, partner / loaded barbell pins ankles.',
      'Lower as slowly as you can — catch with the hands when control breaks.',
      'Push back up with the hands — concentric is NOT loaded.',
    ],
    rationale: 'Increases knee-flexor fascicle length and eccentric strength; both correlate with reduced strain risk and resolve "tight" hamstrings more durably than stretching.',
  },
  {
    id: 'rdl_tempo',
    name: 'Romanian Deadlift (slow eccentric)',
    complaints: ['tight_hamstrings', 'low_back_stiffness', 'glute_inhibition'],
    mechanism: 'ECCENTRIC',
    dosing: {
      sets: 3, reps: 8, tempo: '4-1-1', frequencyPerWeek: 2,
      progressionCriteria: 'Add load when 3 × 8 cleans at the same depth without lower-back rounding.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['acute disc injury', 'lumbar flexion-intolerance presentation'],
    cues: [
      'Hinge from hips — soft knees, neutral spine.',
      'Lower until hamstrings tell you (NOT the floor); 4-second descent.',
      'Drive hips through at the top — squeeze glutes, don\'t hyperextend.',
    ],
    rationale: 'Eccentric hamstring loading at long muscle lengths — the position where strains happen and where length adapts. RDL accumulates more weekly volume than Nordics; pair them.',
  },

  // ── LOW BACK — McGill Big 3 + load tolerance, no extended rest ────────────
  {
    id: 'mcgill_curl_up',
    name: 'McGill Curl-Up',
    complaints: ['low_back_pain_acute', 'low_back_stiffness'],
    mechanism: 'STABILIZE',
    dosing: {
      sets: 3, holdSeconds: 10, reps: 5, frequencyPerWeek: 5,
      progressionCriteria: 'Increase hold to 15 s, then add a second set descending pyramid 5/4/3.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['neck pain that worsens with flexion'],
    cues: [
      'One leg bent, hands under lumbar curve to MAINTAIN the curve.',
      'Lift head + shoulders just off floor — neutral spine throughout.',
      'No crunch, no flattening of the back. 10-second holds.',
    ],
    rationale: 'McGill Big 3 — trains anterior core endurance under neutral spine. Endurance > peak strength for back resilience.',
  },
  {
    id: 'side_plank_modified',
    name: 'Side Plank (knees down → full)',
    complaints: ['low_back_pain_acute', 'low_back_stiffness', 'si_joint_irritation', 'knee_tracking_valgus'],
    mechanism: 'STABILIZE',
    dosing: {
      sets: 3, holdSeconds: 20, frequencyPerWeek: 5,
      progressionCriteria: '20 s knees → 30 s knees → 20 s feet → 30 s feet.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['shoulder impingement (use opposite side)'],
    cues: [
      'Hip stacked over hip; line from ear to knee (or ear to ankle).',
      'Press the down-shoulder DOWN — don\'t sink into it.',
      'Glute med fires hard on the up-leg. If it doesn\'t, regress.',
    ],
    rationale: 'McGill Big 3. Targets quadratus lumborum + obliques + glute med — the lateral chain that protects the SI joint.',
  },
  {
    id: 'bird_dog',
    name: 'Bird Dog',
    complaints: ['low_back_pain_acute', 'low_back_stiffness', 'glute_inhibition', 'si_joint_irritation'],
    mechanism: 'STABILIZE',
    dosing: {
      sets: 3, reps: 8, tempo: '3-2-3', frequencyPerWeek: 5,
      progressionCriteria: 'Add a slow elbow-to-knee tap mid-rep (BD with rotation) once base is clean.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['acute wrist pain'],
    cues: [
      'Quadruped — wrists under shoulders, knees under hips.',
      'Reach opposite arm + leg, hold 2 s, return slow.',
      'Pelvis level the entire time — film from above to check.',
    ],
    rationale: 'Tops EMG rankings for transversus abdominis activation. Trains anti-rotation under load — directly transferable to braced lifts.',
  },

  // ── SHOULDER — scapular control + rotator cuff endurance ──────────────────
  {
    id: 'side_lying_external_rotation',
    name: 'Side-Lying External Rotation (light DB)',
    complaints: ['shoulder_impingement', 'rotator_cuff_irritation'],
    mechanism: 'STRENGTHEN',
    dosing: {
      sets: 3, reps: 15, tempo: '3-0-3', frequencyPerWeek: 3,
      progressionCriteria: 'Add 0.5–1 kg when 3×15 clean for two consecutive sessions.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['acute rotator cuff tear (full thickness)'],
    cues: [
      'Side-lying, towel under elbow to keep arm off the body.',
      'Rotate forearm up to neutral — small ROM, slow tempo.',
      'No load past 2-3 kg — this is endurance work, not max-effort.',
    ],
    rationale: 'Infraspinatus/teres-minor isolation. Effective at building cuff endurance which is the missing link in most impingement presentations.',
  },
  {
    id: 'prone_y_t_w',
    name: 'Prone Y / T / W (Lower Trap series)',
    complaints: ['shoulder_impingement', 'tight_upper_traps', 'thoracic_extension_limited'],
    mechanism: 'ACTIVATE',
    dosing: {
      sets: 2, reps: 10, tempo: '1-2-1', frequencyPerWeek: 3,
      progressionCriteria: 'Add 0.5 kg per hand once 2×10 of each shape is clean and pain-free.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['acute thoracic spine pain'],
    cues: [
      'Lie face down on incline bench, thumbs up.',
      'Lift to Y, hold 2 s; then T, hold 2 s; then W, hold 2 s.',
      'Lead with the LOWER traps — squeeze the shoulder blades down + back, not up.',
    ],
    rationale: 'Targets lower + middle trapezius — the prime upward rotators. Reduced upward rotation is the most common scapular dyskinesis pattern in impingement; this directly addresses it.',
  },
  {
    id: 'serratus_punch',
    name: 'Serratus Wall Punch / Push-Up Plus',
    complaints: ['shoulder_impingement', 'thoracic_extension_limited'],
    mechanism: 'ACTIVATE',
    dosing: {
      sets: 3, reps: 12, frequencyPerWeek: 3,
      progressionCriteria: 'Wall → bench → floor push-up plus, then add weight via vest.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['acute wrist pain'],
    cues: [
      'Plank or wall-plank position — push the chest AWAY from the floor at the top.',
      'Shoulder blades wrap around the rib cage; chest does not collapse.',
      'Two-second pause at peak protraction.',
    ],
    rationale: 'Serratus anterior is the prime upward rotator + protractor of the scapula. Weak serratus → reduced posterior tilt → impingement.',
  },
  {
    id: 'banded_face_pull',
    name: 'Banded Face Pull',
    complaints: ['shoulder_impingement', 'tight_upper_traps', 'tight_pecs_internal_rotation'],
    mechanism: 'STRENGTHEN',
    dosing: {
      sets: 3, reps: 15, frequencyPerWeek: 4,
      progressionCriteria: 'Heavier band when 3×15 with 1 s pause-at-end is clean.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['none specific; reduce ROM if neck strains'],
    cues: [
      'Pull to the FACE not the chest — elbows high.',
      'External-rotate at the end — pinky-knuckles point at the ceiling.',
      '1 s pause at peak contraction. Light load, full quality.',
    ],
    rationale: 'Best single bang-for-buck shoulder health movement. Trains rear delts, mid trap, lower trap, external rotators all together. Should appear EVERY upper body session.',
  },

  // ── TENDONS — Heavy Slow Resistance, isometric for pain ───────────────────
  // 2024 meta-analyses: HSR (≈ 70 % 1RM, slow tempo) ≥ pure eccentric for
  // tendinopathy. Isometrics produce rapid analgesia (Rio et al. 2015,
  // 45 min post-intervention pain reduction). Eccentric alone now considered
  // suboptimal vs HSR per latest reviews.
  {
    id: 'spanish_squat_isometric',
    name: 'Spanish Squat Isometric',
    complaints: ['patellar_tendinopathy', 'anterior_knee_pain'],
    mechanism: 'ISOMETRIC',
    dosing: {
      sets: 5, holdSeconds: 45, frequencyPerWeek: 3,
      progressionCriteria: 'Hold to 60 s × 5; then transition to HSR Spanish squats with load.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['acute meniscus injury with locking'],
    cues: [
      'Heavy band looped around a rack at knee height, around the back of both knees.',
      'Squat to ~60° knee flexion and HOLD.',
      'Vertical shin, vertical torso — pure quad load.',
    ],
    rationale: 'Isometric quad load produces rapid pain relief in patellar tendinopathy (Rio et al. 2015). First-line for acute presentations or in-season athletes.',
  },
  {
    id: 'leg_extension_hsr',
    name: 'Leg Extension — Heavy Slow Resistance',
    complaints: ['patellar_tendinopathy', 'anterior_knee_pain'],
    mechanism: 'HEAVY_SLOW',
    dosing: {
      sets: 4, reps: 8, tempo: '3-1-3', frequencyPerWeek: 3,
      progressionCriteria: 'Add 2.5 kg when 4 × 8 at a 6-second tempo cleans without > 3/10 pain.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['acute meniscus / ACL injury'],
    cues: [
      '3-second concentric, 1-second pause at top, 3-second eccentric.',
      'Load = ~70 % of your 8RM at this tempo; pain ≤ 3/10 acceptable.',
      'Stop the set if pain crosses 5/10 or technique breaks.',
    ],
    rationale: 'HSR meta-analyses now show better collagen turnover + comparable pain relief vs Alfredson eccentric protocol — with significantly higher patient satisfaction at 6 months.',
  },
  {
    id: 'heavy_slow_calf_raise',
    name: 'Heavy Slow Calf Raise',
    complaints: ['achilles_tendinopathy'],
    mechanism: 'HEAVY_SLOW',
    dosing: {
      sets: 4, reps: 8, tempo: '3-1-3', frequencyPerWeek: 3,
      progressionCriteria: 'Bilateral → single-leg → loaded single-leg. Add load when 4 × 8 single-leg is clean.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['Achilles rupture', 'acute paratenon swelling with redness'],
    cues: [
      'Off a step for full ROM, slow tempo, 1-second pause at the top.',
      'Pain up to 3/10 during the set is acceptable; should not worsen 24 h after.',
      'Begin bilateral, progress to single-leg only when 4 × 8 is easy.',
    ],
    rationale: 'HSR matches or exceeds Alfredson eccentric calf protocol for Achilles — and athletes prefer it. Tendons need load; rest atrophies them.',
  },
  {
    id: 'wrist_extension_isometric',
    name: 'Wrist Extension Isometric (low load)',
    complaints: ['lateral_epicondylitis', 'wrist_pain_pressing'],
    mechanism: 'ISOMETRIC',
    dosing: {
      sets: 5, holdSeconds: 30, frequencyPerWeek: 4,
      progressionCriteria: 'Increase load by ~1 kg when 5 × 30 s holds at current load are pain-free.',
    },
    evidenceLevel: 'MODERATE',
    contraindications: ['acute fracture / sprain'],
    cues: [
      'Forearm supported on a bench, palm down, hand off the edge.',
      'Hold a light DB (1-3 kg) so wrist is in slight extension.',
      '30-second hold — should be a 4-5/10 effort, not painful.',
    ],
    rationale: 'Tendinopathy responds to isometric load for analgesia + adaptation. The "stretch what hurts" approach to tennis elbow does NOT work — gradual loading does.',
  },
  {
    id: 'wrist_flexion_isometric',
    name: 'Wrist Flexion Isometric (low load)',
    complaints: ['medial_epicondylitis', 'wrist_pain_pressing'],
    mechanism: 'ISOMETRIC',
    dosing: {
      sets: 5, holdSeconds: 30, frequencyPerWeek: 4,
      progressionCriteria: 'Add ~1 kg when 5 × 30 s pain-free. Then progress to HSR wrist curls.',
    },
    evidenceLevel: 'MODERATE',
    contraindications: ['ulnar nerve symptoms (refer out)'],
    cues: [
      'Forearm supported on a bench, palm UP, hand off the edge.',
      'Hold a light DB so wrist is in slight flexion.',
      '30-second hold, slow breathing.',
    ],
    rationale: 'Same evidence base as the lateral counterpart — tendons want load, not rest or massage.',
  },

  // ── MOBILITY — joint-level work where ROM IS limiting ─────────────────────
  {
    id: 'thoracic_extension_foam_roller',
    name: 'Foam Roller Thoracic Extension',
    complaints: ['thoracic_extension_limited', 'tight_upper_traps', 'shoulder_impingement'],
    mechanism: 'MOBILIZE',
    dosing: {
      sets: 3, reps: 8, frequencyPerWeek: 4,
      progressionCriteria: 'Add a light DB overhead reach during the extension.',
    },
    evidenceLevel: 'MODERATE',
    contraindications: ['osteoporosis', 'acute thoracic vertebral pain'],
    cues: [
      'Foam roller mid-back, hands cradle the head.',
      'Extend over the roller — small range, slow.',
      'Move the roller every 8 reps to a new segment, NOT the same spot.',
    ],
    rationale: 'T-spine mobility is the cheapest fix for several upstream problems — bench arch, overhead position, shoulder impingement risk. Direct intervention beats accessory work.',
  },
  {
    id: 'banded_ankle_dorsiflexion',
    name: 'Banded Ankle Dorsiflexion',
    complaints: ['ankle_dorsiflexion_limited', 'anterior_knee_pain', 'knee_tracking_valgus'],
    mechanism: 'MOBILIZE',
    dosing: {
      sets: 3, reps: 15, frequencyPerWeek: 4,
      progressionCriteria: 'Once 5 cm wall-knee-to-toe distance is unrestricted, drop the band, keep daily flow work.',
    },
    evidenceLevel: 'MODERATE',
    contraindications: ['acute ankle sprain'],
    cues: [
      'Heavy band looped around the front of the ankle, anchored low and forward.',
      'Knee drives over toes, heel stays down, 15 reps slow.',
      'Test: wall knee-to-toe distance should improve session-to-session.',
    ],
    rationale: 'Limited dorsiflexion drives knee valgus and quad-dominance in the squat. Joint-mobility work here unlocks downstream patterns more reliably than calf stretching.',
  },
  {
    id: 'pec_doorway_stretch',
    name: 'Pec Doorway Stretch (post-training only)',
    complaints: ['tight_pecs_internal_rotation'],
    mechanism: 'STRETCH',
    dosing: {
      sets: 2, holdSeconds: 30, frequencyPerWeek: 4,
      progressionCriteria: 'Move further into the doorway without shrugging.',
    },
    evidenceLevel: 'MODERATE',
    contraindications: ['anterior shoulder instability', 'AC joint pain'],
    cues: [
      'Forearm on doorframe, elbow at shoulder height.',
      'Step through gently — should feel a stretch in the front of the chest, not the front of the shoulder.',
      'AFTER training, never before — acute static stretching reduces strength briefly.',
    ],
    rationale: 'Pec stretching is one input alongside upper-back strengthening; it does NOT fix posture by itself.',
  },

  // ── FOOT / ANKLE / GLUTES ────────────────────────────────────────────────
  {
    id: 'glute_bridge_eccentric',
    name: 'Glute Bridge — Slow Eccentric',
    complaints: ['glute_inhibition', 'low_back_stiffness', 'tight_hip_flexors', 'si_joint_irritation'],
    mechanism: 'ACTIVATE',
    dosing: {
      sets: 3, reps: 12, tempo: '1-2-3', frequencyPerWeek: 3,
      progressionCriteria: 'Add load (barbell hip thrust) once 3×12 bodyweight is clean with full glute lockout.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['acute disc injury'],
    cues: [
      'Squeeze glutes BEFORE the lift — no momentum.',
      'Drive through heels; tuck pelvis at the top so spine stays neutral.',
      '3-second lower — feel the eccentric.',
    ],
    rationale: 'Glute inhibition is upstream of half the issues in this library. Activation work resolves "tight" feelings in hips, low back, and SI joint without ever stretching them.',
  },
  {
    id: 'short_foot_isometric',
    name: 'Short Foot / Foot Tripod Activation',
    complaints: ['plantar_fasciopathy', 'ankle_dorsiflexion_limited'],
    mechanism: 'ACTIVATE',
    dosing: {
      sets: 3, holdSeconds: 30, frequencyPerWeek: 5,
      progressionCriteria: 'Move from standing to single-leg short-foot, then add load.',
    },
    evidenceLevel: 'EMERGING',
    contraindications: ['none common'],
    cues: [
      'Feet flat on floor, three points loaded: big toe, little toe, heel.',
      'Pull big toe toward heel WITHOUT curling the toes.',
      'Arch should lift slightly. 30-second hold.',
    ],
    rationale: 'Re-trains intrinsic foot strength — addresses the cause of plantar fascia overload, not just the symptom.',
  },
  {
    id: 'plantar_fascia_loading',
    name: 'Heavy Slow Plantar-Fascia Calf Raise',
    complaints: ['plantar_fasciopathy'],
    mechanism: 'HEAVY_SLOW',
    dosing: {
      sets: 4, reps: 8, tempo: '3-2-3', frequencyPerWeek: 3,
      progressionCriteria: 'Add load when 4 × 8 single-leg is clean. Pain ≤ 3/10 acceptable, must not worsen next day.',
    },
    evidenceLevel: 'STRONG',
    contraindications: ['acute plantar fascia rupture'],
    cues: [
      'Towel rolled under the toes (great toe extended) — increases plantar fascia load.',
      'Single-leg calf raise off a step, slow tempo.',
      'Should feel work in the calf AND the arch.',
    ],
    rationale: 'Rathleff et al. 2015: high-load strength training (this protocol) produced superior outcomes at 3 months vs plantar-specific stretching for plantar fasciopathy.',
  },
] as const;

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Return all remedial exercises that address a given complaint, ordered by
 * evidence strength (STRONG → EMERGING). Used by the coach when an athlete
 * surfaces a complaint to assemble a focused Rx instead of generic stretches.
 */
export function remediesFor(complaint: Complaint): readonly RemedialExercise[] {
  const order: Record<EvidenceLevel, number> = { STRONG: 0, MODERATE: 1, EMERGING: 2 };
  return REMEDIAL_LIBRARY
    .filter((e) => e.complaints.includes(complaint))
    .slice() // copy so we don't mutate the readonly source
    .sort((a, b) => order[a.evidenceLevel] - order[b.evidenceLevel]);
}

// ── Region → Complaint map (v8) ──────────────────────────────────────────────
//
// Used by the session generator's remedial-prep selector: given an Injury's
// affected regions, surface the candidate complaints worth treating with
// dosed prep work. Multiple complaints per region is intentional — a
// shoulder injury could be impingement, cuff irritation, or pec-driven
// internal rotation, and the prep we'd prescribe overlaps usefully across
// all three.
//
// Lower-case region strings used directly so callers can pass the BodyRegion
// union from db/types without an import dance.

const REGION_TO_COMPLAINTS: Record<string, readonly Complaint[]> = {
  NECK:           ['tight_upper_traps'],
  CERVICAL_SPINE: ['tight_upper_traps'],
  T_SPINE:        ['thoracic_extension_limited'],
  L_SPINE:        ['low_back_stiffness', 'low_back_pain_acute'],
  SI_JOINT:       ['si_joint_irritation'],
  LEFT_SHOULDER:  ['shoulder_impingement', 'rotator_cuff_irritation', 'tight_pecs_internal_rotation'],
  RIGHT_SHOULDER: ['shoulder_impingement', 'rotator_cuff_irritation', 'tight_pecs_internal_rotation'],
  LEFT_ELBOW:     ['lateral_epicondylitis', 'medial_epicondylitis'],
  RIGHT_ELBOW:    ['lateral_epicondylitis', 'medial_epicondylitis'],
  LEFT_WRIST:     ['wrist_pain_pressing'],
  RIGHT_WRIST:    ['wrist_pain_pressing'],
  LEFT_HIP:       ['tight_hip_flexors', 'glute_inhibition'],
  RIGHT_HIP:      ['tight_hip_flexors', 'glute_inhibition'],
  LEFT_KNEE:      ['patellar_tendinopathy', 'anterior_knee_pain', 'knee_tracking_valgus'],
  RIGHT_KNEE:     ['patellar_tendinopathy', 'anterior_knee_pain', 'knee_tracking_valgus'],
  LEFT_ANKLE:     ['ankle_dorsiflexion_limited', 'achilles_tendinopathy', 'plantar_fasciopathy'],
  RIGHT_ANKLE:    ['ankle_dorsiflexion_limited', 'achilles_tendinopathy', 'plantar_fasciopathy'],
};

/** Complaints worth prep-loading for the given anatomical region (or [] when unknown). */
export function complaintsForRegion(region: string): readonly Complaint[] {
  return REGION_TO_COMPLAINTS[region] ?? [];
}

/**
 * Pick the top-N remedial exercises across a set of complaints. Highest-
 * evidence first; dedupes across complaints (each exercise appears once
 * even when it serves multiple complaints — common e.g. dead bug, hip CARs).
 */
export function pickTopRemedies(
  complaints: readonly Complaint[],
  limit: number,
): readonly RemedialExercise[] {
  const seen = new Set<string>();
  const out: RemedialExercise[] = [];
  for (const complaint of complaints) {
    for (const ex of remediesFor(complaint)) {
      if (seen.has(ex.id)) continue;
      seen.add(ex.id);
      out.push(ex);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Map free-text injury / complaint phrases to canonical Complaint ids.
 * Substring match — generous, lower-cased. Returns the first match per
 * phrase; multi-complaint memories should call this per phrase.
 */
const PHRASE_TO_COMPLAINT: ReadonlyArray<readonly [readonly string[], Complaint]> = [
  [['hip flex', 'tight hip', 'psoas'],                                'tight_hip_flexors'],
  [['hamstring tight', 'tight hamstring'],                            'tight_hamstrings'],
  [['low back pain', 'lower back pain', 'lumbar pain'],               'low_back_pain_acute'],
  [['low back stiff', 'lower back stiff', 'lumbar stiff'],            'low_back_stiffness'],
  [['upper trap', 'tight trap', 'neck tight'],                        'tight_upper_traps'],
  [['shoulder impinge', 'shoulder pinch'],                            'shoulder_impingement'],
  [['rotator cuff', 'cuff irrit'],                                    'rotator_cuff_irritation'],
  [['glute weak', 'glute inhibit', 'glute not firing'],               'glute_inhibition'],
  [['patellar tendin', 'jumper'],                                     'patellar_tendinopathy'],
  [['achilles'],                                                      'achilles_tendinopathy'],
  [['tennis elbow', 'lateral epi'],                                   'lateral_epicondylitis'],
  [['golfer elbow', 'medial epi'],                                    'medial_epicondylitis'],
  [['wrist pain'],                                                    'wrist_pain_pressing'],
  [['ankle mob', 'dorsiflex', 'tight calf'],                          'ankle_dorsiflexion_limited'],
  [['t-spine', 'thoracic'],                                           'thoracic_extension_limited'],
  [['si joint', 'si pain', 'sacroiliac'],                             'si_joint_irritation'],
  [['plantar', 'foot arch'],                                          'plantar_fasciopathy'],
  [['knee cave', 'valgus'],                                           'knee_tracking_valgus'],
  [['knee pain front', 'anterior knee'],                              'anterior_knee_pain'],
  [['tight pec', 'rounded shoulder', 'internal rotation'],            'tight_pecs_internal_rotation'],
];

export function complaintFromText(text: string): Complaint | null {
  const t = text.toLowerCase();
  for (const [phrases, complaint] of PHRASE_TO_COMPLAINT) {
    if (phrases.some((p) => t.includes(p))) return complaint;
  }
  return null;
}

export function complaintsFromText(text: string): Complaint[] {
  const t = text.toLowerCase();
  const found = new Set<Complaint>();
  for (const [phrases, complaint] of PHRASE_TO_COMPLAINT) {
    if (phrases.some((p) => t.includes(p))) found.add(complaint);
  }
  return [...found];
}

/**
 * Render a single remedial exercise as a 3-line block for a prompt context.
 * Tight format on purpose — tokens are precious.
 */
export function renderRemedy(ex: RemedialExercise): string {
  const dose = [
    `${ex.dosing.sets}×`,
    ex.dosing.reps !== undefined ? `${ex.dosing.reps}` : `${ex.dosing.holdSeconds}s`,
    ex.dosing.tempo ? `tempo ${ex.dosing.tempo}` : '',
    `${ex.dosing.frequencyPerWeek}×/wk`,
  ].filter(Boolean).join(' ');
  return [
    `${ex.name} — ${ex.mechanism} (${ex.evidenceLevel} evidence)`,
    `  Dose: ${dose}. ${ex.dosing.progressionCriteria}`,
    `  Why: ${ex.rationale}`,
  ].join('\n');
}
