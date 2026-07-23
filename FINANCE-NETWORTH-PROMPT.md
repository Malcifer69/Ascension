# Prompt — Build & wire the "Net worth" tab into the Finance tile

Deploy this **directly into the real file** `public/tiles/finance.html` (the sealed
Vitality Finance tile) — do **not** prototype a separate HTML first. Add the code
below in place, wire every hook, then mirror the finished file verbatim to
`tiles-library/finance.html`. The result must be fully perfect and wired in: the
Net worth tab renders on load, the chart grows as balances change, hover works,
inline edits and the donut and activity feed all update live.

Net worth is one of five tabs (`Net worth · Stocks · Subs · Orders · Wishlist`)
sharing one store, one `render()`, and one delegated event system. Match all of it.

---

## 0. Shared foundation this tab plugs into (must exist in the file)

These are already the file's spine — reuse them exactly, don't fork them:

- **Sealed-tile contract**: one self-contained HTML file, all CSS/JS inline, no
  network, no `localStorage` inside the tile. Persist through the injected
  `window.Vitality` bridge (`save`/`load`; `stock` for prices). On load, call
  `window.Vitality.load()` and render what comes back.
- **Design tokens** on `:root`: `--bg:#050506; --fg:#ededf0; --brand:#6EE7B7;
  --muted:#84848c; --muted-strong:#a8a8b0; --border:#1d1d22; --neg:#ff8b8b;
  --cat-bank:#7CC7F8; --cat-stocks:#C4B5FD; --cat-crypto:#46E0A8;
  --cat-other:#A78BFA; --cat-subs:#F98C8C;
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  --serif:Georgia,'Times New Roman',serif;
  --font:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;`
- **State vars** (top of `<script>`): `let store={}; let view='networth';
  let editingId=null; let editKind='bal'; let hoverIdx=null;
  const draftAcc={bank:{name:'',amt:''},crypto:{name:'',amt:''},other:{name:'',amt:''}};
  let showAcc={bank:false,crypto:false,other:false}; let chartPeriod='ALL';`
- **Constants**: `const TYPE_LABELS={bank:'Bank accounts',crypto:'Crypto',other:'Other assets'};`
  `const TYPE_PH={bank:['Account name','Balance'],crypto:['Coin / wallet','Value'],other:['Asset name','Value']};`
  `const CAT_COLOR={bank:'var(--cat-bank)',crypto:'var(--cat-crypto)',other:'var(--cat-other)',stocks:'var(--cat-stocks)',subs:'var(--cat-subs)'};`
  `const PERIODS=[{key:'1D',label:'1D',days:1},{key:'1W',label:'1W',days:7},{key:'1M',label:'1M',days:30},{key:'1Y',label:'1Y',days:365},{key:'ALL',label:'All',days:null}];`
- **Shared helpers** it calls (must already exist): `esc()`, `persist()`,
  `accts()`, `stockTotal()`, `acctTotal(type)`, `monthlyBurn()`, `fmtMoney(n)`,
  `netWorth()`, `pushActivity({name,type,delta,kind})`, `render()`,
  `importTriggerHtml(kind,title,sub)`, and:

```js
function snapshot(){const v=netWorth(),h=hist(),now=Date.now(),prev=h[h.length-1];
  if(prev&&Math.abs(prev.value-v)<0.005)return;   // CRITICAL: no time throttle — every change is its own point so the chart GROWS
  h.push({t:now,value:v});
  if(h.length>500)store.history=h.slice(h.length-500);}
function hist(){if(!Array.isArray(store.history))store.history=[];return store.history}
function activity(){if(!Array.isArray(store.activity))store.activity=[];return store.activity}
```

---

## 1. Add these functions (verbatim)

```js
function windowedHistory(){
  const full=hist();const p=PERIODS.find(x=>x.key===chartPeriod)||PERIODS[PERIODS.length-1];
  if(p.days==null)return full;
  const cutoff=Date.now()-p.days*86400000;
  const inWin=full.filter(x=>x.t>=cutoff);
  if(inWin.length>=2||full.length===0)return inWin;
  let anchor=null;for(let i=full.length-1;i>=0;i--){if(full[i].t<cutoff){anchor=full[i];break}}
  return anchor?[anchor].concat(inWin):inWin;
}
function smoothPath(pts){
  if(pts.length<2)return '';
  if(pts.length===2)return 'M'+pts[0].x+','+pts[0].y+' L'+pts[1].x+','+pts[1].y;
  const d=['M'+pts[0].x+','+pts[0].y];
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
    const c1x=p1.x+(p2.x-p0.x)/6,c1y=p1.y+(p2.y-p0.y)/6,c2x=p2.x-(p3.x-p1.x)/6,c2y=p2.y-(p3.y-p1.y)/6;
    d.push('C'+c1x+','+c1y+' '+c2x+','+c2y+' '+p2.x+','+p2.y);
  }
  return d.join(' ');
}
function dailyDeltaHtml(){
  const h=hist();if(h.length<2)return '';
  const last=h[h.length-1],cutoff=last.t-86400000;
  let base=null;for(let i=h.length-1;i>=0;i--){if(h[i].t<=cutoff){base=h[i];break}}
  if(!base)base=h[0];
  if(last.t-base.t<3600000)return '';
  const delta=last.value-base.value;
  if(Math.abs(delta)<0.005)return '<div class="delta">flat · 24h</div>';
  const up=delta>0;
  return '<div class="delta"><b class="'+(up?'':'down')+'">'+(up?'▲ ':'▼ ')+esc(fmtMoney(Math.abs(delta)))+'</b> · 24h</div>';
}
function statCell(l,v){return '<div class="chartStat"><span class="chartStatLabel">'+esc(l)+'</span><span class="chartStatVal">'+esc(v)+'</span></div>'}
function chartHtml(){
  const W=560,H=120,PAD=6;
  const seg=PERIODS.map(p=>'<button type="button" class="periodBtn '+(p.key===chartPeriod?'periodBtnActive':'')+'" data-act="period" data-p="'+p.key+'">'+p.label+'</button>').join('');
  const history=windowedHistory();
  if(history.length<1){
    return '<div class="card"><div class="chartHead"><span class="chartLabel">Net worth over time</span><div class="periodSeg">'+seg+'</div></div>'
      +'<div class="chartEmpty">add an account or stock and the <b style="color:var(--brand)">net-worth line draws itself</b> over time</div></div>';
  }
  const first=history[0].value,last=history[history.length-1].value,change=last-first;
  const dir=Math.abs(change)<0.005?'flat':change>0?'up':'down';
  const color=dir==='up'?'var(--brand)':dir==='down'?'var(--neg)':'var(--muted)';
  let deltaLabel='Flat';
  if(dir!=='flat'){
    if(Math.abs(first)<0.5)deltaLabel=(change>0?'+':'−')+fmtMoney(Math.abs(change));
    else{const pct=(change/Math.abs(first))*100,ap=Math.abs(pct);deltaLabel=(change>0?'+':'−')+(ap>=100?ap.toFixed(0):ap>=10?ap.toFixed(1):ap.toFixed(2))+'%';}
  }
  const vals=history.map(p=>p.value),minV=Math.min.apply(null,vals),maxV=Math.max.apply(null,vals);
  const range=(maxV-minV)||Math.max(1,Math.abs(maxV));
  let pts,lineD,areaD;
  if(history.length===1){const y=H/2;pts=[{x:0,y,t:history[0].t,v:history[0].value},{x:W,y,t:history[0].t,v:history[0].value}];lineD='M0,'+y+' L'+W+','+y;areaD=lineD+' L'+W+','+H+' L0,'+H+' Z';}
  else{pts=history.map((p,i)=>({x:(i/(history.length-1))*W,y:H-PAD-((p.value-minV)/range)*(H-PAD*2),t:p.t,v:p.value}));lineD=smoothPath(pts);const lp=pts[pts.length-1],fp=pts[0];areaD=lineD+' L'+lp.x+','+H+' L'+fp.x+','+H+' Z';}
  window.__nwPts=pts;
  const hv=(hoverIdx!=null&&pts[hoverIdx])?pts[hoverIdx]:null;
  return '<div class="card"><div class="chartHead"><div class="chartHeadLeft"><span class="chartLabel">'+(chartPeriod==='ALL'?'All-time':chartPeriod)+'</span>'
    +'<span class="chartDelta '+dir+'">'+esc(deltaLabel)+'</span></div><div class="periodSeg">'+seg+'</div></div>'
    +'<div class="chartSvgWrap" id="nwChartWrap">'
    +'<svg class="chartSvg" id="nwChartSvg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" style="color:'+color+'">'
    +'<defs><linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity="0.5"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>'
    +'<line class="chartGrid" x1="0" x2="'+W+'" y1="20" y2="20"/><line class="chartGrid" x1="0" x2="'+W+'" y1="60" y2="60"/><line class="chartGrid" x1="0" x2="'+W+'" y1="100" y2="100"/>'
    +'<path d="'+areaD+'" fill="url(#nwGrad)"/><path d="'+lineD+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    +(hv?'<line class="chartCrosshair" x1="'+hv.x+'" x2="'+hv.x+'" y1="0" y2="'+H+'"/><circle class="chartHoverDot" cx="'+hv.x+'" cy="'+hv.y+'" r="4"/>':'')
    +'</svg>'
    +'<div class="chartTip'+(hv?' show':'')+'" id="nwChartTip" style="'+(hv?('left:'+((hv.x/W)*100)+'%;'):'')+'">'
    +(hv?('<b>'+esc(fmtMoney(hv.v))+'</b><span>'+new Date(hv.t).toLocaleDateString('en-US',{month:'short',day:'numeric'})+'</span>'):'')
    +'</div></div>'
    +'<div class="chartStatsRow">'+statCell('1% of NW',fmtMoney(last/100))+statCell('All-time high',fmtMoney(maxV))+statCell('All-time low',fmtMoney(minV))+statCell('Snapshots',String(history.length))+'</div></div>';
}
function donutArcPath(cx,cy,rO,rI,a1,a2){
  const x1o=cx+rO*Math.cos(a1),y1o=cy+rO*Math.sin(a1),x2o=cx+rO*Math.cos(a2),y2o=cy+rO*Math.sin(a2);
  const x1i=cx+rI*Math.cos(a2),y1i=cy+rI*Math.sin(a2),x2i=cx+rI*Math.cos(a1),y2i=cy+rI*Math.sin(a1);
  const large=a2-a1>Math.PI?1:0;
  return 'M '+x1o.toFixed(2)+' '+y1o.toFixed(2)+' A '+rO+' '+rO+' 0 '+large+' 1 '+x2o.toFixed(2)+' '+y2o.toFixed(2)+' L '+x1i.toFixed(2)+' '+y1i.toFixed(2)+' A '+rI+' '+rI+' 0 '+large+' 0 '+x2i.toFixed(2)+' '+y2i.toFixed(2)+' Z';
}
function donutHtml(nw){
  const slices=[];
  // bank/other are the two pastels closest in hue to stocks' lavender —
  // crypto's green between them keeps every adjacent pair distinguishable
  ['bank','other','crypto'].forEach(t=>{const v=acctTotal(t);if(v>0)slices.push({name:TYPE_LABELS[t],color:CAT_COLOR[t],value:v})});
  const st=stockTotal();if(st>0)slices.push({name:'Stocks',color:CAT_COLOR.stocks,value:st});
  const annualSubs=monthlyBurn()*12;if(annualSubs>0)slices.push({name:'Subs / yr',color:CAT_COLOR.subs,value:annualSubs});
  const total=slices.reduce((s,x)=>s+x.value,0);
  if(!slices.length||total<=0){
    return '<div class="card"><div class="chartHead"><span class="chartLabel">Allocation</span></div>'
      +'<div class="donutStage"><svg class="donutSvg" viewBox="0 0 140 140"><circle cx="70" cy="70" r="60" fill="var(--border)" opacity=".3"/><circle cx="70" cy="70" r="44" fill="var(--bg)"/></svg>'
      +'<div class="donutCenter"><div class="donutNum">—</div><div class="donutSub">total</div></div></div><div class="donutEmpty">add an account to see the breakdown</div></div>';
  }
  let angle=-Math.PI/2;const arcs=[];
  slices.forEach(s=>{const sa=(s.value/total)*Math.PI*2;const pad=slices.length>1?0.015:0;const a1=angle+pad,a2=angle+sa-pad;if(a2>a1)arcs.push({color:s.color,d:donutArcPath(70,70,60,44,a1,a2),name:s.name,pct:(s.value/total)*100,value:s.value});angle+=sa;});
  const legend=slices.map(s=>'<div class="donutLeg"><span class="donutLegDot" style="background:'+s.color+'"></span><span>'+esc(s.name)+'</span><span class="donutLegPct">'+((s.value/total)*100).toFixed(1)+'%</span></div>').join('');
  return '<div class="card"><div class="chartHead"><span class="chartLabel">Allocation</span><span class="chartDelta">'+slices.length+' slice'+(slices.length===1?'':'s')+'</span></div>'
    +'<div class="donutStage"><svg class="donutSvg" viewBox="0 0 140 140">'+arcs.map(a=>'<path d="'+a.d+'" fill="'+a.color+'" tabindex="0"><title>'+esc(a.name)+' · '+esc(fmtMoney(a.value))+' · '+a.pct.toFixed(1)+'%</title></path>').join('')+'</svg>'
    +'<div class="donutCenter"><div class="donutNum">'+esc(fmtMoney(nw))+'</div><div class="donutSub">total</div></div></div>'
    +'<div class="donutLegend">'+legend+'</div></div>';
}
function accountRowHtml(a){
  const editingName=editingId===a.id&&editKind==='name',editingAmt=editingId===a.id&&editKind==='amt';
  const nameCell=editingName
    ?'<input class="inlineEditInput" id="editNameIn" value="'+esc(a.name)+'" data-edit="name" data-id="'+a.id+'" />'
    :'<span class="accountRowName" data-act="editName" data-id="'+a.id+'" title="Tap to rename">'+esc(a.name)+'</span>';
  const amtCell=editingAmt
    ?'<input class="inlineEditInput inlineEditAmt" id="editAmtIn" value="'+(typeof a.balance==='number'?a.balance:'')+'" data-edit="amt" data-id="'+a.id+'" />'
    :'<span class="accountRowAmount" data-act="editAmt" data-id="'+a.id+'" title="Tap to edit">'+esc(fmtMoney(typeof a.balance==='number'?a.balance:0))+'</span>';
  return '<div class="accountRow">'+nameCell+amtCell+'<button type="button" class="deleteBtn" data-act="delAcc" data-id="'+a.id+'" title="Remove">&times;</button></div>';
}
function accountCardHtml(type,nw){
  const items=accts().filter(a=>a.type===type);
  const total=acctTotal(type);
  const pct=nw>0&&total>0?(total/nw)*100:null;
  const d=draftAcc[type];
  const addBlock=showAcc[type]
    ?'<div class="quickAdd"><input class="quickAddInput" placeholder="'+TYPE_PH[type][0]+'" value="'+esc(d.name)+'" data-draft="'+type+'.name" data-enter="addAcc" />'
      +'<input class="quickAddInput" type="text" inputmode="decimal" placeholder="'+TYPE_PH[type][1]+'" value="'+esc(d.amt)+'" data-draft="'+type+'.amt" data-enter="addAcc" />'
      +'<button type="button" class="quickAddBtn" data-act="addAccGo" data-type="'+type+'">+</button></div>'
    :'<button type="button" class="addToggle" data-act="showAcc" data-type="'+type+'">+ add</button>';
  return '<div class="accountCard"><div class="accountHead"><span class="accountLabel">'+TYPE_LABELS[type]+'</span>'
    +'<span class="accountTotal">'+esc(fmtMoney(total))+(pct!=null?'<span class="accountTotalPct">· '+pct.toFixed(1)+'%</span>':'')+'</span></div>'
    +'<div class="accountList">'+items.map(accountRowHtml).join('')+'</div>'+addBlock+'</div>';
}
const ACTIVITY_BUCKETS=[{key:'today',label:'Today'},{key:'yesterday',label:'Yesterday'},{key:'week',label:'Earlier this week'},{key:'older',label:'Earlier'}];
function fmtActDate(ts){
  const d=new Date(ts),now=new Date();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  const dayStart=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  if(dayStart===today)return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  if(dayStart===today-86400000)return 'yest';
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
function activityHtml(){
  const list=activity();
  if(!list.length)return '<div class="activity"><div class="activityHead"><span class="chartLabel">Recent activity</span></div><div class="activityEmpty">activity will appear here as you add or edit accounts</div></div>';
  const now=new Date();
  const todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  const yStart=todayStart-86400000,wStart=todayStart-7*86400000;
  const buckets={today:[],yesterday:[],week:[],older:[]};
  list.slice(0,30).forEach(e=>{if(e.ts>=todayStart)buckets.today.push(e);else if(e.ts>=yStart)buckets.yesterday.push(e);else if(e.ts>=wStart)buckets.week.push(e);else buckets.older.push(e)});
  let rows='';
  ACTIVITY_BUCKETS.forEach(b=>{
    const entries=buckets[b.key];if(!entries.length)return;
    rows+='<div class="activityBucketLabel">'+b.label+'</div>'+entries.map(e=>{
      const up=e.delta>=0,cls=up?'up':'down',sign=up?'+':'−';
      const barColor=CAT_COLOR[e.type]||'var(--muted)';
      return '<div class="activityRow"><span class="activityBar" style="background:'+barColor+';box-shadow:0 0 9px '+barColor+'"></span>'
        +'<div><div class="activityName">'+esc(e.name||'(unnamed)')+'</div><div class="activityMeta">'+esc(e.type)+' · '+esc(e.kind)+'</div></div>'
        +'<span class="activityAmt '+cls+'">'+sign+esc(fmtMoney(Math.abs(e.delta)))+'</span><span class="activityDate">'+fmtActDate(e.ts)+'</span></div>';
    }).join('');
  });
  return '<div class="activity"><div class="activityHead"><span class="chartLabel">Recent activity</span><span class="chartDelta">'+list.length+'</span></div>'+rows+'</div>';
}
function netWorthViewHtml(){
  const nw=netWorth();
  return '<section class="section"><div class="sectionEyebrow"><span>Net worth</span></div>'
    +'<div class="well" style="text-align:left;margin-top:0"><div class="kick" style="text-align:left">✦ total net worth</div>'
    +'<div class="worth" style="text-align:left;font-size:clamp(38px,8vw,58px)'+(nw<0?';color:var(--neg)':'')+'">'+esc(fmtMoney(nw))+'</div>'+dailyDeltaHtml()+'</div>'
    +importTriggerHtml('statement','Import from screenshot','read a statement in 5 seconds')
    +'<div class="overviewGrid">'+chartHtml()+donutHtml(nw)+'</div>'
    +'<div class="accountsGrid">'+accountCardHtml('bank',nw)+accountCardHtml('crypto',nw)+accountCardHtml('other',nw)+'</div>'
    +activityHtml()+'</section>';
}
function addAccount(type){
  const d=draftAcc[type];const name=(d.name||'').trim();if(!name)return;
  const raw=String(d.amt||'').replace(/[$,\s]/g,'');const bal=Number(raw);
  const acc={id:'a'+Math.random().toString(36).slice(2,8),name,balance:(raw!==''&&isFinite(bal))?bal:0,type};
  accts().push(acc);pushActivity({name,type,delta:acc.balance,kind:'add'});
  draftAcc[type]={name:'',amt:''};showAcc[type]=false;snapshot();persist();render();
}
```

`commit()` handles saving an inline account edit — its `name` and `amt` branches
(shared with the Stocks `sh` branch) must be present:

```js
function commit(){
  const nameIn=document.getElementById('editNameIn'),amtIn=document.getElementById('editAmtIn'),genIn=document.getElementById('editIn');
  if(!editingId){return}
  if(nameIn&&editKind==='name'){
    const a=accts().find(x=>x.id===editingId);
    if(a){const v=nameIn.value.trim();if(v)a.name=v;}
    editingId=null;persist();render();return;
  }
  if(amtIn&&editKind==='amt'){
    const a=accts().find(x=>x.id===editingId);
    const raw=String(amtIn.value).replace(/[$,\s]/g,'');const n=Number(raw);
    if(a&&raw!==''&&isFinite(n)){const delta=n-(a.balance||0);a.balance=n;pushActivity({name:a.name,type:a.type,delta,kind:'edit'});snapshot();persist();}
    editingId=null;render();return;
  }
  /* ...the genIn/'sh' branch belongs to the Stocks tab; keep it if present... */
  editingId=null;render();
}
```

---

## 2. Add these CSS rules (verbatim, inside the tile's `<style>`)

```css
.overviewGrid{display:grid;grid-template-columns:1.5fr 1fr;gap:12px;margin-top:18px}
@media (max-width:560px){.overviewGrid{grid-template-columns:1fr}}
.card{border:1px solid var(--border);border-radius:16px;background:rgba(14,14,17,.5);padding:16px}
.chartHead{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.chartHeadLeft{display:flex;align-items:baseline;gap:8px}
.chartLabel{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.chartDelta{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--muted-strong)}
.chartDelta.up{color:var(--brand)}
.chartDelta.down{color:var(--neg)}
.periodSeg{display:flex;gap:3px}
.periodBtn{background:transparent;border:1px solid var(--border);color:var(--muted);font-family:var(--mono);font-size:9.5px;padding:4px 7px;border-radius:7px;cursor:pointer}
.periodBtn:hover{color:#fff}
.periodBtnActive{background:var(--brand);color:#04140d;border-color:var(--brand)}
.chartSvgWrap{position:relative;margin-top:10px}
.chartSvg{width:100%;height:120px;display:block;overflow:visible}
.chartGrid{stroke:var(--border);stroke-width:1}
.chartCrosshair{stroke:rgba(255,255,255,.25);stroke-width:1;pointer-events:none}
.chartHoverDot{fill:currentColor;stroke:var(--bg);stroke-width:2;pointer-events:none}
.chartTip{position:absolute;top:0;transform:translate(-50%,-100%);background:#0c0c10;border:1px solid var(--border);border-radius:8px;padding:6px 9px;font-family:var(--mono);font-size:10.5px;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .1s}
.chartTip.show{opacity:1}
.chartTip b{color:var(--fg);font-size:12px;display:block}
.chartTip span{color:var(--muted)}
.chartStatsRow{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:14px}
.chartStat{display:flex;flex-direction:column;gap:2px}
.chartStatLabel{font-family:var(--mono);font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.chartStatVal{font-family:var(--mono);font-size:12px;color:var(--muted-strong)}
.chartEmpty{padding:30px 0;text-align:center;color:var(--muted);font-size:12.5px}
.donutStage{position:relative;width:132px;height:132px;margin:8px auto 0}
.donutSvg{width:100%;height:100%}
.donutSvg path{transition:opacity .12s;cursor:pointer}
.donutSvg path:hover{opacity:.8}
.donutCenter{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.donutNum{font-family:var(--mono);font-size:13px;font-weight:700;color:var(--fg);text-shadow:0 0 14px rgba(110,231,183,.45)}
.donutSub{font-family:var(--mono);font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.donutLegend{margin-top:14px;display:flex;flex-direction:column;gap:7px}
.donutLeg{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted-strong)}
.donutLegDot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.donutLeg span:nth-child(2){flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.donutLegPct{font-family:var(--mono);font-size:11px;font-weight:700;color:var(--fg)}
.donutEmpty{margin-top:10px;text-align:center;color:var(--muted);font-size:11.5px}
.accountsGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
@media (max-width:560px){.accountsGrid{grid-template-columns:1fr}}
.accountCard{border:1px solid var(--border);border-radius:16px;background:rgba(14,14,17,.5);padding:14px}
.accountHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.accountLabel{font-size:13px;font-weight:600}
.accountTotal{font-family:var(--mono);font-size:12px;color:var(--muted-strong);text-shadow:0 0 10px rgba(110,231,183,.3)}
.accountTotalPct{color:var(--muted);margin-left:3px}
.accountList{display:flex;flex-direction:column;gap:6px}
.accountRow{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;padding:8px 4px}
.accountRowName{font-size:13px;cursor:pointer}
.accountRowAmount{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--fg);cursor:pointer;padding:2px 6px;border-radius:6px;text-shadow:0 0 12px rgba(110,231,183,.4)}
.accountRowAmount:hover{background:rgba(110,231,183,.09);color:var(--brand)}
.inlineEditInput{width:100%;background:rgba(0,0,0,.45);border:1px solid var(--brand);border-radius:6px;padding:4px 7px;color:var(--fg);font-family:var(--mono);font-size:13px;outline:none}
.inlineEditAmt{text-align:right}
.deleteBtn{border:none;background:none;color:var(--muted);cursor:pointer;font-size:14px;opacity:.4}
.deleteBtn:hover{opacity:1;color:var(--neg)}
.quickAdd{display:grid;grid-template-columns:1fr 1fr auto;gap:6px;margin-top:8px}
.quickAddInput{background:rgba(0,0,0,.35);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--fg);font:inherit;font-size:12.5px;outline:none;min-width:0}
.quickAddInput:focus{border-color:var(--brand)}
.quickAddBtn{border:none;background:var(--brand);color:#04140d;font-weight:700;border-radius:8px;padding:0 12px;cursor:pointer}
.addToggle{margin-top:8px;background:transparent;border:1px dashed var(--border);border-radius:8px;color:var(--muted);font:inherit;font-size:11.5px;padding:8px 10px;cursor:pointer;width:100%}
.addToggle:hover{color:var(--brand);border-color:var(--brand)}
.activity{margin-top:18px;border-top:1px solid var(--border);padding-top:14px}
.activityHead{display:flex;justify-content:space-between;margin-bottom:8px}
.activityEmpty{color:var(--muted);font-size:12px;padding:8px 0}
.activityBucketLabel{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:10px 0 6px}
.activityRow{display:grid;grid-template-columns:4px 1fr auto auto;align-items:center;gap:10px;padding:9px 11px;margin-bottom:6px;border-radius:11px;background:rgba(255,255,255,.03)}
.activityBar{height:22px;border-radius:99px}
.activityName{font-size:12.5px}
.activityMeta{font-family:var(--mono);font-size:9.5px;color:var(--muted)}
.activityAmt{font-family:var(--mono);font-size:13px;font-weight:700}
.activityAmt.up{color:var(--brand);text-shadow:0 0 12px rgba(110,231,183,.6)}
.activityAmt.down{color:var(--neg);text-shadow:0 0 12px rgba(255,139,139,.55)}
.activityDate{font-family:var(--mono);font-size:9.5px;color:var(--muted)}
```

(Also relies on the shared `.section`, `.sectionEyebrow`, `.well`, `.kick`,
`.worth`, `.delta`, `.importTrigger*` rules already in the tile.)

---

## 3. Wire it in (do all — this is the "everything")

**a. Route in `render()`** — the `networth` branch calls `netWorthViewHtml()`,
and after `document.getElementById('app').innerHTML=html` the chart hover is bound:

```js
function render(){
  let html='';
  if(view==='networth')html=netWorthViewHtml();
  else if(view==='stocks'){ /* stocks branch */ }
  else if(view==='subs')html=subsViewHtml();
  else if(view==='orders')html=ordersViewHtml();
  else html=wishViewHtml();
  html+=tabBar();
  document.getElementById('app').innerHTML=html;
  /* inline-edit focus binding (name/amt/sh): focus + select + keydown Enter->commit / Esc->cancel + blur->commit */
  if(editingId){
    const i=document.getElementById('editIn')||document.getElementById('editNameIn')||document.getElementById('editAmtIn');
    if(i){i.focus();try{i.select()}catch(e){}
      i.addEventListener('keydown',e=>{if(e.key==='Enter')commit();else if(e.key==='Escape'){editingId=null;render()}});
      i.addEventListener('blur',commit);}
  }
  /* ...stocks focus binding... */
  const nwWrap=document.getElementById('nwChartWrap');
  if(nwWrap){
    const svg=document.getElementById('nwChartSvg');
    svg.addEventListener('pointermove',e=>{
      const pts=window.__nwPts;if(!pts||!pts.length)return;
      const rect=svg.getBoundingClientRect();const relX=((e.clientX-rect.left)/rect.width)*560;
      let idx=0,best=Infinity;for(let i=0;i<pts.length;i++){const dd=Math.abs(pts[i].x-relX);if(dd<best){best=dd;idx=i}}
      if(idx!==hoverIdx){hoverIdx=idx;render();}
    });
    svg.addEventListener('pointerleave',()=>{if(hoverIdx!=null){hoverIdx=null;render();}});
  }
}
```

**b. Delegated `click` branches** (inside the single `document.addEventListener('click', …)`):

```js
const period=e.target.closest('[data-act="period"]');
if(period){chartPeriod=period.getAttribute('data-p');hoverIdx=null;render();return}
const en=e.target.closest('[data-act="editName"]');
if(en){editingId=en.getAttribute('data-id');editKind='name';render();return}
const ea=e.target.closest('[data-act="editAmt"]');
if(ea){editingId=ea.getAttribute('data-id');editKind='amt';render();return}
const delAcc=e.target.closest('[data-act="delAcc"]');
if(delAcc){const id=delAcc.getAttribute('data-id');const a=accts().find(x=>x.id===id);if(a){pushActivity({name:a.name,type:a.type,delta:-(a.balance||0),kind:'delete'});store.accounts=accts().filter(x=>x.id!==id);snapshot();persist();render();}return}
const showAccBtn=e.target.closest('[data-act="showAcc"]');
if(showAccBtn){showAcc[showAccBtn.getAttribute('data-type')]=true;render();return}
const addAccGo=e.target.closest('[data-act="addAccGo"]');
if(addAccGo){addAccount(addAccGo.getAttribute('data-type'));return}
```

Also present: the tab-switch branch resets state including the chart —
`view=…;editingId=null;…;hoverIdx=null;render()`.

**c. Delegated `input` handler** captures the quick-add drafts. `data-draft`
values `bank.name`/`bank.amt`/`crypto.*`/`other.*` map into `draftAcc[group][field]`:

```js
document.addEventListener('input',e=>{
  const t=e.target;const key=t.getAttribute('data-draft');if(!key)return;
  const [group,field]=key.split('.');
  const val=t.type==='checkbox'?t.checked:t.value;
  const stores={bank:draftAcc.bank,crypto:draftAcc.crypto,other:draftAcc.other,/* + subAdd, subEdit, order, wish */};
  const g=stores[group];if(!g)return;
  const map={amount:'amount',amt:'amt',name:'name',/* … */};
  g[map[field]||field]=val;
});
```

(The quick-add `+` button uses `data-act="addAccGo"`, not Enter; `data-enter="addAcc"`
on the inputs is inert here — Enter on account rows commits via the add button.)

---

## 4. Behavior invariants (keep it laser-accurate)

- **Chart grows, never plateaus** — `snapshot()` has NO time throttle; every
  balance/stock change pushes its own point. `snapshot()` is called on every
  add/edit/delete of an account, and on stock changes.
- **Donut slice order is exactly `bank, other, crypto, stocks, subs`** — this
  keeps the two purples (bank blue-ish? no: bank `#7CC7F8`, other `#A78BFA`,
  stocks `#C4B5FD`) non-adjacent and validated for contrast; do not reorder.
- **Hero total is italic serif** (`.worth`), red when negative; the 24h delta
  compares the last snapshot to the newest snapshot ≤24h old.
- **Amounts glow** — account totals/row amounts and the donut center carry the
  mint `text-shadow`; activity gains glow mint, losses glow red.
- Percent-of-net-worth on account cards = `total/nw*100`, one decimal.
- Escape every user string with `esc()`.

---

## 5. Accuracy checklist (run before done)

1. Extract the `<script>` body → `node --check` passes.
2. Headless: stub `document`/`window`/`window.Vitality`; assert
   `netWorthViewHtml()`, `chartHtml()` (ALL/1D/1W), `donutHtml(netWorth())`,
   `accountCardHtml('bank'|'crypto'|'other', nw)`, `activityHtml()` all return
   HTML without throwing on both empty and populated stores.
3. **Growth regression**: add an account, then edit its balance twice quickly →
   `store.history` gains 3 rising points, not 1.
4. Serve `npm run dev -- -p 3001`, open the tile in the dashboard, Net worth tab:
   confirm the total, the chart draws + hover crosshair/tooltip track the pointer,
   the period buttons re-scope, the donut renders in the right order with a glowing
   center + bold-white legend %s, the three category cards inline-edit/add/delete,
   and the activity feed groups + glows correctly.
5. Copy `public/tiles/finance.html` → `tiles-library/finance.html` (empty diff).
