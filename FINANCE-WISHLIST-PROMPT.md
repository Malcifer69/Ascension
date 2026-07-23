# Prompt — Build & wire the "Wishlist" tab into the Finance tile

Deploy this **directly into the real file** `public/tiles/finance.html` (the sealed
Vitality Finance tile) — do **not** prototype a separate HTML first. Add the code
below in place, wire every hook, then mirror the finished file verbatim to
`tiles-library/finance.html`. It must be fully perfect and wired in: the Wishlist
tab renders, adding an item works, the hero shows the wishlist total and its % of
net worth with a progress bar, and every row shows its own % of net worth.

Wishlist is one of five tabs (`Net worth · Stocks · Subs · Orders · Wishlist`)
sharing one store, one `render()`, and one delegated event system. Match all of it.

---

## 0. Shared foundation this tab plugs into (must exist in the file)

- **Sealed-tile contract**: one self-contained HTML file, all CSS/JS inline, no
  network, no `localStorage` inside the tile. Persist via the injected
  `window.Vitality` bridge (`save`/`load`).
- **Design tokens** on `:root` (same as the rest of the tile): `--bg:#050506;
  --fg:#ededf0; --brand:#6EE7B7; --muted:#84848c; --muted-strong:#a8a8b0;
  --border:#1d1d22; --neg:#ff8b8b;` plus the `--cat-*` palette, `--mono`,
  `--serif`, `--font`.
- **State vars** (top of `<script>`): `let store={}; let view='networth';
  const draftWish={name:'',amount:''};`
- **Shared helpers** it calls (must already exist): `esc()`, `persist()`,
  `fmtMoney(n)`, `netWorth()`, `fmtActDate(ts)`, `render()`, and the % color band:

```js
function pctClass(pct){if(pct<5)return '';if(pct<25)return 'warn';return 'bad'}   // % of net worth → color band
function wishlist(){if(!Array.isArray(store.wishlist))store.wishlist=[];return store.wishlist}
```

Wishlist record shape (the store slice this tab owns): `wishlist: [{id,name,amount,ts}]`.
Note: Wishlist does **not** call `snapshot()` — wishes are aspirational and don't
change net worth, so adding/removing one only `persist()`s + `render()`s.

---

## 1. Add these functions (verbatim)

```js
function wishViewHtml(){
  const nw=netWorth();
  const total=wishlist().reduce((s,w)=>s+w.amount,0);
  const heroPct=nw>0?(total/nw)*100:null;
  const heroCls=heroPct==null?'':pctClass(heroPct);
  const heroFill=heroPct==null?0:Math.min(100,heroPct);
  const d=draftWish;
  const addForm='<div class="addCard"><div class="addEyebrow">+ add to wishlist</div><div class="addRow wide">'
    +'<input class="quickAddInput" type="text" placeholder="Item name (e.g. New iPhone Pro Max)" value="'+esc(d.name)+'" data-draft="wish.name" data-enter="addWish" />'
    +'<input class="quickAddInput" type="number" step="0.01" placeholder="Cost ($)" value="'+esc(d.amount)+'" data-draft="wish.amount" data-enter="addWish" />'
    +'<button type="button" class="quickAddBtn" data-act="addWishGo">+ Add</button></div></div>';
  const sorted=wishlist().slice().sort((a,b)=>b.amount-a.amount);
  let list;
  if(!wishlist().length)list='<div class="emptyState"><div class="emptyTitle">No wishes yet.</div><div class="emptyBody">Add anything you\'re saving for — the dashboard calculates what % of your net worth it\'d cost.</div></div>';
  else list=sorted.map(item=>{
    const pct=nw>0?(item.amount/nw)*100:null;
    const cls=pct==null?'':pctClass(pct);
    const fill=pct==null?0:Math.min(100,pct);
    return '<div class="wishRow"><div class="wishRowH"><div><div class="wishRowName">'+esc(item.name)+'</div><div class="wishRowMeta">added '+fmtActDate(item.ts)+'</div></div>'
      +'<div class="wishRowAmtWrap"><div class="wishRowAmt">'+esc(fmtMoney(item.amount))+'</div><div class="wishRowPct '+cls+'">'+(pct==null?'-':pct.toFixed(2)+'%')+' of NW</div></div>'
      +'<button type="button" class="iconBtn" data-act="delWish" data-id="'+item.id+'" title="Remove" style="margin-left:8px">×</button></div>'
      +'<div class="wishRowBar"><div class="wishRowBarFill '+cls+'" style="width:'+fill+'%"></div></div></div>';
  }).join('');
  return '<section class="section"><div class="sectionEyebrow"><span>Wishlist</span><span class="sectionCount">'+wishlist().length+' '+(wishlist().length===1?'item':'items')+'</span></div>'
    +'<div class="addCard"><div class="wishHeroTop"><div><div class="nwHeroLabel">Wishlist total</div><div class="wishHeroNum">'+esc(fmtMoney(total))+'</div></div>'
    +'<div><div class="nwHeroLabel">% of net worth</div><div class="wishHeroPctNum '+heroCls+'">'+(heroPct==null?'-':heroPct.toFixed(2)+'%')+'</div></div></div>'
    +'<div class="wishHeroBar"><div class="wishHeroBarFill '+heroCls+'" style="width:'+heroFill+'%"></div></div>'
    +'<div class="wishHeroFoot">'+(heroPct==null?'add net worth first to see this as a %':'your wishlist is '+heroPct.toFixed(2)+'% of your '+fmtMoney(nw)+' net worth')+'</div></div>'
    +addForm+'<div>'+list+'</div></section>';
}
function addWish(){
  const d=draftWish;const name=(d.name||'').trim();if(!name)return;
  const raw=String(d.amount||'').replace(/[$,\s]/g,'');const amount=Number(raw);if(!(raw!==''&&isFinite(amount)))return;
  wishlist().push({id:'w'+Math.random().toString(36).slice(2,8),name,amount,ts:Date.now()});
  draftWish.name='';draftWish.amount='';
  persist();render();
}
```

---

## 2. Add these CSS rules (verbatim, inside the tile's `<style>`)

```css
/* the add form uses the shared .addCard / .addEyebrow / .quickAddInput / .quickAddBtn,
   plus a 2-field-wide row: */
.addRow.wide{grid-template-columns:1fr 1fr auto}   /* (if .addRow isn't already a grid, use: .addRow{display:grid;gap:8px} .addRow.wide{grid-template-columns:1fr 1fr auto}) */

.wishHero{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.nwHeroLabel{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.wishHeroNum{font-family:var(--serif);font-style:italic;font-size:34px;color:#fff;margin-top:4px;text-shadow:0 0 30px rgba(110,231,183,.22)}
.wishHeroTop{display:flex;justify-content:space-between;align-items:flex-start}
.wishHeroPctNum{font-family:var(--mono);font-size:20px;color:var(--muted-strong);margin-top:4px}
.wishHeroPctNum.warn{color:#e8c878}
.wishHeroPctNum.bad{color:var(--neg)}
.wishHeroBar{height:5px;border-radius:99px;background:var(--border);margin-top:12px;overflow:hidden}
.wishHeroBarFill{height:100%;background:var(--brand);border-radius:99px}
.wishHeroBarFill.warn{background:#e8c878}
.wishHeroBarFill.bad{background:var(--neg)}
.wishHeroFoot{font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:8px}
.wishRow{border:1px solid var(--border);border-radius:12px;background:rgba(14,14,17,.5);padding:12px 13px;margin-bottom:8px}
.wishRowH{display:flex;align-items:flex-start;gap:10px}
.wishRowName{font-size:13.5px}
.wishRowMeta{font-family:var(--mono);font-size:9.5px;color:var(--muted);margin-top:2px}
.wishRowAmtWrap{margin-left:auto;text-align:right}
.wishRowAmt{font-family:var(--mono);font-size:14px;text-shadow:0 0 10px rgba(110,231,183,.35)}
.wishRowPct{font-family:var(--mono);font-size:9.5px;color:var(--muted);margin-top:2px}
.wishRowPct.warn{color:#e8c878}
.wishRowPct.bad{color:var(--neg)}
.wishRowBar{height:3px;border-radius:99px;background:var(--border);margin-top:9px;overflow:hidden}
.wishRowBarFill{height:100%;background:var(--brand);border-radius:99px}
.wishRowBarFill.warn{background:#e8c878}
.wishRowBarFill.bad{background:var(--neg)}
```

(Also relies on the shared `.section`, `.sectionEyebrow`, `.sectionCount`,
`.addCard`, `.addEyebrow`, `.emptyState`/`.emptyTitle`/`.emptyBody`,
`.quickAddInput`, `.quickAddBtn`, and `.iconBtn` rules already in the tile.)

---

## 3. Wire it in (do all — this is the "everything")

**a. Route in `render()`** — Wishlist is the final `else` branch:

```js
function render(){
  let html='';
  if(view==='networth')html=netWorthViewHtml();
  else if(view==='stocks'){ /* ... */ }
  else if(view==='subs')html=subsViewHtml();
  else if(view==='orders')html=ordersViewHtml();
  else html=wishViewHtml();   // 'wish'
  html+=tabBar();
  document.getElementById('app').innerHTML=html;
  /* ...shared edit/chart bindings... */
}
```

The tab bar entry that reaches it: `['wish','Wishlist']` in the `tabBar()` list.

**b. Delegated `click` branches** (inside the single `document.addEventListener('click', …)`):

```js
if(e.target.closest('[data-act="addWishGo"]')){addWish();return}
const delWish=e.target.closest('[data-act="delWish"]');
if(delWish){store.wishlist=wishlist().filter(x=>x.id!==delWish.getAttribute('data-id'));persist();render();return}
```

**c. Delegated `input` handler** — `data-draft` values `wish.name`/`wish.amount`
map into `draftWish`. Add `wish:draftWish` to the shared `stores` map:

```js
document.addEventListener('input',e=>{
  const t=e.target;const key=t.getAttribute('data-draft');if(!key)return;
  const [group,field]=key.split('.');
  const val=t.type==='checkbox'?t.checked:t.value;
  const stores={/* bank,crypto,other,subAdd,subEdit,order, */ wish:draftWish};
  const g=stores[group];if(!g)return;
  const map={amount:'amount',name:'name'/* , … */};
  g[map[field]||field]=val;
});
```

**d. Delegated `keydown` (Enter)** — the name/cost inputs carry `data-enter="addWish"`:

```js
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter')return;
  const t=e.target;if(!t.hasAttribute||!t.hasAttribute('data-enter'))return;
  const act=t.getAttribute('data-enter');
  if(act==='addSub')addSub();else if(act==='addOrder')addOrder();else if(act==='addWish')addWish();
});
```

**e. Tab-switch reset** — the shared `[data-view]` branch clears edit/add state on
switch; Wishlist has no per-tab transient state beyond `draftWish`.

---

## 4. Behavior invariants (keep it laser-accurate)

- **Hero** shows the wishlist total (italic-serif, glowing) and its **% of net
  worth** (`total/nw*100`, two decimals) with a `pctClass`-colored progress bar
  filled to `min(100, pct)%`. When net worth is 0, the % reads `-` and the foot
  says "add net worth first to see this as a %".
- **Each row**: item name, "added <relative date>" (via shared `fmtActDate`), the
  cost (glowing mono), its own `% of NW` (colored band), and a thin progress bar
  to `min(100, pct)%`. A `×` removes it.
- **Sort** rows by cost **descending** (`b.amount - a.amount`).
- **No `snapshot()`** — a wish never moves net worth, so add/remove is
  `persist()` + `render()` only. (Contrast with Orders, which does snapshot.)
- `% of NW` band thresholds: `<5%` neutral, `<25%` warn (gold), else bad (red) —
  identical to Orders, from the shared `pctClass`.
- Escape every user string with `esc()`.

---

## 5. Accuracy checklist (run before done)

1. Extract the `<script>` body → `node --check` passes.
2. Headless: stub `document`/`window`/`window.Vitality`; assert `wishViewHtml()`
   renders on an empty store (empty state) and on a populated one (hero % + rows),
   and that `pctClass` bands color the hero/rows correctly across `<5 / <25 / ≥25`.
3. **Mutation tests**: `addWish()` with a name + cost pushes a `{id,name,amount,ts}`
   and clears the draft; the `delWish` handler removes by id; rows render sorted by
   cost descending; with `netWorth()===0` the hero % is `-` and no row bar overflows.
4. Serve `npm run dev -- -p 3001`, open the tile → Wishlist: add a few items, confirm
   the hero total + % + bar, per-row %s and bars, descending sort, delete, and the
   "% of NW" color bands. Verify net worth is unaffected by adding/removing wishes.
5. Copy `public/tiles/finance.html` → `tiles-library/finance.html` (empty diff).
