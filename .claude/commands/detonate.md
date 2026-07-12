---
description: Detonate the dashboard — deterministic reset to a black (or ambient) screen. The board reads a code flag, so this works the same every time. Run "/detonate undo" to come back.
---

You are detonating this Vitality dashboard. This is DETERMINISTIC, not improvised:
the board renders its detonated state from ONE code flag, and your job is exactly
these steps — nothing more.

The argument is: $ARGUMENTS
- empty or "black" → full detonation (pure black screen, only the settings gear)
- "ambient"        → keep the atmosphere (background + greeting stay; tiles go)
- "undo"           → bring the board back

## Detonate (black or ambient)

1. Remove every tile file: delete `public/tiles/*.html` (KEEP `README.md` and
   `.gitkeep`).
2. Set the flag in `content/site.ts`: add `detonated: 'black'` (or
   `detonated: 'ambient'`) to the `site` object. The board reads this flag in
   code (see app/app/Dashboard.tsx) — that is what makes the screen go black.
3. If Supabase is configured (NEXT_PUBLIC_SUPABASE_URL set) the board also loads
   live tiles from the `tiles` table — clear them too or they resurrect the
   board: for each slot run the connector's delete_tile, or in the Supabase SQL
   editor: `delete from public.tiles;`
4. Do NOT touch git history, docs/, tiles-library/, or lib/. Everything they
   built stays recoverable — and YOU keep the full context of this project, so
   when they build again you already know their world.
5. Tell them in one line: detonated — run /detonate undo to come back, or just
   start building.

## Undo

1. Remove the `detonated` key from `content/site.ts`.
2. Tiles do NOT auto-restore (they were deleted). Offer: run `/vitality` to
   reinstall the full dashboard from tiles-library/, or rebuild tile by tile.

RULE: this command is idempotent — safe to run again. Never delete anything
outside public/tiles/*.html and the one flag line.
