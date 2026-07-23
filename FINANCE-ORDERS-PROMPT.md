# Prompt — Build & wire the "Orders" tab into the Finance tile

Deploy this **directly into the real file** `public/tiles/finance.html` (the sealed
Vitality Finance tile) — do **not** prototype a separate HTML first. Add the code
below in place, wire every hook, then mirror the finished file verbatim to
`tiles-library/finance.html`. It must be fully perfect and wired in: the Orders
tab renders, incoming/bought modes switch, the live % preview updates as you type,
adding logs (and bought-today deducts), and deduct/undo move money against the
linked account and net worth.

Orders is one of five tabs (`Net worth · Stocks · Subs · Orders · Wishlist`)
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
  let orderMode='incoming'; const draftOrder={name:'',cost:'',from:'',arrival:''};`
- **Shared helpers** it calls (must already exist): `esc()`, `persist()`,
  `accts()`, `orders()`, `fmtMoney(n)`, `netWorth()`,
  `pushActivity({name,type,delta,kind})`, `render()`,
  `importTriggerHtml(kind,title,sub)`, and the % color band + snapshot:

```js
function pctClass(pct){if(pct<5)return '';if(pct<25)return 'warn';return 'bad'}   // % of net worth → color band
function orders(){if(!Array.isArray(store.orders))store.orders=[];return store.orders}
function snapshot(){/* net-worth history writer — no throttle; called after add/deduct/undo */}
```

Order record shape (the store slice this tab owns):
`orders: [{id,name,amount,fromAccountId,date,ts,deductedAt,pctAtDeduction,deductedFromName}]`
— `date` is the expected-arrival ISO for incoming orders (null for bought-today);
`deductedAt`/`pctAtDeduction`/`deductedFromName` fill in when money is taken out.

---

## 1. Add these functions (verbatim)

```js
function arrivalLabel(iso){
  if(!iso)return null;
  const isoSafe=/^\d{4}-\d{2}-\d{2}$/.test(iso)?iso+'T00:00':iso;
  const d=new Date(isoSafe);if(isNaN(d.getTime()))return null;
  const now=new Date();const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const dayStart=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const diff=Math.round((dayStart.getTime()-today.getTime())/86400000);
  const date=d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  if(diff<0)return {label:Math.abs(diff)+'d late · '+date,cls:'past'};
  if(diff===0)return {label:'arrives today · '+date,cls:'today'};
  if(diff===1)return {label:'arrives tomorrow · '+date,cls:'imminent'};
  if(diff<=5)return {label:'in '+diff+'d · '+date,cls:'imminent'};
  return {label:'in '+diff+'d · '+date,cls:''};
}
function orderPreviewText(nw){
  const d=draftOrder,isBought=orderMode==='bought';
  const a=parseFloat(d.cost);
  if(isNaN(a)||a<=0)return {text:isBought?'Type a cost. We will deduct it from the chosen account on Add.':'Type a cost. Preview will show what % of net worth it takes.',cls:''};
  const fromName=d.from?((accts().find(x=>x.id===d.from)||{}).name||'unassigned'):'unassigned';
  if(isBought&&!d.from)return {text:fmtMoney(a)+' · pick a "from account" to deduct from',cls:'warn'};
  if(nw>0){
    const pct=(a/nw)*100,cls=pctClass(pct);
    const text=isBought?'Will debit '+fromName+': '+fmtMoney(a)+' · '+pct.toFixed(2)+'% of your '+fmtMoney(nw)+' net worth'
      :fmtMoney(a)+' from '+fromName+' · '+pct.toFixed(2)+'% of your '+fmtMoney(nw)+' net worth';
    return {text,cls:cls==='good'?'':cls};
  }
  return {text:fmtMoney(a)+' from '+fromName+' · add net worth first to see %',cls:''};
}
function orderCardHtml(o,nw){
  const fromName=o.fromAccountId?((accts().find(a=>a.id===o.fromAccountId)||{}).name||'unassigned'):'unassigned';
  const isDeducted=!!o.deductedAt,arr=arrivalLabel(o.date);
  let pctText,pctCls;
  if(isDeducted&&typeof o.pctAtDeduction==='number'){pctText=o.pctAtDeduction.toFixed(2)+'% of NW';pctCls=pctClass(o.pctAtDeduction);}
  else if(nw>0){const pct=(o.amount/nw)*100;pctText=pct.toFixed(2)+'% of NW';pctCls=pctClass(pct);}
  else{pctText='- of NW';pctCls='';}
  let datePill;
  if(isDeducted)datePill='<span class="ordPill">bought '+new Date(o.deductedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})+'</span>';
  else if(arr)datePill='<span class="ordPill '+(arr.cls||'')+'">'+esc(arr.label)+'</span>';
  else datePill='<span class="ordPill">no arrival date</span>';
  const foot=isDeducted
    ?'<span class="ordDeductedPill">Deducted from '+esc(o.deductedFromName||fromName)+'</span><button type="button" class="ordDeductBtn" data-act="undoDeduct" data-id="'+o.id+'">Undo</button>'
    :'<button type="button" class="ordDeductBtn" data-act="deduct" data-id="'+o.id+'">− Deduct from net worth</button>';
  return '<div class="ordCard '+(isDeducted?'deducted':'')+'"><div class="ordHead"><div class="ordName">'+esc(o.name)+'</div><div class="ordAmt">'+esc(fmtMoney(o.amount))+'</div><button type="button" class="iconBtn" data-act="delOrder" data-id="'+o.id+'" title="Remove">×</button></div>'
    +'<div class="ordMetaRow"><span class="ordPill">from · '+esc(fromName)+'</span><span class="ordPill '+pctCls+'">'+pctText+'</span>'+datePill+'</div>'
    +'<div class="ordFoot">'+foot+'</div></div>';
}
function ordersViewHtml(){
  const nw=netWorth();
  const d=draftOrder,isBought=orderMode==='bought',needsAcc=isBought&&!d.from;
  const prev=orderPreviewText(nw);
  const addForm='<div class="addCard"><div class="addCardHead"><div class="addEyebrow">'+(isBought?'+ today’s purchase':'+ new order')+'</div>'
    +'<div class="modeSeg"><button type="button" class="modeBtn '+(!isBought?'modeBtnActive':'')+'" data-act="orderMode" data-mode="incoming">Incoming</button><button type="button" class="modeBtn '+(isBought?'modeBtnActive':'')+'" data-act="orderMode" data-mode="bought">Bought today</button></div></div>'
    +'<div class="addGrid'+(isBought?' bought':'')+'">'
    +'<input class="quickAddInput" type="text" placeholder="'+(isBought?'What did you buy?':'Item (e.g. New iPhone)')+'" value="'+esc(d.name)+'" data-draft="order.name" data-enter="addOrder" />'
    +'<input class="quickAddInput" type="number" step="0.01" placeholder="Cost ($)" value="'+esc(d.cost)+'" data-draft="order.cost" data-enter="addOrder" />'
    +'<select class="quickAddInput'+(needsAcc?' quickAddInputAlert':'')+'" data-draft="order.from"><option value="">'+(isBought?'From account (required)…':'From account…')+'</option>'+accts().map(a=>'<option value="'+a.id+'"'+(a.id===d.from?' selected':'')+'>'+esc(a.name)+'</option>').join('')+'</select>'
    +(!isBought?'<input class="quickAddInput" type="date" title="Expected arrival" value="'+esc(d.arrival)+'" data-draft="order.arrival" />':'')
    +'<button type="button" class="quickAddBtn" data-act="addOrderGo"'+(needsAcc?' disabled':'')+'>'+(isBought?'− Log':'+ Add')+'</button></div>'
    +'<div class="addPreview '+(prev.cls||'')+'">'+esc(prev.text)+'</div></div>';
  const sorted=orders().slice().sort((a,b)=>{if(!a.date)return 1;if(!b.date)return -1;return a.date.localeCompare(b.date)});
  let list;
  if(!orders().length)list='<div class="emptyState"><div class="emptyTitle">Nothing on the way.</div><div class="emptyBody">Log an order above. Pick the account it comes out of and the expected arrival date — the dashboard shows what % of your net worth it costs.</div></div>';
  else list=sorted.map(o=>orderCardHtml(o,nw)).join('');
  return '<section class="section"><div class="sectionEyebrow"><span>Incoming orders</span><span class="sectionCount">'+orders().length+' '+(orders().length===1?'item':'items')+'</span></div>'
    +importTriggerHtml('receipt','Import receipt','snap a receipt, auto-log the purchase')
    +addForm+'<div>'+list+'</div></section>';
}
function addOrder(){
  const d=draftOrder;const name=(d.name||'').trim();if(!name)return;
  const raw=String(d.cost||'').replace(/[$,\s]/g,'');const amount=Number(raw);if(!(raw!==''&&isFinite(amount)))return;
  const isBought=orderMode==='bought';
  if(isBought&&!d.from)return;
  let deductedAt=null,pctAtDeduction=null,deductedFromName=null;
  if(isBought&&d.from){
    const acc=accts().find(a=>a.id===d.from);
    if(acc){const nw=netWorth();pctAtDeduction=nw>0?(amount/nw)*100:0;deductedAt=Date.now();deductedFromName=acc.name;const delta=-amount;acc.balance=(acc.balance||0)-amount;pushActivity({name:acc.name,type:acc.type,delta,kind:'edit'});}
  }
  orders().push({id:'o'+Math.random().toString(36).slice(2,8),name,amount,fromAccountId:d.from||null,date:isBought?null:(d.arrival||null),ts:Date.now(),deductedAt,pctAtDeduction,deductedFromName});
  draftOrder.name='';draftOrder.cost='';draftOrder.from='';draftOrder.arrival='';
  snapshot();persist();render();
}
```

---

## 2. Add these CSS rules (verbatim, inside the tile's `<style>`)

```css
.addCard{border:1px solid var(--border);border-radius:16px;background:rgba(14,14,17,.5);padding:14px;margin-bottom:16px}
.addEyebrow{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
.addGrid{display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:8px;align-items:center}
.addGrid.bought{grid-template-columns:1.4fr 1fr 1.2fr auto}
@media (max-width:560px){.addGrid,.addGrid.bought{grid-template-columns:1fr}}
.emptyState{padding:22px 4px;text-align:center}
.emptyTitle{font-size:13.5px;color:var(--fg);margin-bottom:4px}
.emptyBody{font-size:12px;color:var(--muted);max-width:360px;margin:0 auto}
.sectionCount{color:var(--muted);font-weight:400}
.sectionEyebrow{display:flex;justify-content:space-between;align-items:baseline}
.iconBtn{border:1px solid var(--border);background:transparent;color:var(--muted);border-radius:7px;padding:5px 8px;font-size:11px;cursor:pointer}
.iconBtn:hover{color:var(--fg);border-color:var(--muted)}
.modeSeg{display:flex;gap:4px}
.modeBtn{background:transparent;border:1px solid var(--border);color:var(--muted);font:inherit;font-size:11px;padding:5px 10px;border-radius:8px;cursor:pointer}
.modeBtnActive{background:var(--brand);color:#04140d;border-color:var(--brand)}
.addCardHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.addPreview{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:9px}
.addPreview.warn{color:#e8c878}
.quickAddInputAlert{border-color:#e8c878}
.ordCard{border:1px solid var(--border);border-radius:12px;background:rgba(14,14,17,.5);padding:13px;margin-bottom:8px}
.ordCard.deducted{opacity:.6}
.ordHead{display:flex;align-items:center;gap:8px}
.ordName{flex:1;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ordAmt{font-family:var(--mono);font-size:14px;text-shadow:0 0 10px rgba(110,231,183,.35)}
.ordMetaRow{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.ordPill{font-family:var(--mono);font-size:9px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:2px 8px}
.ordPill.good{color:var(--brand);border-color:rgba(110,231,183,.35)}
.ordPill.warn{color:#e8c878;border-color:rgba(232,200,120,.35)}
.ordPill.bad{color:var(--neg);border-color:rgba(255,139,139,.35)}
.ordPill.today,.ordPill.imminent{color:#e8c878;border-color:rgba(232,200,120,.35)}
.ordPill.past{color:var(--neg);border-color:rgba(255,139,139,.35)}
.ordFoot{margin-top:9px;display:flex;justify-content:space-between;align-items:center}
.ordDeductedPill{font-family:var(--mono);font-size:9.5px;color:var(--muted)}
.ordDeductBtn{background:transparent;border:1px solid var(--border);color:var(--muted-strong);font:inherit;font-size:11px;padding:6px 10px;border-radius:8px;cursor:pointer}
.ordDeductBtn:hover{color:var(--brand);border-color:var(--brand)}
```

(Also relies on the shared `.section`, `.sectionEyebrow`, `.quickAddInput`,
`.quickAddBtn`, and `.importTrigger*` rules already in the tile.)

---

## 3. Wire it in (do all — this is the "everything")

**a. Route in `render()`** — the `orders` branch calls `ordersViewHtml()`:

```js
else if(view==='orders')html=ordersViewHtml();
```

**b. Delegated `click` branches** (inside the single `document.addEventListener('click', …)`):

```js
const orderMd=e.target.closest('[data-act="orderMode"]');
if(orderMd){orderMode=orderMd.getAttribute('data-mode');render();return}
if(e.target.closest('[data-act="addOrderGo"]')){addOrder();return}
const delOrder=e.target.closest('[data-act="delOrder"]');
if(delOrder){store.orders=orders().filter(x=>x.id!==delOrder.getAttribute('data-id'));persist();render();return}
const deduct=e.target.closest('[data-act="deduct"]');
if(deduct){const o=orders().find(x=>x.id===deduct.getAttribute('data-id'));if(o&&!o.deductedAt){const nw=netWorth();const pct=nw>0?(o.amount/nw)*100:0;const acc=o.fromAccountId?accts().find(a=>a.id===o.fromAccountId):null;if(acc){acc.balance=(acc.balance||0)-o.amount;pushActivity({name:acc.name,type:acc.type,delta:-o.amount,kind:'edit'});}o.deductedAt=Date.now();o.pctAtDeduction=pct;o.deductedFromName=acc?acc.name:null;snapshot();persist();render();}return}
const undo=e.target.closest('[data-act="undoDeduct"]');
if(undo){const o=orders().find(x=>x.id===undo.getAttribute('data-id'));if(o&&o.deductedAt){const acc=o.fromAccountId?accts().find(a=>a.id===o.fromAccountId):null;if(acc){acc.balance=(acc.balance||0)+o.amount;pushActivity({name:acc.name,type:acc.type,delta:o.amount,kind:'edit'});}o.deductedAt=null;o.pctAtDeduction=null;o.deductedFromName=null;snapshot();persist();render();}return}
```

**c. Delegated `input` handler** — `data-draft` values `order.name`/`order.cost`/
`order.from`/`order.arrival` map into `draftOrder`. Add `order:draftOrder` to the
`stores` map inside the shared input listener:

```js
document.addEventListener('input',e=>{
  const t=e.target;const key=t.getAttribute('data-draft');if(!key)return;
  const [group,field]=key.split('.');
  const val=t.type==='checkbox'?t.checked:t.value;
  const stores={/* bank,crypto,other,subAdd,subEdit, */ order:draftOrder /* , wish */};
  const g=stores[group];if(!g)return;
  const map={cost:'cost',arrival:'arrival',name:'name',from:'from'/* , … */};
  g[map[field]||field]=val;
});
```

**d. Delegated `keydown` (Enter)** — the item/cost inputs carry `data-enter="addOrder"`:

```js
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter')return;
  const t=e.target;if(!t.hasAttribute||!t.hasAttribute('data-enter'))return;
  const act=t.getAttribute('data-enter');
  if(act==='addSub')addSub();else if(act==='addOrder')addOrder();else if(act==='addWish')addWish();
});
```

**e. Tab-switch reset** — the shared `[data-view]` branch clears edit/add state on
switch (includes Orders): `view=…;orderMode` stays as last set; `render()`.

---

## 4. Behavior invariants (keep it laser-accurate)

- **Two modes.** `Incoming` = item + cost + from-account (optional) + expected
  arrival date; the "+ Add" button. `Bought today` = item + cost + from-account
  **required** (the button reads "− Log" and is disabled until an account is
  picked); on add it **immediately deducts** the cost from that account and logs
  an `edit` activity with a negative delta.
- **Live preview** line under the form: `orderPreviewText(nw)` shows the cost as a
  `pctClass`-colored % of net worth and which account it debits; a bought-today
  order with no account shows the `warn` prompt to pick one.
- **Deduct / Undo** on an incoming card: Deduct subtracts the cost from the linked
  account, **freezes** `pctAtDeduction` at that moment, records `deductedFromName`,
  and dims the card (`.deducted`); Undo reverses all of it. Both call `snapshot()`
  so the net-worth chart reflects the change.
- **Sort**: orders with a `date` first (ascending by ISO string), undated last.
- **Arrival pill** colors: today/imminent → gold, past (late) → red.
- `% of NW` band thresholds: `<5%` neutral, `<25%` warn (gold), else bad (red).
- Escape every user string with `esc()`.

---

## 5. Accuracy checklist (run before done)

1. Extract the `<script>` body → `node --check` passes.
2. Headless: stub `document`/`window`/`window.Vitality`; with a couple of accounts
   in the store, assert `ordersViewHtml()` renders in both modes
   (`orderMode='incoming'` and `'bought'`), `orderCardHtml(o,nw)` renders for a
   pending and a deducted order, and `orderPreviewText(nw)` returns the right band.
3. **Mutation tests**: `addOrder()` incoming pushes a pending order; `addOrder()`
   bought-today with a `from` account drops that account's balance by the cost;
   the `deduct` handler subtracts and freezes the %, `undoDeduct` restores both.
4. Serve `npm run dev -- -p 3001`, open the tile → Orders: switch Incoming/Bought,
   watch the preview % update as you type, add an incoming order, Deduct it (the
   linked account + net worth drop, card dims), Undo it (restored), and confirm
   "Import receipt" opens.
5. Copy `public/tiles/finance.html` → `tiles-library/finance.html` (empty diff).
