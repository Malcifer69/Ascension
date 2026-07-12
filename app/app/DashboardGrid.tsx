'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { CORE_TILES, VEE_TILE, DEFAULT_HOME_ORDER, coreDefaultSize, type CoreTile } from '@/lib/tiles/coreTiles'
import dynamic from 'next/dynamic'
import { activeGoal as readActiveGoal, allGoals, setActiveGoalId, tileWeights, type Goal } from '@/lib/tiles/weights'

// Lazy: the board never pays for the mentor (Three.js gem included) until it
// comes alive. Keeps first load fast.
const MentorPage = dynamic(() => import('@/app/mentor/MentorPage'), { ssr: false })
import { initVeeTiles } from '@/components/veeTilesAnim'
import { useTileHost } from '@/lib/tiles/useTileHost'
import { withBridge } from '@/lib/tiles/tileBridge'
import { syncEnabled, syncLoadTiles, syncSaveTile } from '@/lib/sync'
import type { DashboardChrome } from '@/lib/tiles/dashboardChrome'

/**
 * The base dashboard grid. Every tile is an inert SLOT: the beautiful poster is
 * fixed, and clicking a tile either opens the sealed HTML you dropped into
 * public/tiles/<slot>.html (Patreon command or your own `/tile`), or — if the slot
 * is empty — opens the "how to build this" ConnectorOverlay.
 *
 * No auth, no drag/customize, no server. Layout is a pure function of
 * (order, sizes, cols) via the shared packer; the living orbs are animated by
 * initVeeTiles, exactly as in the full app.
 */

// The fixed slot roster (the seeded order + sizes), minus the Library tile.
const SLOT_ORDER = DEFAULT_HOME_ORDER.filter((id) => id !== 'library') as string[]

type FilledMap = Record<string, string> // slotId -> sealed HTML

/* ── the Vee centre art (wire feeds + ring pulse), animated by veeTilesAnim ── */
function VeeArt() {
  return (
    <>
      <div className="disc" />
      <svg className="art" viewBox="0 0 434 250">
        <path className="wire" style={{ stroke: 'rgba(167,243,208,.2)' }} d="M216 66 V2" />
        <path className="wire" style={{ stroke: 'rgba(185,163,255,.2)' }} d="M262 96 H300 V40 H760" />
        <path className="wire" style={{ stroke: 'rgba(232,200,120,.2)' }} d="M262 140 H320 V192 H760" />
        <path className="wire" style={{ stroke: 'rgba(167,243,208,.2)' }} d="M190 158 V248" />
        <path className="wire" style={{ stroke: 'rgba(185,163,255,.2)' }} d="M170 140 H114 V192 H-326" />
        <path className="wire" style={{ stroke: 'rgba(232,200,120,.2)' }} d="M170 96 H134 V56 H-326" />
        <g className="feedgrp">
          <path className="feed" pathLength="100" d="M216 2 V66" />
          <path className="feed" pathLength="100" d="M760 40 H300 V96 H262" />
          <path className="feed" pathLength="100" d="M760 192 H320 V140 H262" />
          <path className="feed" pathLength="100" d="M190 248 V158" />
          <path className="feed" pathLength="100" d="M-326 192 H114 V140 H170" />
          <path className="feed" pathLength="100" d="M-326 56 H134 V96 H170" />
        </g>
        <rect className="chip" x="170" y="66" width="92" height="92" rx="24" />
        <g className="ringgrp">
          <rect className="ring-soft" x="170" y="66" width="92" height="92" rx="24" />
          <rect className="ring-line" x="170" y="66" width="92" height="92" rx="24" />
        </g>
        <g className="vgrp">
          <path className="v-base" d="M201 96 L216 129 L231 96" />
          <path className="vm" d="M201 96 L216 129 L231 96" />
        </g>
      </svg>
      <div className="scrim" />
    </>
  )
}

/* ── a percentage that ROLLS to its value like a stock ticker ── */
function RollPct({ value, color }: { value: number; color: string }) {
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
        // top-centre with generous margin — clear of the index row above and
        // the art + caption below, so the number is never blocked.
        position: 'absolute',
        top: 52,
        left: 0,
        right: 0,
        zIndex: 5,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 46,
        fontWeight: 300,
        letterSpacing: '.02em',
        fontVariantNumeric: 'tabular-nums',
        color,
        opacity: 0.9,
        textShadow: `0 0 26px ${color}59`,
        transition: 'color .8s ease, text-shadow .8s ease',
      }}
    >
      {shown}%
    </span>
  )
}

/* ── one tile face (core poster or Vee), inert: the hit layer opens a slot ── */
function TileFace({
  id,
  isVee,
  core,
  fixed,
  editable,
  onRemove,
  weight,
  accent,
  kicker,
  onOpen,
}: {
  id: string
  isVee: boolean
  core: CoreTile | null
  /** Equation layout: explicit size (y = full-width mentor, x = uniform row tile). */
  fixed?: CSSProperties
  /** Row tiles wobble in edit mode; the mentor (y) never does. */
  editable?: boolean
  /** Present only in edit mode: shows the ✕ remove badge. */
  onRemove?: () => void
  /** This input's share of the active goal — big, centered, no border. */
  weight?: number
  /** The active goal's color: mint by default, gold for the main goal. */
  accent?: string
  /** Mentor only: the active goal title, shown as the kicker. */
  kicker?: string
  onOpen: () => void
}) {
  const label = isVee ? VEE_TILE.label : core!.label
  const index = isVee ? VEE_TILE.index : core!.index
  const variant = (core?.variant || (isVee ? 'vee' : undefined)) as string | undefined
  const orb = !isVee && core ? core.orb : undefined
  const style: CSSProperties = { position: 'relative', ...fixed }
  return (
    <div
      data-size={isVee ? coreDefaultSize('vee') : coreDefaultSize(id as Parameters<typeof coreDefaultSize>[0])}
      data-orb={orb?.mode}
      data-roam={orb?.roam}
      data-pt={orb?.pt}
      className={`tile${variant ? ' ' + variant : ''}${editable ? ' editable' : ''}`}
      style={style}
    >
      <div className="aurora" />

      {isVee ? <VeeArt /> : core!.art}

      <span className="index">{index}</span>
      {!isVee && core && <span className="glyph">{core.glyph}</span>}
      {isVee && <span className="kicker">{kicker ?? VEE_TILE.kicker}</span>}

      {isVee ? (
        <span className="label">{label}</span>
      ) : (
        <div className="cap">
          <span className="label">{label}</span>
        </div>
      )}
      <span className="arrow">→</span>

      {weight != null && <RollPct value={weight} color={accent ?? '#6EE7B7'} />}

      {/* Inert: clicking opens the slot (filled tile or connector), never navigates. */}
      <button type="button" className="hit" aria-label={`Open ${label}`} onClick={onOpen} />

      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 9,
            width: 26,
            height: 26,
            borderRadius: 999,
            border: '1px solid rgba(255,107,107,.5)',
            background: 'rgba(20,6,6,.85)',
            color: '#ff6b6b',
            cursor: 'pointer',
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}

/* ── open a filled slot's sealed HTML in a sandboxed iframe ── */
function OpenTileOverlay({
  slot,
  register,
  unregister,
  onClose,
}: {
  slot: { id: string; name: string; html: string }
  register: (w: Window | null, id: string) => void
  unregister: (w: Window | null) => void
  onClose: () => void
}) {
  const winRef = useRef<Window | null>(null)
  return (
    <div className="openOverlay openFull" role="dialog" aria-modal="true" aria-label={slot.name}>
      <div className="openCard">
        <div className="openTop">
          <button type="button" className="openBack" onClick={onClose}>
            <span aria-hidden="true">←</span> Dashboard
          </button>
          <span className="openSlotName">{slot.name}</span>
        </div>
        <div className="openStage">
          <iframe
            ref={(el) => {
              if (el) {
                winRef.current = el.contentWindow
                register(el.contentWindow, slot.id)
              } else if (winRef.current) {
                unregister(winRef.current)
                winRef.current = null
              }
            }}
            onLoad={(e) => {
              winRef.current = e.currentTarget.contentWindow
              register(e.currentTarget.contentWindow, slot.id)
            }}
            className="openFrame"
            srcDoc={withBridge(slot.html)}
            sandbox="allow-scripts"
            title={slot.name}
          />
        </div>
      </div>
    </div>
  )
}

/* ── the connector: how to build (and hook up) an empty slot ── */
function ConnectorOverlay({ id, label, onClose }: { id: string; label: string; onClose: () => void }) {
  const path = `public/tiles/${id}.html`
  const prompt = `Build a "${label}" tile for my Vitality dashboard as ONE self-contained HTML file (all CSS and JS inline, no external requests). Dark background, mint #6EE7B7. Save and load with await window.Vitality.save(data) and await window.Vitality.load() (the dashboard provides window.Vitality, do not use localStorage). Write it to ${path}.`
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(prompt).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }
  return (
    <div
      className="openOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Build the ${label} tile`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="openCard" style={{ maxWidth: 620 }}>
        <div className="openTop">
          <span className="openTitle">Build the {label} tile</span>
          <button type="button" className="openClose" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <div className="openStage" style={{ display: 'block', overflow: 'auto', padding: '22px 24px' }}>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginTop: 0 }}>
            This tile is a <strong style={{ color: 'var(--fg)' }}>slot</strong>. It fills when a
            file exists at <code style={{ color: 'var(--mint)' }}>{path}</code>. Two ways to fill it:
          </p>

          <ol style={{ color: 'var(--muted)', lineHeight: 1.7, paddingLeft: 18 }}>
            <li>
              <strong style={{ color: 'var(--fg)' }}>From a Patreon episode:</strong> drop the
              episode's command into <code>.claude/commands/</code> and run it in Claude Code (e.g.
              <code style={{ color: 'var(--mint)' }}> /logger</code>). It writes this exact file.
            </li>
            <li style={{ marginTop: 8 }}>
              <strong style={{ color: 'var(--fg)' }}>Build your own:</strong> run
              <code style={{ color: 'var(--mint)' }}> /tile {id}</code>, or paste this into Claude Code:
            </li>
          </ol>

          <pre
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '12px 14px',
              whiteSpace: 'pre-wrap',
              color: 'var(--fg)',
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            {prompt}
          </pre>

          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
            Then commit + redeploy (or reload locally) and the tile appears right here.
          </p>

          <button
            type="button"
            onClick={copy}
            style={{
              marginTop: 14,
              padding: '0.65rem 1.2rem',
              borderRadius: 999,
              background: 'var(--mint)',
              color: 'var(--mint-ink, #042a1c)',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {copied ? 'Copied ✓' : 'Copy build prompt'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Rowan & Luke's Design Lab — every episode's /command lives here. */
// The demo Lab ships INSIDE the dashboard (public/demo) — so this link always
// works on every fork, at their own URL, with no external site to deploy.
const DESIGN_LAB_URL = '/demo/index.html'

/* ── the "+ New tile" panel: dead simple — start with /tile ── */
function NewTileOverlay({ onClose }: { onClose: () => void; onSaved?: (slot: string, html: string) => void }) {
  return (
    <div
      className="openOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="New tile"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="openCard" style={{ maxWidth: 560, height: 'auto' }}>
        <div className="openTop">
          <span className="openTitle">New tile</span>
          <button type="button" className="openClose" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <div className="openStage" style={{ display: 'block', overflow: 'auto', padding: '26px 26px 30px' }}>
          <p style={{ margin: 0, textAlign: 'center', color: 'var(--fg)', fontSize: 22, fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic' }}>
            Start with <code style={{ color: 'var(--mint)', fontStyle: 'normal', fontSize: 20 }}>/tile</code>
          </p>
          <p style={{ margin: '12px auto 0', maxWidth: 380, textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.65 }}>
            In Claude Code, run <code style={{ color: 'var(--mint)' }}>/tile train</code> (or any slot:
            fuel, vitals, brand, peak, finance). It builds the tile and drops it straight onto your board.
          </p>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '13px 16px',
              margin: '24px 0 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.5 }}>
              Out of ideas? Browse <strong style={{ color: 'var(--fg)' }}>Rowan &amp; Luke&apos;s builds</strong> in the Design Lab.
            </p>
            <a
              href={DESIGN_LAB_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: '0 0 auto',
                background: 'var(--mint)',
                color: 'var(--mint-ink, #042a1c)',
                borderRadius: 999,
                padding: '8px 14px',
                fontWeight: 600,
                fontSize: 12.5,
                textDecoration: 'none',
              }}
            >
              Design Lab →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── the welcome-home "see the vision" screen: pure black, one line, one way back ── */
function EmptyCanvas({ onBack }: { onBack: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 24,
        zIndex: 100,
      }}
    >
      <h1
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: 'clamp(40px, 7vw, 76px)',
          color: '#fff',
          margin: 0,
          letterSpacing: '-.015em',
        }}
      >
        See the vision.
      </h1>
      <p style={{ color: '#6EE7B7', fontSize: 'clamp(15px, 2.4vw, 21px)', margin: '18px 0 0', letterSpacing: '.02em' }}>
        You can create anything.
      </p>
      <button
        type="button"
        onClick={onBack}
        style={{
          marginTop: 42,
          background: '#6EE7B7',
          color: '#04140d',
          border: 'none',
          borderRadius: 999,
          padding: '13px 28px',
          fontWeight: 600,
          fontSize: 15,
          cursor: 'pointer',
        }}
      >
        ← Back to dashboard
      </button>
    </div>
  )
}

/* ── the blank board's default face: shown when no tiles exist yet ── */
function VisionEmptyState({ onNewTile }: { onNewTile: () => void }) {
  return (
    <div
      style={{
        minHeight: '62vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
      }}
    >
      <h1
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: 'clamp(36px, 6vw, 68px)',
          color: 'var(--fg, #fff)',
          margin: 0,
          letterSpacing: '-.015em',
        }}
      >
        See the vision.
      </h1>
      <p style={{ color: '#6EE7B7', fontSize: 'clamp(15px, 2.4vw, 20px)', margin: '16px 0 0', letterSpacing: '.02em' }}>
        You can create anything.
      </p>
      <p style={{ color: 'var(--muted, #8a8f98)', fontSize: 14, margin: '28px 0 0', maxWidth: 460, lineHeight: 1.65 }}>
        This board is yours, and empty. Build your own tile with <strong style={{ color: 'var(--fg, #fff)' }}>+ New
        tile</strong> — or run <code style={{ color: '#6EE7B7' }}>/vitality</code> in Claude Code to load the full
        dashboard we built.
      </p>
      <button
        type="button"
        onClick={onNewTile}
        style={{
          marginTop: 30,
          background: '#6EE7B7',
          color: '#04140d',
          border: 'none',
          borderRadius: 999,
          padding: '12px 26px',
          fontWeight: 600,
          fontSize: 15,
          cursor: 'pointer',
        }}
      >
        + New tile
      </button>
    </div>
  )
}

interface DashboardGridProps {
  userId: string
  chrome?: DashboardChrome
}

export default function DashboardGrid({ userId }: DashboardGridProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [cols, setCols] = useState(4)
  const [filled, setFilled] = useState<FilledMap>({})
  const [openId, setOpenId] = useState<string | null>(null) // filled slot opened live
  const [connectId, setConnectId] = useState<string | null>(null) // empty slot connector
  const [newOpen, setNewOpen] = useState(false) // "+ New tile" creator
  const [showWelcome, setShowWelcome] = useState(false) // transient "see the vision" home (non-destructive)
  const [loaded, setLoaded] = useState(false) // tile discovery finished — gates the blank "see the vision" state
  const [scratched, setScratched] = useState(false) // deliberate "start from scratch" → clean canvas, no onboarding text
  const [editing, setEditing] = useState(false) // edit mode: row tiles wobble, show ✕, drag to reorder
  const [order, setOrder] = useState<string[]>([]) // persisted row order (x tiles)
  const [removed, setRemoved] = useState<string[]>([]) // slots removed from the row in edit mode
  const [goal, setGoal] = useState<Goal | undefined>(undefined) // active goal: drives %s, colors, the mentor kicker
  const [mentorAlive, setMentorAlive] = useState(false) // the mentor comes to life OVER the board — no page load
  const [xPeek, setXPeek] = useState(true) // the `x = %s` breakdown: flashes on change, fades after 5s (the `x` stays)
  const dragId = useRef<string | null>(null)

  const { register, unregister } = useTileHost(userId, undefined, () => {})

  useEffect(() => {
    setMounted(true)
    try {
      setScratched(window.localStorage.getItem('vitality:scratched') === '1')
      const o = JSON.parse(window.localStorage.getItem('vitality:eq:order') || 'null')
      if (Array.isArray(o)) setOrder(o.filter((x) => typeof x === 'string'))
      const r = JSON.parse(window.localStorage.getItem('vitality:eq:removed') || 'null')
      if (Array.isArray(r)) setRemoved(r.filter((x) => typeof x === 'string'))
      setGoal(readActiveGoal())
    } catch {
      /* ignore */
    }
  }, [])

  // While the mentor is alive over the board, the board must not scroll —
  // only the overlay does (it has its own overflowY). Blur stays.
  useEffect(() => {
    if (!mentorAlive) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mentorAlive])

  // Column bucket, matching the CSS: 4 desktop / 2 phone.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const apply = () => setCols(mq.matches ? 2 : 4)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Discover which slots are filled, from two sources (live wins over static):
  //   1. static files committed to public/tiles/<id>.html (the /tile + Patreon path)
  //   2. live tiles in Supabase, built from Claude via the MCP connector — these
  //      override a static file for the same slot and appear without a redeploy.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const pairs = await Promise.all(
        SLOT_ORDER.map(async (id) => {
          try {
            const res = await fetch(`/tiles/${id}.html`, { cache: 'no-store' })
            if (!res.ok) return null // 404 → slot is empty
            const html = await res.text()
            if (!html.trim()) return null
            return [id, html] as const
          } catch {
            return null
          }
        }),
      )
      const map: FilledMap = {}
      for (const p of pairs) if (p) map[p[0]] = p[1]

      if (syncEnabled()) {
        const remote = await syncLoadTiles()
        for (const id of SLOT_ORDER) if (remote[id]) map[id] = remote[id].html
      }

      if (alive) {
        setFilled(map)
        setLoaded(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // The board shows ONLY tiles that actually exist. A fresh scaffold has none, so
  // it boots to the blank "see the vision" canvas; tiles appear as they're built
  // (/tile), shipped by an episode command (/logger), or installed (/vitality).
  const filledOrder = useMemo(() => SLOT_ORDER.filter((id) => filled[id]), [filled])

  // Each input's estimated share of the goal (plain numbers — Claude retunes them
  // at build time for YOUR goal; localStorage override wins. See lib/tiles/weights).
  const weights = useMemo(() => (mounted ? tileWeights() : {}), [mounted, goal])

  // The equation row (the x's): every filled slot except the mentor, in the user's
  // saved order, minus anything they removed in edit mode. New tiles append.
  const rowIds = useMemo(() => {
    const base = order.length ? order : SLOT_ORDER
    const seen = new Set(base)
    const all = [...base, ...SLOT_ORDER.filter((id) => !seen.has(id))]
    return all.filter((id) => id !== 'vee' && filled[id] && !removed.includes(id))
  }, [order, filled, removed])

  // The live `x =` breakdown: each tile's real-time weight toward the goal.
  const xPercents = rowIds.map((id) => `${weights[id] ?? 0}%`).join(' · ')
  // Flash it whenever anything changes (weights retuned, goal switched, tiles
  // reordered/added), hold 5s, then fade. Keyed on the actual values so it only
  // re-shows on a real change.
  const xSignature = rowIds.map((id) => `${id}:${weights[id] ?? 0}`).join(',') + '|' + (goal?.id ?? '')
  useEffect(() => {
    setXPeek(true)
    const t = setTimeout(() => setXPeek(false), 5000)
    return () => clearTimeout(t)
  }, [xSignature])

  const saveOrder = (next: string[]) => {
    setOrder(next)
    try {
      window.localStorage.setItem('vitality:eq:order', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const saveRemoved = (next: string[]) => {
    setRemoved(next)
    try {
      window.localStorage.setItem('vitality:eq:removed', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  // Drag-reorder: while dragging over a sibling, move the dragged tile there live.
  const moveTo = (src: string, dst: string) => {
    if (src === dst) return
    const cur = rowIds.slice()
    const from = cur.indexOf(src)
    const to = cur.indexOf(dst)
    if (from < 0 || to < 0) return
    cur.splice(from, 1)
    cur.splice(to, 0, src)
    saveOrder(cur)
  }

  // (Re)bind the living orbs whenever the packed layout changes.
  useEffect(() => {
    if (!ref.current || !mounted) return
    return initVeeTiles(ref.current, { score: null, showNumber: false })
  }, [mounted, cols, filledOrder])

  // Esc closes any overlay.
  useEffect(() => {
    if (!openId && !connectId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenId(null)
        setConnectId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, connectId])

  if (!mounted) return null

  const openSlot = (id: string) => {
    if (editing) return // while editing, taps rearrange — they don't open
    if (filled[id]) setOpenId(id)
    else setConnectId(id)
  }

  const labelFor = (id: string) => (id === 'vee' ? VEE_TILE.label : CORE_TILES[id as keyof typeof CORE_TILES].label)

  const isEmpty = filledOrder.length === 0

  return (
    <div className={`veeTiles${editing ? ' editing' : ''}`} ref={ref}>
      {!loaded ? null : isEmpty ? (
        // A fresh board shows the onboarding vision; a deliberately-scratched board
        // stays clean — just header + background, nothing in the middle.
        scratched ? null : <VisionEmptyState onNewTile={() => setNewOpen(true)} />
      ) : (
        // ── The equation: y on top (the mentor — the output), x + x + x below
        //    (the inputs — one scrollable row, every tile the same size). ──
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <style>{`@keyframes goalPop { from { opacity: 0; transform: translateY(12px) scale(.94) } to { opacity: 1; transform: none } }`}</style>

          {/* the picked goal comes out — big, centred, in its own colour */}
          <div style={{ textAlign: 'center', minHeight: 46 }}>
            <span
              key={goal?.id ?? 'none'}
              style={{
                display: 'inline-block',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: 'clamp(22px, 3.2vw, 34px)',
                color: goal?.accent ?? 'var(--mint, #6EE7B7)',
                textShadow: `0 0 34px ${goal?.accent ?? '#6EE7B7'}44`,
                animation: 'goalPop .7s cubic-bezier(.22,1,.36,1) both',
              }}
            >
              {goal?.id === 'overall' ? '★ ' : ''}
              {goal?.title ?? ''}
            </span>
          </div>

          {/* y = the goal picker — every goal visible, one tap to switch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontSize: 22, color: goal?.accent ?? 'var(--mint, #6EE7B7)', transition: 'color .8s ease' }}>y</span>
            <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--muted, #8a8f98)' }}>=</span>

            {/* main (★) goal stands alone; the standalone goals share ONE border */}
            {(() => {
              const gs = mounted ? allGoals() : []
              const mainG = gs.find((g) => g.id === 'overall')
              const others = gs.filter((g) => g.id !== 'overall')
              const pick = (g: Goal) => {
                setActiveGoalId(g.id)
                setGoal(g)
                try {
                  window.dispatchEvent(new CustomEvent('vitality:goal'))
                } catch {
                  /* ignore */
                }
              }
              const btn = (g: Goal, grouped: boolean) => {
                const on = g.id === goal?.id
                const main = g.id === 'overall'
                const gA = g.accent ?? '#6EE7B7'
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => pick(g)}
                    style={{
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      fontSize: 11,
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      color: on || main ? gA : 'var(--muted, #8a8f98)',
                      background: on ? `${gA}1a` : 'transparent',
                      border: grouped ? 'none' : `1px solid ${on ? `${gA}88` : `${gA}44`}`,
                      boxShadow: grouped && on ? `inset 0 0 0 1px ${gA}66` : 'none',
                      borderRadius: 999,
                      padding: '7px 15px',
                      cursor: 'pointer',
                      transition: 'color .5s ease, background .5s ease, border-color .5s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {main ? '★ ' : ''}
                    {g.title}
                  </button>
                )
              }
              return (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {mainG && btn(mainG, false)}
                  {others.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, border: '1px solid var(--border, #262626)', borderRadius: 999, padding: 4, flexWrap: 'wrap' }}>
                      {others.map((g) => btn(g, true))}
                    </div>
                  )}
                </div>
              )
            })()}

          </div>
          <TileFace
            id="vee"
            isVee
            core={null}
            fixed={{ width: '100%', height: 'clamp(240px, 34vh, 340px)' }}
            kicker={goal?.title}
            onOpen={() => {
              if (!editing) setMentorAlive(true) // the mentor comes to life — no page load
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <a href="/mentor" style={{ display: 'flex', alignItems: 'baseline', gap: 10, textDecoration: 'none' }}>
              <span style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontSize: 22, color: goal?.accent ?? 'var(--mint, #6EE7B7)', transition: 'color .8s ease' }}>x</span>
              <span
                aria-hidden
                style={{
                  fontFamily: 'ui-monospace, Menlo, monospace',
                  fontSize: 11,
                  letterSpacing: '.16em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  color: goal?.accent ?? 'var(--mint, #6EE7B7)',
                  opacity: xPeek ? 0.8 : 0,
                  transform: xPeek ? 'translateX(0)' : 'translateX(-6px)',
                  filter: xPeek ? 'blur(0)' : 'blur(3px)',
                  transition:
                    'opacity .9s cubic-bezier(.16,1,.3,1), transform .9s cubic-bezier(.16,1,.3,1), filter .9s ease',
                }}
              >
                = {xPercents}
              </span>
            </a>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              style={{
                background: editing ? 'var(--mint)' : 'transparent',
                color: editing ? 'var(--mint-ink, #042a1c)' : 'var(--muted)',
                border: editing ? 'none' : '1px solid var(--border)',
                borderRadius: 999,
                padding: '5px 14px',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 16,
              overflowX: 'auto',
              paddingBottom: 14,
              // soften the row's edges: tiles fade out instead of clipping hard
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0, #000 18px, #000 calc(100% - 64px), transparent 100%)',
              maskImage:
                'linear-gradient(to right, transparent 0, #000 18px, #000 calc(100% - 64px), transparent 100%)',
              padding: '4px 18px 14px',
              margin: '0 -18px',
            }}
          >
            {rowIds.map((id, i) => (
              <Fragment key={id}>
                {i > 0 && (
                  <span
                    aria-hidden
                    style={{
                      flex: '0 0 auto',
                      alignSelf: 'center',
                      color: 'rgba(110,231,183,.45)',
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontSize: 30,
                      fontWeight: 300,
                    }}
                  >
                    +
                  </span>
                )}
              <div
                draggable={editing}
                onDragStart={() => {
                  dragId.current = id
                }}
                onDragOver={(e) => {
                  if (editing && dragId.current && dragId.current !== id) {
                    e.preventDefault()
                    moveTo(dragId.current, id)
                  }
                }}
                onDragEnd={() => {
                  dragId.current = null
                }}
                style={{ flex: '0 0 auto' }}
              >
                <TileFace
                  id={id}
                  isVee={false}
                  core={CORE_TILES[id as keyof typeof CORE_TILES]}
                  fixed={{ width: 300, height: 340 }}
                  editable
                  onRemove={editing ? () => saveRemoved([...removed, id]) : undefined}
                  weight={weights[id] ?? 0}
                  accent={goal?.accent}
                  onOpen={() => openSlot(id)}
                />
              </div>
              </Fragment>
            ))}

            {rowIds.length > 0 && (
              <span
                aria-hidden
                style={{
                  flex: '0 0 auto',
                  alignSelf: 'center',
                  color: 'rgba(110,231,183,.45)',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: 30,
                  fontWeight: 300,
                }}
              >
                +
              </span>
            )}

            {/* the + tile: same size, transparent — build the next input */}
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              aria-label="New tile"
              style={{
                flex: '0 0 auto',
                width: 300,
                height: 340,
                borderRadius: 20,
                border: '1px dashed rgba(110,231,183,.35)',
                background: 'transparent',
                color: 'var(--mint, #6EE7B7)',
                fontSize: 46,
                fontWeight: 300,
                cursor: 'pointer',
              }}
            >
              +
            </button>
          </div>
        </div>
      )}

      {openId && filled[openId] && (
        <OpenTileOverlay
          key={openId}
          slot={{ id: openId, name: labelFor(openId), html: filled[openId] }}
          register={register}
          unregister={unregister}
          onClose={() => setOpenId(null)}
        />
      )}

      {connectId && (
        <ConnectorOverlay id={connectId} label={labelFor(connectId)} onClose={() => setConnectId(null)} />
      )}

      {newOpen && (
        <NewTileOverlay
          onClose={() => setNewOpen(false)}
          onSaved={(slot, html) => setFilled((prev) => ({ ...prev, [slot]: html }))}
        />
      )}

      {!isEmpty && (
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 6 }}>
          <button
            type="button"
            onClick={() => setShowWelcome(true)}
            aria-label="See the vision"
            style={{
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '10px 16px',
              fontWeight: 500,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            See the vision
          </button>
        </div>
      )}

      {showWelcome && <EmptyCanvas onBack={() => setShowWelcome(false)} />}

      {/* the mentor, alive over the board — everything fades behind it */}
      {mentorAlive && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 95,
            overflowY: 'auto',
            overscrollBehavior: 'contain', // reaching the ends must not scroll the board behind
            background: 'rgba(3, 8, 6, .93)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <MentorPage
            overlay
            onClose={() => {
              setMentorAlive(false)
              // whatever goal they picked in there, the board follows it
              setGoal(readActiveGoal())
              try {
                window.dispatchEvent(new CustomEvent('vitality:goal'))
              } catch {
                /* ignore */
              }
            }}
          />
        </div>
      )}
    </div>
  )
}
