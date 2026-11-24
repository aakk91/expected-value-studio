"use strict";
const el = id => document.getElementById(id);
const namespace = "labrats.seven-mornings.v1.";
const target = el("target");
const start = el("start");
let phase = "idle";
let tick;
let frame;
let onset;
let trials;
let early;
let startedDate;
let stored = [];
function localDay(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
}
function dateLabel(key) {
  return new Date(key+"T12:00:00").toLocaleDateString(undefined, {month:"short", day:"numeric"});
}
function getDays() {
  const days = [];
  for (let i=0; i<localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(namespace)) continue;
    try {
      const row = JSON.parse(localStorage.getItem(key));
      if (/^\d{4}-\d{2}-\d{2}$/.test(row.day) && key === namespace+row.day && Number.isInteger(row.ms) && row.ms>=0 && row.ms<=3000) days.push(row);
    } catch { /* Read intact daily records when unrelated entries are malformed. */ }
  }
  return days.sort((a,b)=>a.day.localeCompare(b.day)).slice(0,7);
}
function stopTimer() { clearTimeout(tick); cancelAnimationFrame(frame); }
function lamp(text, lit=false, symbol="•") {
  target.classList.toggle("go",lit);
  el("lamp").textContent=symbol;
  el("cue").textContent=text;
}
function drawPlot(ctx, days, x, y, width, height) {
  const vals = days.map(d=>d.ms);
  const lo = vals.length ? Math.max(0,Math.floor((Math.min(...vals)-20)/10)*10) : 200;
  const hi = vals.length ? Math.ceil((Math.max(...vals)+20)/10)*10 : 400;
  const gutter=75, startX=x+gutter, endX=x+width-22, bottom=y+height-35;
  const px=i=>startX+(endX-startX)*i/6;
  const py=v=>bottom-(v-lo)/(hi-lo)*(bottom-y-20);
  ctx.font="20px -apple-system, sans-serif";
  ctx.textAlign="left"; ctx.fillStyle="#52564a"; ctx.strokeStyle="#d1d4c5"; ctx.lineWidth=2;
  for(const v of [lo, Math.round((lo+hi)/2), hi]) {
    ctx.beginPath(); ctx.moveTo(startX,py(v)); ctx.lineTo(endX,py(v)); ctx.stroke();
    ctx.fillText(v+"",x+6,py(v)+6);
  }
  ctx.textAlign="center";
  for(let i=0;i<7;i++) ctx.fillText(String(i+1),px(i),bottom+28);
  ctx.beginPath();
  days.forEach((d,i)=>i ? ctx.lineTo(px(i),py(d.ms)) : ctx.moveTo(px(i),py(d.ms)));
  ctx.strokeStyle="#4c602c"; ctx.lineWidth=4; ctx.stroke();
  days.forEach((d,i)=>{ctx.beginPath();ctx.arc(px(i),py(d.ms),8,0,2*Math.PI);ctx.fillStyle="#c8ff4d";ctx.fill();ctx.strokeStyle="#294208";ctx.lineWidth=2;ctx.stroke();});
}
function weekSummary() {
  if (!stored.length) return "Your first run starts your chart.";
  const fastest = stored.reduce((a,b)=>a.ms<=b.ms?a:b);
  const slowest = Math.max(...stored.map(d=>d.ms));
  return stored.length===1 ? "Your first daily median is "+fastest.ms+" ms." :
    "Fastest morning: "+dateLabel(fastest.day)+" ("+fastest.ms+" ms). Daily medians range from "+fastest.ms+" to "+slowest+" ms.";
}
function render() {
  let unavailable=false;
  try { stored=getDays(); } catch { unavailable=true; }
  const done=stored.length===7, today=stored.some(d=>d.day===localDay());
  const n=Math.min(7,stored.length+1);
  el("session").textContent=done ? "Seven mornings complete" : today ? "Morning "+stored.length+" saved" : "Morning "+n;
  el("progress").textContent=stored.length+" / 7 mornings";
  el("count").textContent="10 lights · about 40 seconds";
  start.hidden=today||done||unavailable;
  start.textContent="Start morning "+n;
  target.disabled=true;
  lamp(done ? "Your seven mornings are in" : today ? "Come back tomorrow" : "Tap when the light turns green", false, today||done ? "✓" : "•");
  el("status").textContent=unavailable ? "Enable browser storage to save your week." : today||done ? "Your daily median and accuracy are saved below." : "Use the same hand and the same device each morning.";
  const canvas=el("chart"), ctx=canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height); drawPlot(ctx,stored,0,0,canvas.width,canvas.height);
  el("summary").textContent=weekSummary();
  el("history").replaceChildren(...stored.map(d=>{
    const li=document.createElement("li"), label=document.createElement("span"), timing=document.createElement("strong"), errors=document.createElement("small");
    label.textContent=dateLabel(d.day); timing.textContent=d.ms+" ms";
    errors.textContent=d.hits+"/10 hits · "+d.early+" early"; li.append(label,timing,errors);return li;
  }));
  el("card").hidden=!stored.length;
  el("share").hidden=!stored.length;
}
function awaitLight() {
  phase="waiting"; lamp("Wait for green");
  tick=setTimeout(()=>{
    frame=requestAnimationFrame(()=>{
      phase="lit"; lamp("Tap now",true,"!"); onset=performance.now();
      tick=setTimeout(()=>endLight(null),3000);
    });
  },1000+Math.random()*3000);
}
function nextLight() {
  el("count").textContent="Light "+(trials.length+1)+" of 10";
  awaitLight();
}
function endLight(ms) {
  stopTimer();phase="feedback"; trials.push(ms);
  lamp(ms===null?"Missed light":ms+" ms",false,ms===null?"–":"✓");
  tick=setTimeout(trials.length===10 ? finish : nextLight,550);
}
function respond() {
  if(phase==="lit") {
    const ms=Math.round(performance.now()-onset);
    endLight(ms<=3000 ? ms : null);
  } else if(phase==="waiting") {
    stopTimer();phase="feedback";early++;
    lamp("Early tap. Wait for the light.",false,"!");
    tick=setTimeout(awaitLight,550);
  }
}
async function finish() {
  phase="saving"; target.disabled=true;
  const valid=trials.filter(ms=>ms!==null).sort((a,b)=>a-b);
  const count=valid.length, middle=Math.floor(count/2);
  let message;
  if(!count) message="No lights tapped in time. Try this morning again.";
  else if(localDay()!==startedDate) message="The date changed during your run. Start again for today.";
  else {
    const ms=count%2 ? valid[middle] : Math.round((valid[middle-1]+valid[middle])/2);
    const save=()=>{
      const days=getDays();
      if(days.length<7 && !days.some(d=>d.day===startedDate)) localStorage.setItem(namespace+startedDate,JSON.stringify({day:startedDate,ms,hits:count,early}));
    };
    try {
      if(navigator.locks) await navigator.locks.request(namespace,save); else save();
    } catch { message="Your browser could not save this morning. Check site storage, then retry."; }
  }
  phase="idle"; render();
  if(message) el("status").textContent=message;
  else el("week").scrollIntoView({block:"nearest"});
}
start.addEventListener("click",()=>{
  if(phase!=="idle") return;
  startedDate=localDay();
  try { if(getDays().some(d=>d.day===startedDate)||getDays().length===7) {render();return;} } catch {render();return;}
  trials=[];early=0;start.hidden=true;target.disabled=false;target.focus({preventScroll:true});
  el("status").textContent="Tap the pad or press Space when it lights up."; nextLight();
});
target.addEventListener("pointerdown",e=>{if(e.isPrimary && e.button===0){e.preventDefault();respond();}});
target.addEventListener("keydown",e=>{if(e.code==="Space"||e.key==="Enter"){e.preventDefault();if(!e.repeat)respond();}});
target.addEventListener("click",e=>{if(e.detail===0 && !target.disabled)respond();});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden && ["waiting","lit","feedback"].includes(phase)) {
    stopTimer();phase="idle";render();el("status").textContent="Your run was interrupted. Start again when you’re ready.";
  } else if(!document.hidden && phase==="idle") render();
});
window.addEventListener("storage",e=>{if(phase==="idle" && (!e.key||e.key.startsWith(namespace))) render();});
window.addEventListener("focus",()=>{if(phase==="idle")render();});
setInterval(()=>{if(phase==="idle" && !document.hidden && stored.length && start.hidden && stored.length<7 && stored.at(-1).day!==localDay())render();},30000);
function challengeURL() {
  return /^https?:$/.test(location.protocol) && !["localhost","127.0.0.1","[::1]"].includes(location.hostname) ? location.origin+location.pathname : "";
}
el("share").addEventListener("click",async()=>{
  const url=challengeURL();
  if(!url){el("shareStatus").textContent="Local preview. Save your result card below. Challenge links are available on the hosted page.";return;}
  const payload={title:"LabRats · Seven mornings",text:"Tap ten lights each morning and see your week.",url};
  try {
    if(navigator.share) await navigator.share(payload);
    else {await navigator.clipboard.writeText(url);el("shareStatus").textContent="Challenge link copied.";}
  } catch(e) { if(e.name!=="AbortError") el("shareStatus").textContent=url; }
});
el("card").addEventListener("click",()=>{
  if(!stored.length)return;
  const canvas=document.createElement("canvas");canvas.width=1000;canvas.height=720;
  const ctx=canvas.getContext("2d");ctx.fillStyle="#efece3";ctx.fillRect(0,0,1000,720);ctx.fillStyle="#191b16";
  ctx.font="600 35px General, sans-serif";ctx.fillText("LabRats.",60,74);
  ctx.font="600 64px General, sans-serif";ctx.fillText("Seven mornings.",60,165);
  const times=stored.map(d=>d.ms);
  ctx.font="30px sans-serif";ctx.fillText(stored.length+" of 7 mornings   ·   Daily median reaction time (ms)",60,230);
  drawPlot(ctx,stored,60,265,875,260);
  ctx.textAlign="left";ctx.fillStyle="#191b16";ctx.font="600 33px sans-serif";
  const fastest=stored.find(d=>d.ms===Math.min(...times));
  ctx.fillText("Fastest morning   "+dateLabel(fastest.day)+"   ·   "+fastest.ms+" ms",60,605);
  ctx.font="27px sans-serif";ctx.fillText("Daily range   "+Math.min(...times)+"–"+Math.max(...times)+" ms",60,655);
  canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob), a=document.createElement("a");a.href=url;a.download="labrats-"+stored.length+"-mornings.png";a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},"image/png");
});
render();
