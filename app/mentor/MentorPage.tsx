'use client'

import { useEffect, useRef, useState } from 'react'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import DashboardHeaderGem from '@/app/app/DashboardHeaderGem'
import { CORE_TILES } from '@/lib/tiles/coreTiles'
import { site } from '@/content/site'
import {
  allGoals,
  activeGoalId,
  setActiveGoalId,
  goals,
  saveGoals,
  noticedFeed,
  tileIdeas,
  type Goal,
} from '@/lib/tiles/weights'

/**
 * The Mentor — the equation, minimal. When the mentor is clicked everything
 * else fades away and this remains:
 *
 *        ───────── ai mentor ─────────      (top centre, big, animated in)
 *            [ pick your goal ]             (easy in and out)
 *        x% + x% + x% + x%                  (the tiles, no borders, rolling)
 *        results · progress · advice = y    (the bottom line)
 *
 * Every number is DATA, pre-written by the mentor (Claude Code) from data
 * sweeps — analytics, manual logs, wearables. The app never guesses.
 */

const label = (tile: string) => CORE_TILES[tile as keyof typeof CORE_TILES]?.label ?? tile

/* ── the mentor that TALKS — chat over the user's own key via /api/mentor ── */

/** Everything the mentor can see: goals + weights, the noticed feed, the
 *  profile, and each tile's raw saved data (read from the same localStorage
 *  the tile host writes — userId is the base's fixed "me"). */
function gatherDashboardData(): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  try {
    data.goals = allGoals()
    data.noticed = noticedFeed()
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    try {
      const profile = window.localStorage.getItem('vitality:profile')
      if (profile) data.profile = JSON.parse(profile)
    } catch {
      /* ignore */
    }
    for (const slot of ['train', 'fuel', 'vitals', 'brand', 'peak', 'finance']) {
      try {
        const raw = window.localStorage.getItem(`vitality:me:tile:${slot}:data`)
        if (raw) data[slot] = JSON.parse(raw)
      } catch {
        /* ignore */
      }
    }
  }
  return data
}

const MENTOR_SYSTEM = [
  "You are the user's personal AI mentor inside their Vitality life dashboard — the overseer of their life equation: y (the goal) = the weighted sum of the x tiles.",
  "You can see ALL their data in the JSON below: every goal with its tile weights and progress, the noticed-patterns feed, their profile, and each tile's raw data (training, fuel/water, vitals, brand, peak, and finance — accounts, subscriptions, orders, wishlist).",
  'Give honest, specific, encouraging guidance across any area of their life — not just one tile. Tie advice to their actual numbers whenever you can.',
  'FORMAT RULES (always follow):',
  "1) Answer in short bullet points — start each line with '- '.",
  '2) Keep each bullet to one short line, few words, no fluff.',
  '3) Use plain language, no jargon.',
  '4) Wrap key words and numbers in **double asterisks** (e.g. **$200/mo**).',
  "5) Max 5 bullets, then ONE final bullet starting with '- Do today:' giving the single action.",
  site.name ? `The user's name is ${site.name}.` : '',
]
  .filter(Boolean)
  .join('\n')

/** Render a mentor line: '**bold**' spans highlighted, leading '- ' stripped. */
function RichLine({ text, bullet, accent }: { text: string; bullet: boolean; accent: string }) {
  const body = text.replace(/^-\s*/, '')
  return (
    <span style={{ display: 'flex', gap: 10 }}>
      {bullet && (
        <span aria-hidden style={{ color: accent, flex: '0 0 auto' }}>
          ◆
        </span>
      )}
      <span>
        {body.split(/\*\*(.+?)\*\*/g).map((part, j) =>
          j % 2 ? (
            <strong key={j} style={{ color: 'var(--fg, #fff)', fontWeight: 600 }}>
              {part}
            </strong>
          ) : (
            part
          ),
        )}
      </span>
    </span>
  )
}

function MentorChat({ accent, mono }: { accent: string; mono: React.CSSProperties }) {
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [keyState, setKeyState] = useState<'unknown' | 'ok' | 'missing'>('unknown')
  const [keyDraft, setKeyDraft] = useState('')
  const feedRef = useRef<HTMLDivElement | null>(null)

  // Does ANY key exist — server env (preferred) or one pasted into this browser?
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (window.localStorage.getItem('vitality:anthropic:key')) {
          if (alive) setKeyState('ok')
          return
        }
      } catch {
        /* ignore */
      }
      try {
        const r = await fetch('/api/mentor')
        const j = await r.json()
        if (alive) setKeyState(j?.env ? 'ok' : 'missing')
      } catch {
        if (alive) setKeyState('missing')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  const saveKey = () => {
    const v = keyDraft.trim()
    if (!v) return
    try {
      window.localStorage.setItem('vitality:anthropic:key', v)
    } catch {
      /* ignore */
    }
    setKeyDraft('')
    setKeyState('ok')
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return
    const history = [...msgs, { role: 'user' as const, text }]
    setMsgs(history)
    setDraft('')
    setBusy(true)
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      try {
        const userKey = window.localStorage.getItem('vitality:anthropic:key')
        if (userKey) headers['x-user-key'] = userKey
      } catch {
        /* ignore */
      }
      const r = await fetch('/api/mentor', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 1024,
          system:
            MENTOR_SYSTEM +
            '\n\nCurrent dashboard data as JSON:\n' +
            JSON.stringify(gatherDashboardData()).slice(0, 24000),
          messages: history.map((m) => ({ role: m.role, content: m.text })),
        }),
      })
      const j = await r.json()
      let reply = ''
      if (r.ok && Array.isArray(j?.content)) {
        reply = j.content
          .filter((b: { type: string }) => b.type === 'text')
          .map((b: { text: string }) => b.text)
          .join('\n')
          .trim()
      }
      if (!reply) {
        if (r.status === 401) {
          setKeyState('missing')
          reply = '- I need an **Anthropic key** to talk — add yours below, then ask me again.'
        } else {
          reply =
            "- Hmm, I couldn't reach my brain just now — **" +
            String(j?.error?.message || j?.error || 'try again in a moment') +
            '**'
        }
      }
      setMsgs([...history, { role: 'assistant', text: reply }])
    } catch {
      setMsgs([
        ...history,
        { role: 'assistant', text: "- Hmm, I couldn't reach my brain just now — check your **connection** and try again." },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ width: 'min(560px, 100%)', margin: '46px auto 0', textAlign: 'left', animation: 'fadeUp .8s ease .62s both' }}>
      <p style={{ ...mono, fontSize: 10.5, color: accent, margin: '0 0 10px', transition: 'color .8s ease' }}>
        talk to your mentor
      </p>

      {msgs.length > 0 && (
        <div
          ref={feedRef}
          style={{ maxHeight: 340, overflowY: 'auto', scrollbarWidth: 'none', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {msgs.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '86%' }}>
                <div
                  style={{
                    background: `${accent}14`,
                    border: `1px solid ${accent}33`,
                    borderRadius: '16px 16px 4px 16px',
                    padding: '9px 14px',
                    color: 'var(--fg, #fff)',
                    fontSize: 13.5,
                    lineHeight: 1.6,
                  }}
                >
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
                <div style={{ color: 'var(--muted, #b9c4be)', fontSize: 13.5, lineHeight: 1.7 }}>
                  {m.text.split('\n').map((line, li) =>
                    line.trim() ? (
                      <div key={li} style={{ margin: '5px 0' }}>
                        <RichLine text={line} bullet={line.trim().startsWith('-')} accent={accent} />
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 5, padding: '6px 2px' }}>
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: accent,
                    animation: `mentorPulse 1s ease ${d * 0.18}s infinite`,
                    display: 'inline-block',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {keyState === 'missing' && (
        <div
          style={{
            border: '1px solid rgba(232,200,120,.35)',
            background: 'rgba(232,200,120,.06)',
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--muted, #b9c4be)', margin: 0 }}>
            <strong style={{ color: '#e8c878' }}>One-time setup:</strong> the mentor talks with your own Anthropic API
            key. It stays in this browser and goes straight to Anthropic through your own site — key at
            console.anthropic.com → settings → keys. (Or set <code style={{ fontSize: 11 }}>ANTHROPIC_API_KEY</code> in
            .env.local and it never touches the browser.)
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveKey()
              }}
              placeholder="sk-ant-…"
              autoComplete="off"
              style={{
                flex: 1,
                background: 'rgba(0,0,0,.45)',
                border: '1px solid var(--border, #333)',
                borderRadius: 10,
                padding: '9px 12px',
                color: 'var(--fg, #fff)',
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 12,
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={saveKey}
              style={{
                flex: '0 0 auto',
                background: accent,
                color: '#0a0f0c',
                border: 'none',
                borderRadius: 10,
                padding: '9px 14px',
                fontWeight: 600,
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              Save key
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          border: '1px dashed var(--border, #333)',
          borderRadius: 999,
          padding: '6px 8px 6px 18px',
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send()
          }}
          placeholder="Ask the mentor anything — it sees your whole board."
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg, #fff)', fontSize: 13.5 }}
        />
        <button
          type="button"
          onClick={send}
          disabled={busy}
          style={{
            flex: '0 0 auto',
            background: busy ? `${accent}55` : accent,
            color: '#0a0f0c',
            border: 'none',
            borderRadius: 999,
            padding: '9px 16px',
            fontWeight: 600,
            fontSize: 12.5,
            cursor: busy ? 'default' : 'pointer',
            transition: 'background .4s ease',
          }}
        >
          {busy ? 'thinking…' : 'Ask'}
        </button>
      </div>
    </div>
  )
}

/* ── a number that rolls like a ticker ── */
function Roll({ value, color, size }: { value: number; color: string; size: number }) {
  const [shown, setShown] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) return
    const t0 = performance.now()
    const dur = 900
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(from + (value - from) * e))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <span
      style={{
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: size,
        fontWeight: 300,
        fontVariantNumeric: 'tabular-nums',
        color,
        textShadow: `0 0 30px ${color}55`,
        transition: 'color .8s ease, text-shadow .8s ease',
      }}
    >
      {shown}%
    </span>
  )
}

export default function MentorPage({
  overlay = false,
  onClose,
}: {
  /** true when the mentor "comes alive" over the board (no page load) */
  overlay?: boolean
  onClose?: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [list, setList] = useState<Goal[]>([])
  const [active, setActive] = useState('')
  const [draft, setDraft] = useState('')
  const [ideasOpen, setIdeasOpen] = useState(false) // the +: blueprints for tiles you're missing
  const gemRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMounted(true)
    setList(allGoals())
    setActive(activeGoalId())
  }, [])

  // Pulse the gem when the goal changes — WAAPI on the wrapper, NO remount.
  // (Remounting would re-init the WebGL gem: heavy, and it visibly glitches.)
  useEffect(() => {
    const el = gemRef.current
    if (!el || !active) return
    const s = active === 'overall' ? 1.16 : 1
    el.animate(
      [
        { transform: `scale(${s * 0.92})` },
        { transform: `scale(${s * 1.12}) rotate(-3deg)` },
        { transform: `scale(${s})` },
      ],
      { duration: 750, easing: 'cubic-bezier(.34,1.56,.64,1)' },
    )
  }, [active])

  if (!mounted) return null

  const act = list.find((g) => g.id === active) ?? list[0]
  const accent = act?.accent ?? '#6EE7B7'
  const entries = Object.entries(act?.weights ?? {}).sort((a, b) => b[1] - a[1])
  const advice = noticedFeed()[0]

  const switchGoal = (id: string) => {
    setActiveGoalId(id)
    setActive(id)
  }

  const addGoal = () => {
    const raw = draft.trim()
    if (!raw) return
    const id = 'g-' + raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)
    saveGoals([...goals(), { id, title: raw, weights: {}, pending: true } as Goal])
    setList(allGoals())
    setDraft('')
  }

  const mono: React.CSSProperties = {
    fontFamily: 'ui-monospace, Menlo, monospace',
    letterSpacing: '.16em',
    textTransform: 'uppercase',
  }

  return (
    <main className="grain-overlay" style={{ minHeight: '100vh', position: 'relative', ['--wall-accent' as string]: accent }}>
      {/* entrance: the mentor rises to the top centre and everything fades in under it */}
      <style>{`
        @keyframes mentorIn { from { opacity: 0; transform: translateY(26px) scale(.86) } to { opacity: 1; transform: none } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        @keyframes mentorPulse { 0% { transform: scale(1) } 40% { transform: scale(1.16) rotate(-2deg) } 100% { transform: scale(1) } }
        @keyframes bpVeil { from { opacity: 0 } to { opacity: 1 } }
        @keyframes bpIn { from { opacity: 0; transform: translateY(22px) scale(.94) } to { opacity: 1; transform: none } }
        @keyframes bpRow { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
      `}</style>
      {!overlay && <WelcomeBackdrop />}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          background: `radial-gradient(60% 45% at 50% 0%, ${accent}24, transparent 70%)`,
          transition: 'background 1.2s ease',
        }}
      />

      <div style={{ position: 'relative', zIndex: 5, width: 'min(880px, calc(100vw - 40px))', margin: '0 auto', padding: '26px 0 90px', textAlign: 'center' }}>
        {overlay ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              float: 'left',
              color: 'var(--muted, #8a8f98)',
              fontSize: 13,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ← board
          </button>
        ) : (
          <a href="/" style={{ float: 'left', color: 'var(--muted, #8a8f98)', fontSize: 13, textDecoration: 'none' }}>
            ← Dashboard
          </a>
        )}

        {/* ───────── ai mentor ───────── */}
        <div style={{ clear: 'both', paddingTop: 44, animation: 'mentorIn .9s cubic-bezier(.22,1,.36,1) both' }}>
          {/* the avatar IS the gem — one persistent WebGL instance (never remounted).
              It travels in on load, pulses on every switch (WAAPI), scales up for
              the main goal, and glows the goal's color. */}
          <div aria-hidden style={{ height: 150, display: 'grid', placeItems: 'center', marginBottom: 4 }}>
            <div
              ref={gemRef}
              style={{
                width: 132,
                height: 132,
                transform: act?.id === 'overall' ? 'scale(1.16)' : 'scale(1)',
                transition: 'transform .7s cubic-bezier(.34,1.56,.64,1), filter .8s ease',
                filter: `drop-shadow(0 0 ${act?.id === 'overall' ? 44 : 30}px ${accent}66)`,
              }}
            >
              <DashboardHeaderGem size={132} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
            <span aria-hidden style={{ flex: 1, maxWidth: 180, height: 1, background: `linear-gradient(to right, transparent, ${accent}55)`, transition: 'background .8s ease' }} />
            <h1 style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic', fontWeight: 400, fontSize: 'clamp(30px, 4.6vw, 44px)', color: 'var(--fg, #fff)', margin: 0 }}>
              ai mentor
            </h1>
            <span aria-hidden style={{ flex: 1, maxWidth: 180, height: 1, background: `linear-gradient(to left, transparent, ${accent}55)`, transition: 'background .8s ease' }} />
          </div>
          <p style={{ ...mono, fontSize: 10.5, color: accent, margin: '10px 0 0', transition: 'color .8s ease' }}>notices everything · runs the math</p>
        </div>

        {/* the goal — easy in, easy out */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 34, animation: 'fadeUp .8s ease .25s both' }}>
          {list.map((g) => {
            const on = g.id === active
            const gA = g.accent ?? '#6EE7B7'
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => switchGoal(g.id)}
                style={{
                  ...mono,
                  fontSize: 11,
                  color: on ? gA : 'var(--muted, #8a8f98)',
                  background: on ? `${gA}12` : 'transparent',
                  border: `1px solid ${on ? gA + '59' : 'var(--border, #262626)'}`,
                  borderRadius: 999,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  transition: 'color .6s ease, border-color .6s ease, background .6s ease',
                }}
              >
                {g.id === 'overall' ? '★ ' : ''}
                {g.title}
              </button>
            )
          })}
        </div>

        {/* x + x + x — the tiles, no borders, just the numbers */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(14px, 3vw, 30px)',
            flexWrap: 'wrap',
            marginTop: 46,
            animation: 'fadeUp .8s ease .4s both',
          }}
        >
          {entries.map(([tile, w], i) => (
            <div key={tile} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(14px, 3vw, 30px)' }}>
              {i > 0 && (
                <span aria-hidden style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 30, fontWeight: 300, color: `${accent}66`, transition: 'color .8s ease' }}>
                  +
                </span>
              )}
              <div>
                <Roll value={w} color={accent} size={Math.max(30, 56 - entries.length * 3)} />
                <p style={{ ...mono, fontSize: 10, color: 'var(--muted, #8a8f98)', margin: '4px 0 0' }}>{label(tile)}</p>
              </div>
            </div>
          ))}

          {/* the +: what you're NOT tracking — the mentor's blueprints */}
          <button
            type="button"
            onClick={() => setIdeasOpen(true)}
            aria-label="What am I missing?"
            title="What am I missing?"
            style={{
              width: 54,
              height: 54,
              borderRadius: 999,
              border: `1px dashed ${accent}59`,
              background: 'transparent',
              color: accent,
              fontSize: 26,
              fontWeight: 300,
              cursor: 'pointer',
              transition: 'border-color .6s ease, color .6s ease',
            }}
          >
            +
          </button>
        </div>

        {ideasOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Blueprints — tiles you're missing"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setIdeasOpen(false)
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 96,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              background: 'rgba(0,0,0,.72)',
              backdropFilter: 'blur(12px)',
              animation: 'bpVeil .35s ease both',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 'min(480px, 100%)',
                maxHeight: '84vh',
                overflow: 'auto',
                textAlign: 'center',
                padding: '12px 8px',
                animation: 'bpIn .55s cubic-bezier(.34,1.56,.64,1) both',
              }}
            >
              <p style={{ ...mono, fontSize: 9.5, color: accent, letterSpacing: '.2em', margin: '0 0 8px' }}>
                THE MENTOR SEES A GAP
              </p>
              <span style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic', fontSize: 24, color: 'var(--fg, #fff)' }}>
                You&apos;re not tracking everything.
              </span>

              <div style={{ margin: '30px 0 6px' }}>
                {tileIdeas(act?.id ?? 'overall').map((idea, i) => (
                  <div
                    key={idea.title}
                    style={{ padding: '18px 0', animation: `bpRow .6s cubic-bezier(.22,1,.36,1) ${0.12 + i * 0.09}s both` }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 14 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-serif), Georgia, serif',
                          fontStyle: 'italic',
                          fontSize: 'clamp(30px, 5vw, 40px)',
                          fontWeight: 400,
                          color: 'var(--fg, #fff)',
                        }}
                      >
                        {idea.word ?? idea.title.split(/[\s/]/)[0]}
                      </span>
                      <span style={{ ...mono, fontSize: 13, color: accent }}>≈ {idea.estWeight}%</span>
                    </div>
                    <p style={{ ...mono, fontSize: 10, color: 'var(--muted, #8a8f98)', margin: '7px 0 0', letterSpacing: '.08em' }}>
                      {idea.title.toLowerCase()} · {idea.tracks}
                    </p>
                  </div>
                ))}
              </div>

              <p
                style={{
                  ...mono,
                  fontSize: 10,
                  color: 'var(--muted, #8a8f98)',
                  margin: '18px 0 0',
                  animation: 'bpRow .6s ease .4s both',
                }}
              >
                want one? tell the mentor — <i style={{ color: 'var(--fg, #fff)', fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 13 }}>“build me water”</i>
              </p>
            </div>
          </div>
        )}

        {/* = y — results, progress, advice */}
        <div style={{ marginTop: 52, animation: 'fadeUp .8s ease .55s both' }}>
          <span aria-hidden style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 34, fontWeight: 300, color: `${accent}88`, transition: 'color .8s ease' }}>
            =
          </span>
          <h2 style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic', fontWeight: 400, fontSize: 'clamp(24px, 3.6vw, 34px)', color: 'var(--fg, #fff)', margin: '10px 0 0' }}>
            {act?.title}
          </h2>

          {/* progress — computed by the mentor's data sweeps */}
          <div style={{ width: 'min(520px, 100%)', margin: '26px auto 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ ...mono, fontSize: 10, color: 'var(--muted, #8a8f98)' }}>how far you&apos;ve come</span>
              <Roll value={act?.progress ?? 0} color={accent} size={22} />
            </div>
            <div style={{ height: 5, borderRadius: 999, background: `${accent}1c`, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${act?.progress ?? 0}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: accent,
                  transition: 'width 1s cubic-bezier(.22,1,.36,1), background .8s ease',
                }}
              />
            </div>
          </div>

          {/* mentor notices — bullets, the key words bold */}
          {advice && (
            <div style={{ width: 'min(560px, 100%)', margin: '30px auto 0', textAlign: 'left' }}>
              <p style={{ ...mono, fontSize: 10.5, color: accent, margin: '0 0 10px', transition: 'color .8s ease' }}>
                mentor notices
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {(advice.points ?? [advice.text]).map((pt, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      color: 'var(--muted, #b9c4be)',
                      fontSize: 13.5,
                      lineHeight: 1.65,
                      margin: '7px 0',
                    }}
                  >
                    <span aria-hidden style={{ color: accent, transition: 'color .8s ease' }}>◆</span>
                    <span>
                      {pt.split(/\*\*(.+?)\*\*/g).map((part, j) =>
                        j % 2 ? (
                          <strong key={j} style={{ color: 'var(--fg, #fff)', fontWeight: 600 }}>
                            {part}
                          </strong>
                        ) : (
                          part
                        ),
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p style={{ ...mono, fontSize: 9.5, color: 'var(--muted, #8a8f98)', margin: '18px 0 0' }}>
            results · progress · advice — swept and computed by the mentor, always
          </p>
        </div>

        {/* the mentor TALKS — chat with full sight of the board */}
        <MentorChat accent={accent} mono={mono} />

        {/* write a new goal — the mentor shapes it */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            width: 'min(560px, 100%)',
            margin: '54px auto 0',
            border: '1px dashed var(--border, #333)',
            borderRadius: 999,
            padding: '6px 8px 6px 18px',
            animation: 'fadeUp .8s ease .7s both',
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addGoal()
            }}
            placeholder="Write a goal, raw — the mentor shapes and weighs it."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg, #fff)', fontSize: 13.5 }}
          />
          <button
            type="button"
            onClick={addGoal}
            style={{
              flex: '0 0 auto',
              background: accent,
              color: '#0a0f0c',
              border: 'none',
              borderRadius: 999,
              padding: '9px 16px',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: 'pointer',
              transition: 'background .8s ease',
            }}
          >
            Give it to the mentor
          </button>
        </div>
      </div>
    </main>
  )
}
