# For Liam — building the Lab add-ons

Paste this whole file into Claude Code (in the Lab repo folder) so your mentor
knows the mission. Then say: *"read this, then read the repo, and let's work."*

## Who you are / the mission
You're Liam, building with Luke. **Vitality** is a life-dashboard people OWN — an
equation: a goal on top (**y**), input tiles feeding it (**x**), and an AI mentor
(Claude Code) running the math. People get the free dashboard by pasting ONE seed
prompt into Claude Code; the mentor scaffolds it and takes them live.

**Your job:** make the Lab websites' **Add-ons tab** as good as possible. Each
add-on is a "plug" a user drops into their dashboard.

## The three repos (all under github.com/RowanThistlebrooke)
- **vitality-base** — the free forkable dashboard users get from the seed. This is
  **THE DASHBOARD BASE**; add-ons install INTO it.
- **vitality-lab-demo** *(public)* — the free public Lab. Add-on **previews**. Paid
  payloads must **NOT** appear in this repo's source (anti-theft by absence).
- **vitality-lab-members** *(private)* — the paid Lab. The **real** add-on payloads.
  URL only on Patreon. **KEEP PRIVATE.**

## Add-ons tab — EXACT parity
The Add-ons tab must be the **exact same design and the same code** as the live
Vitality lab. **Do not redesign** — copy the markup/CSS from the existing lab and
keep it identical. New add-ons slot into that same structure.

## What an add-on IS — two parts
1. **A finished tile** — one self-contained sealed HTML file (all CSS/JS inline, no
   external requests). Lives at `public/tiles/<slot>.html` on the dashboard.
2. **A custom install command/prompt** — a `/command` (drops into `.claude/commands/`)
   or a copy-paste prompt. The user runs it in Claude Code; it writes the tile into
   the right slot and wires it up. Commit → redeploy (or MCP) → it appears on the
   dashboard. **Every add-on needs this — that's how it ties to the user's board.**

## How a tile ties to the dashboard — the bridge contract
Tiles are sealed sandboxed iframes; they CANNOT fetch. They talk to the dashboard
ONLY through `window.Vitality`:
- `save(data)` / `load()` — persist + read this tile's own data
- `read(slot)` — read another tile's data (e.g. Peak reads Vitals)
- `tiktok(handle)` — live follower count, **keyless** (works for everyone)
- `youtube(handle)` — subscriber count (needs the user's free `YOUTUBE_API_KEY`, server-routed)
- `stock(symbol)` — latest price (needs the user's free `FINNHUB_API_KEY`, server-routed)

Slots: `train fuel vitals brand peak finance` (+ `vee`). Aesthetic: **vanilla CSS
only**, near-black bg, mint `#6EE7B7` / gold accents, serif = Georgia italic.

## The one rule
Tiles just **represent data**. The mentor (Claude Code) does the intelligence and
ties inputs to the goal. Keep tiles minimal — base inputs in, the user builds the
rest with the mentor.

## Your workflow
1. Clone the repo (tell Claude Code: *"clone <link> and open it"*).
2. Edit the **Add-ons tab** — keep the design identical to the live lab.
3. For each add-on: build the **tile** + its **install command**, wired to the
   bridge doors above.
4. Commit → **push** → Vercel auto-deploys. The public demo preview must NOT contain
   the paid payload; the private member repo holds the real one.
