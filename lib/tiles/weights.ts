/**
 * Goals + tile weights — the math of the equation, with NO AI key at runtime.
 *
 *   y = the Mentor (the overseer, where the math lives)
 *   x = each input tile · w = that tile's share of the ACTIVE goal
 *
 * Each goal carries its own weights (sum ≈ 100): "jacked 17 year old
 * millionaire" leans on Finance/Brand; "145 lb lean" leans on Train/Fuel. The
 * row badges show the active goal's weights; the Mentor lists every goal
 * with its full breakdown.
 *
 * WHO DOES THE MATH: Claude Code, at build time — not an Anthropic key, not
 * you by hand. In VS Code, say:
 *
 *   "My goals are X and Y. Open lib/tiles/weights.ts and re-run the math:
 *    for each goal, weigh how much each tile's input actually moves it
 *    (ask me questions if you need to). Each goal's weights sum to 100."
 *
 * Claude reasons, edits DEFAULT_GOALS, you reload. Later it can also
 * cross-reference your real tile data (video published vs workouts, water,
 * caffeine) and retune from evidence. A localStorage override
 * ('vitality:goals') wins over these defaults, so the connector or a goals
 * UI can retune without a code change.
 */

export interface Goal {
  id: string
  title: string
  /** tile slot -> % of this goal (sums to ~100) */
  weights: Record<string, number>
  /** true while the mentor (Claude Code) hasn't shaped + weighed it yet */
  pending?: boolean
  /** each goal tints the board a little; the overall goal goes gold */
  accent?: string
  /** how far you've come, 0–100 — computed by the mentor from data sweeps
   *  (analytics, manual logs, wearables), never guessed by the app */
  progress?: number
}

/** One observation the mentor pushed after scanning your data, with any
 *  weight changes it made because of what it found. */
export interface Notice {
  id: string
  when: string
  text: string
  /** bullet points; **bold** marks the highlighted words */
  points?: string[]
  deltas?: { tile: string; from: number; to: number }[]
}

export const DEFAULT_GOALS: Goal[] = [
  {
    id: 'millionaire',
    title: 'Become a jacked 17 year old millionaire',
    accent: '#6EE7B7',
    // Train entered this goal when the mentor noticed workouts drive output —
    // see DEFAULT_NOTICED. Before: finance 45 / brand 35 / vitals 20.
    weights: { finance: 35, brand: 30, train: 20, vitals: 15 },
    progress: 0,
  },
  {
    id: 'lean145',
    title: 'Be 145 lb lean',
    accent: '#8AB4FF',
    weights: { train: 38, fuel: 32, vitals: 20, peak: 10 },
    progress: 0,
  },
]

/** The overseer's synthesis of EVERY goal, polished into one sentence by the
 *  mentor (Claude Code). Switching it on = top priority — the board goes gold. */
export const OVERALL_GOAL: Goal = {
  id: 'overall',
  title: 'Become a jacked 17 year old',
  accent: '#E8C878',
  weights: { train: 29, finance: 17, vitals: 18, fuel: 16, brand: 15, peak: 5 },
  progress: 0,
}

/** Overall first, then the individual goals. */
export function allGoals(): Goal[] {
  return [OVERALL_GOAL, ...goals()]
}

/** The full active Goal (incl. overall), for accent + title. */
export function activeGoal(): Goal | undefined {
  const id = activeGoalId()
  return allGoals().find((g) => g.id === id) ?? goals()[0]
}

export const DEFAULT_NOTICED: Notice[] = [
  {
    id: 'n-workouts-drive',
    when: 'this morning',
    text: 'When you skip the gym, you drink less water — and your output dips the same day. Workouts might be the key to your hustle, not just your body. I moved Train into the millionaire goal.',
    points: [
      'When you skip the gym, you drink **less water** the same day',
      'No-workout days: your **output takes a dip**',
      '**Workouts might be the key to your hustle** — not just your body',
      'So I moved **Train into the millionaire goal**',
    ],
    deltas: [
      { tile: 'train', from: 0, to: 20 },
      { tile: 'finance', from: 45, to: 35 },
      { tile: 'brand', from: 35, to: 30 },
      { tile: 'vitals', from: 20, to: 15 },
    ],
  },
]

/** A blueprint for a tile they SHOULD have — a gap the mentor found between
 *  their goal and what their tiles actually track. Pre-written by the mentor
 *  (Claude Code) from their data; localStorage 'vitality:ideas' overrides. */
export interface TileIdea {
  /** ONE word — how the idea shows up in the popup (the mentor picks it) */
  word?: string
  title: string
  /** what the tile tracks, in one line */
  tracks: string
  /** why it moves THIS goal — tied to their data when possible */
  why: string
  /** the weight it would likely earn (≈ %) */
  estWeight: number
}

export const DEFAULT_IDEAS: Record<string, TileIdea[]> = {
  overall: [
    {
      word: 'Hustle',
      title: 'Income pipeline',
      tracks: 'side hustle + investing moves, in flight → landed',
      why: 'Your output IS the goal — but nothing tracks the machine that makes it. Finance tracks the balance; this tracks the work.',
      estWeight: 10,
    },
    {
      word: 'Sleep',
      title: 'Sleep consistency',
      tracks: 'bedtime variance, night by night',
      why: 'At 17, recovery is the multiplier on both the gym and the grind. Vitals sees the score — this would see the habit behind it.',
      estWeight: 6,
    },
  ],
  millionaire: [
    {
      word: 'Hustle',
      title: 'Income pipeline',
      tracks: 'ideas → in progress → income landed',
      why: 'You track the balance (Finance) but not the machine that feeds it. Consistent hustle hours are the single biggest lever here.',
      estWeight: 12,
    },
    {
      word: 'Focus',
      title: 'Deep work hours',
      tracks: 'focused hustle time vs distraction, per day',
      why: 'Time is the one asset compounding fastest at 17. Nothing tracks how much of it actually goes toward the goal.',
      estWeight: 8,
    },
  ],
  lean145: [
    {
      word: 'Water',
      title: 'Water',
      tracks: 'daily intake vs target',
      why: 'The noticed pattern: skip the gym → drink less. No tile tracks water yet — it is the cheapest input you are missing.',
      estWeight: 8,
    },
    {
      word: 'Steps',
      title: 'Steps / NEAT',
      tracks: 'daily movement outside the gym',
      why: 'At 145-lean, the deficit is won between workouts. Train sees sessions; nothing sees the other 23 hours.',
      estWeight: 7,
    },
  ],
}

/** The mentor's tile recommendations for a goal (localStorage override wins). */
export function tileIdeas(goalId: string): TileIdea[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('vitality:ideas')
      if (raw) {
        const o = JSON.parse(raw)
        if (o && typeof o === 'object' && Array.isArray(o[goalId])) return o[goalId] as TileIdea[]
      }
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_IDEAS[goalId] ?? DEFAULT_IDEAS.overall ?? []
}

/** The mentor's noticed feed: localStorage override, else the seeded example.
 *  Claude Code (or the connector) writes 'vitality:noticed' after a scan. */
export function noticedFeed(): Notice[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('vitality:noticed')
      if (raw) {
        const o = JSON.parse(raw)
        if (Array.isArray(o)) return o as Notice[]
      }
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_NOTICED
}

/** Save the goals list (used by the mentor page's goal input). */
export function saveGoals(list: Goal[]): void {
  try {
    window.localStorage.setItem('vitality:goals', JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

/** All goals: localStorage override ('vitality:goals') if valid, else defaults. */
export function goals(): Goal[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('vitality:goals')
      if (raw) {
        const o = JSON.parse(raw)
        if (Array.isArray(o) && o.every((g) => g && typeof g.id === 'string' && g.weights)) return o as Goal[]
      }
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_GOALS
}

/** The active goal id (persisted). Defaults to the first goal. */
export function activeGoalId(): string {
  if (typeof window !== 'undefined') {
    try {
      const v = window.localStorage.getItem('vitality:goal:active')
      if (v) return v
    } catch {
      /* fall through */
    }
  }
  return goals()[0]?.id ?? ''
}

export function setActiveGoalId(id: string): void {
  try {
    window.localStorage.setItem('vitality:goal:active', id)
  } catch {
    /* ignore */
  }
}

/** The active goal's weights (the badges on the row read these). */
export function tileWeights(): Record<string, number> {
  return activeGoal()?.weights ?? {}
}
