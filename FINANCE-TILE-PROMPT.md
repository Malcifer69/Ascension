# Finance Tile — Master Build Prompt

Give this whole document to Claude Code as one prompt. It fully specifies the
Finance tile for the Vitality dashboard: the architecture contract, the exact
design system, the data model, every one of the five tabs, the AI screenshot
import, and the invariants that keep it accurate. Build it laser-perfect by
following every section; verify against the "Accuracy checklist" at the end.

---

## 0. Goal

Build ONE self-contained HTML file at `public/tiles/finance.html` (and mirror
the finished file byte-for-byte to `tiles-library/finance.html`). It is a
sealed dashboard tile: a personal-finance module with five tabs — **Net worth ·
Stocks · Subs · Orders · Wishlist** — that reads like the rest of the Vitality
dashboard (dark, mint accent, editorial serif numbers).

---

## 1. The Sealed-Tile Contract (non-negotiable)

1. **One file. Everything inline.** All CSS and JS inside the single HTML file.
   No external requests, no CDN, no imports, no web fonts. The tile runs in a
   sandboxed iframe (`sandbox="allow-scripts"`, opaque origin) with **no network
   and no `localStorage`** — anything not inline will not load, and touching
   `localStorage` throws.
2. **Persist only through the host bridge** `window.Vitality`, which the
   dashboard injects before the tile runs. Never define it yourself in the tile.
   - `await window.Vitality.save(store)` — persist the whole store object.
   - `const d = await window.Vitality.load()` — read it back (`{}`/`[]` when empty).
   - `await window.Vitality.stock(symbol)` — latest price for a ticker (resolves
     a number; rejects `Error('no_key')` when no Finnhub key is set). Server-routed
     so the Finnhub key never enters the tile.
   - `await window.Vitality.ai(messagesApiBody)` — make one Anthropic Messages API
     call (resolves the response JSON; rejects `Error('no_key')` when no key).
     The key lives server-side or in the HOST page — never in the tile.
   - `await window.Vitality.aiKey(key)` — save/clear the user's pasted Anthropic
     key in HOST storage (`''` clears). Resolves `true`.
   - `await window.Vitality.aiStatus()` — resolves `'env'` (server key), `'local'`
     (pasted key), or `null` (none).
3. **On load**, call `window.Vitality.load()` first and render whatever comes back,
   so state restores every time the tile opens. Default every array field.
4. **Standalone fallback.** If `window.Vitality` is undefined (the file opened as
   a raw file, no dashboard), shim it with a `localStorage`-backed `save`/`load`,
   a `read` returning null, and `stock`/`ai` that reject `Error('no_key')`, plus
   no-op `aiKey`/`aiStatus`. In the real sealed tile this branch never runs.

```js
if(!window.Vitality){window.Vitality={
  save:function(d){try{localStorage.setItem('v:prev:finance',JSON.stringify(d));}catch(e){}return Promise.resolve(true);},
  load:function(){try{return Promise.resolve(JSON.parse(localStorage.getItem('v:prev:finance')||'{}'));}catch(e){return Promise.resolve({});}},
  read:function(){return Promise.resolve(null);},
  stock:function(){return Promise.reject(new Error('no_key'));},
  ai:function(){return Promise.reject(new Error('no_key'));},
  aiKey:function(){return Promise.resolve(true);},
  aiStatus:function(){return Promise.resolve(null);}};}
```

---

## 2. Exact Design System

Define these CSS custom properties on `:root` and reference them by role
throughout — never hard-code hex in the body except where noted.

```css
--bg:#050506; --fg:#ededf0; --brand:#6EE7B7;
--muted:#84848c; --muted-strong:#a8a8b0; --border:#1d1d22;
--neg:#ff8b8b;
/* pastel allocation palette (donut + activity bars) — validated for
   colorblind separation, chroma, and 3:1 contrast on the #050506 surface */
--cat-bank:#7CC7F8; --cat-stocks:#C4B5FD; --cat-crypto:#46E0A8; --cat-other:#A78BFA; --cat-subs:#F98C8C;
--mono:ui-monospace,SFMono-Regular,Menlo,monospace;
--serif:Georgia,'Times New Roman',serif;
--font:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;
```

Type & feel:
- **Header** `<h1>Finance</h1>` — `font-family:var(--serif); font-style:italic;
  font-weight:400; font-size:34px; letter-spacing:.01em`. Under it a `.sub`:
  mono, 11px, `.12em` letter-spacing, uppercase, muted — text
  `Net worth · Subs · Orders · Wishlist`.
- **Hero numbers** (net-worth total, monthly burn, wishlist total) — italic serif
  (`var(--serif)`), NOT mono. Match the dashboard's other tiles (fuel/train use
  italic Georgia for display figures). The big total: `clamp(38px,8vw,58px)`,
  white, with `text-shadow:0 0 44px rgba(110,231,183,.22)`.
- **All money figures, labels, ticks** — mono, `font-variant-numeric:tabular-nums`.
- **Subtle mint glow on every money figure.** Amounts are bold and bright
  (`var(--fg)`, weight 600–700) with `text-shadow:0 0 12px rgba(110,231,183,.4)`
  (~.35–.45 alpha — must be visible, not a 16% whisper). Activity gains glow mint
  `rgba(110,231,183,.6)`; losses glow red `rgba(255,139,139,.55)`. The donut
  center total glows; legend percentages are bold white.
- **Body scaffolding**: `display:flex; justify-content:center;
  padding:40px 20px calc(150px + env(safe-area-inset-bottom))`. The 150px bottom
  clearance keeps the last content clear of the floating tab bar.
- **`body` must be `min-height:100%`, NOT `height:100%`.** With a fixed height,
  the bottom padding sits at the viewport edge and overflowing content runs past
  it (the last rows hide under the tab bar). `min-height` lets the body grow with
  content so the clearance lands below the final row.
- **Hide the native scrollbar** but keep scrolling fully functional:
  `html,body{scrollbar-width:none;-ms-overflow-style:none}` and
  `html::-webkit-scrollbar,body::-webkit-scrollbar{display:none;width:0;height:0}`.
- Ambient background: a fixed radial mint glow at the top + a faint starfield
  (`body::before`), and a soft bottom vignette (`body::after`), both `pointer-events:none`.
- A `.starterTag` pill at the very top: `✦ starter — the value is what you build ·
  the videos show how` (mono, uppercase, mint-bordered 999px pill).
- No emojis anywhere in the UI. Arrows/glyphs only (↗, ×, ↻, ↻, ◆, +, −, ✎).

---

## 3. The Bottom Tab Bar (floating glass capsule)

Fixed to the tile's own viewport so it never shifts when a taller/shorter tab
swaps in above it. Translucent + blurred so scrolling content reads *through* it
— never an opaque black box.

```css
.tabBar{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));
  transform:translateX(-50%);z-index:20;display:flex;gap:2px;
  width:calc(100% - 40px);max-width:540px;padding:6px;border-radius:999px;
  background:rgba(11,15,13,.55);
  backdrop-filter:blur(24px) saturate(1.7);-webkit-backdrop-filter:blur(24px) saturate(1.7);
  border:1px solid rgba(110,231,183,.22);
  box-shadow:0 14px 40px -10px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.05),0 0 26px -8px rgba(110,231,183,.16)}
.tab{flex:1;padding:10px 4px;border-radius:999px;border:none;background:transparent;
  color:var(--muted-strong);font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;
  transition:color .18s,background .18s;white-space:nowrap}
.tab:hover{color:#fff}
.tab.on{color:#04140d;background:var(--brand);box-shadow:0 2px 14px -3px rgba(110,231,183,.55)}
```

Tabs, in order: `[['networth','Net worth'],['stocks','Stocks'],['subs','Subs'],
['orders','Orders'],['wish','Wishlist']]`. Switching a tab clears any inline
edit/add state and the chart hover, then re-renders.

---

## 4. Data Model (the single store object)

```
{
  accounts:  [{id,name,balance,type}]                 // type: 'bank'|'crypto'|'other'
  holdings:  [{id,symbol,shares,price}]               // Stocks tab (price via bridge)
  subs:      [{id,name,amount,period,renewal,fromAccountId,autoDeduct}]
  orders:    [{id,name,amount,fromAccountId,date,ts,deductedAt,pctAtDeduction,deductedFromName}]
  wishlist:  [{id,name,amount,ts}]
  history:   [{t,value}]                              // net-worth over time (the chart)
  activity:  [{id,ts,name,type,delta,kind}]           // kind: 'add'|'edit'|'delete'
}
```

Rules:
- IDs: short random, prefixed per kind (`a…`,`h…`,`s…`,`o…`,`w…`,`act…`).
- `save()` persists the whole object after every mutation; `render()` re-draws.
- Getter helpers coerce missing arrays to `[]` (e.g. `accts()`, `holds()`,
  `subs()`, `orders()`, `wishlist()`, `hist()`, `activity()`).

Core math (exact):
```js
function fmtMoney(n){if(n==null)return '—';const sign=n<0?'−':'';const a=Math.abs(n);
  return sign+'$'+(a>=1e6?(a/1e6).toFixed(2)+'M':a>=1e4?Math.round(a).toLocaleString():a.toLocaleString(undefined,{maximumFractionDigits:2}));}
function acctTotal(type){return accts().filter(a=>a.type===type).reduce((s,a)=>s+(+a.balance||0),0);}
function holdValue(h){return (+h.shares||0)*(+h.price||0);}
function stockTotal(){return holds().reduce((s,h)=>s+holdValue(h),0);}
function netWorth(){return acctTotal('bank')+acctTotal('crypto')+acctTotal('other')+stockTotal();}
function monthlyEquivalent(s){const a=+s.amount||0;if(s.period==='yearly')return a/12;if(s.period==='weekly')return a*4.345;return a;}
function monthlyBurn(){return subs().reduce((s,x)=>s+monthlyEquivalent(x),0);}
function pctClass(pct){if(pct<5)return '';if(pct<25)return 'warn';return 'bad';}  // % of net worth → color band
```

`snapshot()` — the net-worth history writer, called after any change to balances/
stocks/orders. **CRITICAL: no throttle.** Every distinct change gets its own point
so the chart actually grows; do NOT collapse rapid edits into one point:
```js
function snapshot(){const v=netWorth(),h=hist(),now=Date.now(),prev=h[h.length-1];
  if(prev&&Math.abs(prev.value-v)<0.005)return;      // skip only true no-ops
  h.push({t:now,value:v});
  if(h.length>500)store.history=h.slice(h.length-500);}
```

`pushActivity({name,type,delta,kind})` — unshift a `{id,ts,...}` entry, cap at 50.

---

## 5. The Five Tabs

### 5a. Net worth
Top-left: kicker `✦ total net worth`, then the big italic-serif total (red when
negative) and a 24h delta line (mint up / red down, computed from `history`
across the last 86.4M ms). Then, in order:
- **Import trigger** "Import from screenshot" (see §6).
- **Overview grid** (`1.5fr 1fr`, stacks to 1 col under 560px): a net-worth
  **line chart** + a **donut**.
- **Category cards** grid (Bank accounts / Crypto / Other assets) each showing
  its total + % of net worth, inline-editable rows (tap name to rename, tap
  amount to edit), a delete ×, and a "+ add" quick-add row.
- **Recent activity** feed — grouped Today / Yesterday / Earlier this week /
  Earlier; each row a colored rounded bar (the type's `--cat-*` color, with a
  `box-shadow:0 0 9px <color>` glow), name, `type · kind` meta, a glowing signed
  amount, and a relative date.

**Line chart** (`W=560, H=120, PAD=6`, `preserveAspectRatio:none`):
- Period selector `1D / 1W / 1M / 1Y / All` (`days: 1,7,30,365,null`), default
  `ALL`. Windowing: filter history to the window; if fewer than 2 points fall in
  it, anchor with the last point before the window so the line still draws.
- Smooth Catmull-Rom-style cubic path (`smoothPath`), a `currentColor` stroke
  (`stroke-width:2`), an area fill under it (`url(#nwGrad)` vertical gradient),
  three faint horizontal gridlines. Color: mint when up, red when down, muted flat.
- **Hover crosshair + tooltip**: `pointermove` on the SVG snaps to the nearest
  point (store the projected points on `window.__nwPts`), draws a vertical
  crosshair + a dot, and shows an absolute-positioned tooltip with the value
  (bold) and the point's date. `pointerleave` clears it.
- Stats row under the chart: `1% of NW`, `All-time high`, `All-time low`, `Snapshots`.

**Donut** (`donutArcPath(70,70,60,44,a1,a2)`, 140×140 viewBox, outer r60 inner r44):
- Slices, in this exact order so the two purples never touch:
  **`['bank','other','crypto']`** account totals, then **Stocks**, then
  **Subs/yr** (annualized monthly burn). Each slice uses its `--cat-*` color.
  A `0.015` rad gap between slices when there's more than one.
- Center shows the net-worth total (glowing); a legend lists each slice with a
  color dot, name, and bold-white percentage. Empty state: a hollow ring +
  "add an account to see the breakdown".

### 5b. Stocks
Holdings list (ticker, shares, live price via `window.Vitality.stock(symbol)`,
computed value). "+ Add stock" (ticker + shares). On add/edit-shares, re-fetch
the price and `snapshot()`. If the bridge rejects `no_key`, set a flag and show a
one-line note: stocks need a free Finnhub key in `.env.local`; until then they
hold at $0. Manual entries (no ticker) hold their value directly. Hero shows the
holdings total; sub-line the count of positions.

### 5c. Subs (richer than a flat monthly amount)
Each subscription: **name, amount, billing period (monthly/yearly/weekly),
renewal date, a linked "from account", and an auto-deduct toggle.** Add-form is a
6-field grid + an auto-deduct checkbox. Row shows the monthly-equivalent cost
(`monthlyEquivalent`) as the big figure with `/ month`, the raw billed amount if
non-monthly, a renewal countdown (`↻ renews in Nd · <date>`; `urgent` styling
when ≤5 days), the from-account pill, and the auto-deduct toggle. Edit (✎) opens
an inline editor; delete (×). Hero: **Monthly burn** = `monthlyBurn()` with
`/ mo` and `~<annual> per year`. `nextRenewalDate(iso,period)` advances the
renewal forward by the period until it's in the future. The auto-deduct toggle is
an informational flag (it does not itself execute a deduction on the date).
Import trigger: "Import subscriptions".

### 5d. Orders
Two modes via a segmented control: **Incoming** (item, cost, from-account,
expected arrival date) and **Bought today** (item, cost, from-account required —
deducts immediately). Live **preview line** shows the cost as a % of net worth,
colored by `pctClass`, plus which account it debits. Each order card: name,
amount, from-account pill, `X% of NW` pill (colored band), an arrival countdown
pill (`arrivalLabel`: today / tomorrow / in Nd / Nd late), and a footer button
**"− Deduct from net worth"** (subtracts from the linked account, freezes the %
at deduction time, logs activity) with an **Undo**. Import trigger: "Import receipt".

### 5e. Wishlist
Item + cost. Hero: wishlist total and **% of net worth** (colored band + progress
bar). Each row: name, added-date, amount, its own `% of NW` with a mini progress
bar. Sorted by cost descending.

---

## 6. AI Screenshot Import (statement / subs / receipt)

A button at the top of Net worth ("Import from screenshot"), Subs ("Import
subscriptions"), and Orders ("Import receipt") opens a modal that reads a
screenshot and files the data in — using the host `ai` bridge so **the Anthropic
key never enters the tile.**

Pipeline (cheapest-possible OCR):
1. **Downscale** the dropped/chosen image to **1024px long edge**, re-encode
   **JPEG q0.8** via a canvas, take the base64.
2. **Call** `window.Vitality.ai(body)` with:
   - `model:'claude-haiku-4-5'` (vision-capable, cheapest — never Sonnet/Opus for OCR)
   - `max_tokens:500`, `temperature:0`
   - `system` = a fixed OCR-extractor prompt in a `cache_control:{type:'ephemeral'}` block
   - `tools:[EXTRACT_TOOL]`, `tool_choice:{type:'tool',name:'extract'}` (forces structured output)
   - one user message: an `image` block (base64 JPEG) + a per-kind hint text block
3. **EXTRACT_TOOL** schema — `items[]` of `{t,n,a,p?}`:
   - `t`: `"bank"|"stocks"|"crypto"|"other"` (statement lines) · `"sub"` · `"order"`
   - `n`: short name (no amounts) · `a`: numeric amount (no separators/symbols)
   - `p`: `"monthly"|"yearly"|"weekly"` (subs only, optional)
   - `required:['t','n','a']`, `additionalProperties:false`.
4. **Parse** the `tool_use` block named `extract`; retry once on a malformed/empty
   result; do NOT retry on an auth error.
5. **Apply** items → the right store slice: statement `bank`→bank / `crypto`→crypto
   / everything else→other (log activity + `snapshot()`); `sub`→subs (period from
   `p`, default monthly); `order`→orders. Skip items with an empty name or a
   non-finite amount. Switch to the relevant tab, `persist()`, `render()`.

**Key setup, in-tile:** on open, call `window.Vitality.aiStatus()`. If it returns
`null` (no key anywhere), show a one-time setup panel: explain the AI import uses
the user's own Anthropic key, it stays in the browser and goes straight to
Anthropic through their own site, everything else works offline; a password input
saves via `window.Vitality.aiKey(key)`. If `ai` rejects `no_key` mid-run, flip to
that same key panel. When a `'local'` key exists, offer a "Forget my key" action.
Modal states: drop zone → busy (pulsing dots, "Claude is reading your screenshot…")
→ result (`+N accounts/subscriptions/orders added`) or an error line.

**Host side (already wired in this repo — build to match, don't re-invent):**
`window.Vitality.ai/aiKey/aiStatus` post to the host (`lib/tiles/tileBridge.ts`),
which routes `ai` through `POST /api/mentor` (`app/api/mentor/route.ts`). That
route uses `process.env.ANTHROPIC_API_KEY` if set, else the `x-user-key` header
(the key the host holds in *its* `localStorage` under `vitality:anthropic:key` —
never in the tile store, never synced to Supabase, never committed). The `ai`
bridge call uses a 120s timeout (vision is slower than data ops).

---

## 7. Invariants & Gotchas (the things that break accuracy)

- **Chart must grow, never plateau** — no snapshot throttle (§4). Rapid successive
  edits each produce their own rising point.
- **Tab bar must not cover content** — `body{min-height:100%}` + 150px bottom
  padding (§2). Verify you can scroll every activity row clear of the capsule.
- **No native scrollbar** — hidden on `html` and `body`, scrolling still works.
- **Hero numbers are italic serif, not mono** — matches sibling tiles; mono is for
  labels/ticks/small figures only.
- **Donut slice order is `bank, other, crypto, stocks, subs`** — keeps adjacent
  colors distinguishable; don't reorder.
- **Never hold the Anthropic or Finnhub key in the tile** — always go through the
  bridge. The tile is sealed and sandboxed; a key inline would ship in a public file.
- **Parse tool/JSON output, never string-match it.**
- **Escape all user text** (`esc()`) before putting it in `innerHTML`.

---

## 8. Accuracy Checklist (do all of these before declaring it done)

1. **Syntax**: extract the `<script>` body and run `node --check` on it — zero errors.
2. **Types**: `npx tsc --noEmit` on the repo stays clean (the tile is plain JS, but
   the bridge/route are TS).
3. **Headless logic test**: stub `document`, `window`, and `window.Vitality`
   (`save`/`load`/`stock`/`ai`/`aiKey`/`aiStatus`); with sample data, assert every
   view function returns HTML without throwing, and drive each mutation
   (add account/stock/sub/order/wish, deduct+undo, delete) and each import kind
   (statement/subs/receipt, plus the no-key and malformed-response paths).
4. **Growth regression**: add a value, then edit it twice in quick succession →
   `history` gains 3 rising points, not 1.
5. **Serve & eyeball**: run `npm run dev -- -p 3001`; open the tile inside the
   dashboard; click all five tabs; confirm the serif header, glass tab bar,
   pastel donut, glowing figures, hidden scrollbar, and that the last activity
   row clears the tab bar. Confirm "Import from screenshot" opens and (with a key)
   reads a real statement.
6. **Mirror**: copy the finished `public/tiles/finance.html` verbatim to
   `tiles-library/finance.html` (diff must be empty).

---

## 9. One-line summary of intent

A sealed, dark, mint-accented personal-finance tile — Net worth (growing chart +
allocation donut + category cards + activity), Stocks (Finnhub-priced), richer
Subs (period/renewal/auto-deduct), Orders (% of net worth, deduct/undo), and
Wishlist — with an AI screenshot importer that files bank statements, billing
pages, and receipts in for you, all persisted through the host bridge and with no
API key ever living inside the tile.
