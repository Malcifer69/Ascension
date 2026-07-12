# The Equation — the layout, the model, the business (2026-07-10)

Luke's one-liner: **find yourself, your algorithm.** The dashboard is an equation:

```
y  =  w1·x1 + w2·x2 + w3·x3 + …

y  = the Mentor tile (the OUTPUT): your #1 goal, everything summed
x  = each input tile (Train, Fuel, Vitals, … and every tile you add)
w  = that tile's weight toward the goal (≈ 22% bottom-right badge)
```

If the goal is "famous YouTuber + 185 lb lean" — Brand and Train carry big weights,
every tile is an input you feed, and the Mentor notices everything.

## The layout (SHIPPED — commits 7c56c4e + 558712c)

- **y on top:** the Mentor tile, full width. Label "Mentor", kicker "Notices everything".
  Eyebrow: *y = the output — every tile, summed*.
- **x below:** ONE horizontally scrollable row, every tile the same size (300×340),
  serif `+` glyphs in the gaps (x + x + x…), edges fade out. Eyebrow: *x = the inputs*.
- **+ tile** at the end (same size, dashed, transparent) → New-tile creator, which also
  promos the **Vitality Design Lab** ("out of ideas? browse Rowan & Luke's tiles —
  support them") → Patreon.
- **Edit** (small, above the row): tiles wobble, ✕ removes, drag reorders; persisted
  (`vitality:eq:order` / `vitality:eq:removed`).
- **Weights:** `lib/tiles/weights.ts` — plain numbers shown ≈ N% on each tile.
  **No AI key at runtime.** The user tells Claude Code their goal; Claude re-runs the
  math and edits the file (or a goals UI / the connector writes the
  `vitality:weights` localStorage override).

## Data-in — the teaching core ("the biggest problem")

Sealed tiles can't fetch (sandboxed, no network). So ALL automation flows one lane:

> **Tile = the gauge. One data table = the pipe. Claude = the robot that fills it.**

| Lane | How | Status |
|---|---|---|
| Manual | type in the tile → `Vitality.save()` | works |
| Claude in VS Code | ask Claude to write data / edit the tile | works |
| MCP fill | connector `create_tile`/`read_tile` (edit tiles by talking) | works |
| **Scheduled sweeps + API keys** | claude.ai scheduled task holds the key (Finnhub, YouTube), fetches, pushes into the tile's data via the connector | **GAP: connector has NO `save_data`/`read_data` tools — build these next** |

Canonical episode demo: *finances → Finnhub key → scheduled Claude task → stocks tile
updates itself every morning.* Same recipe: YouTube API → brand tile. One recipe,
infinite tiles.

## The Mentor (y) — next build

- Set the **#1 goal** on the Mentor in a nice design (goal text + target date).
- **Peak score, no Anthropic key:** each tile ships a deterministic score function
  (0–100, computed from its own data — defined per episode); it reports through the
  existing trusted bridge (`Vitality.report`, per-tile identity in useTileHost — the
  report lane exists in code but is currently a no-op in the base). Host aggregates:
  **score = Σ weight × tile score**, shows per-tile contribution (x = vitals = 45.3%).
- Claude (optional, user's own subscription) advises ON TOP of the numbers — the
  numbers themselves never need a key.

## The business loop

- **Free (YouTube):** the base — blank board, the equation layout, build-your-own
  tiles, everything shown on camera. One-paste setup + `/vitality` installs the demo set.
- **Paid (Patreon):** the **Vitality Design Lab** — the site with every episode's
  `/command` (e.g. `/logger`, `/finance`): run it and the tile lands in your row.
  Some free, most blurred behind the paywall. The **tile-customize / skin editor**
  (already built in the main app) becomes a paid Design Lab button too.
- **Each episode = one new input tile + one data-in method** (manual → MCP → API key →
  scheduled sweep). That's the content engine and the income.
- Patreon: https://www.patreon.com/cw/RowanTBK/shop · prod: https://vitality-jade.vercel.app
  (Design Lab live URL: Luke to supply — wire `DESIGN_LAB_URL` in DashboardGrid to it.)

## Next steps (in order)

1. **Connector data tools:** add `save_data(slot, data)` + `read_data(slot)` to
   `app/api/mcp/[transport]/route.ts` (mirror the tiles-table pattern onto `tile_data`)
   → unlocks scheduled sweeps end-to-end.
2. **Mentor goal UI + deterministic Peak score** (goal, weights editor, Σ w·x, per-tile %).
3. **Prove one sweep on camera:** Finnhub → finance tile, scheduled task, no key in the app.
4. Design Lab site: all-commands gallery, some free / most blurred (Patreon), plus the
   paid customize button. Swap `DESIGN_LAB_URL` to the real lab URL.
5. Dynamic slots (beyond the fixed 7) so every future episode adds a brand-new tile.
