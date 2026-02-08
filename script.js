const video = document.getElementById("video");
const stage = document.getElementById("stage");
const stickersLayer = document.getElementById("stickers");

const shotBtn = document.getElementById("shot");
const flipBtn = document.getElementById("flip");
const delBtn = document.getElementById("deleteSelected");
const clearBtn = document.getElementById("clearAll");

let stream = null;
let facing = "user";

/* ---------------- KAMERA ---------------- */
async function startCamera(){
  if(stream) stream.getTracks().forEach(t=>t.stop());

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing }
  });

  video.srcObject = stream;
  video.style.transform = facing==="user" ? "scaleX(-1)" : "none";
}

flipBtn.onclick = ()=>{
  facing = facing==="user" ? "environment" : "user";
  startCamera();
};

startCamera();

/* ---------------- NALepke: podatki ----------------
  Vsaka nalepka ima:
  - x,y v % (0..100)
  - scale (npr. 1.0)
  - rot (stopinje)
*/
let selected = null;

/* Izbira / odznači */
function selectSticker(el){
  document.querySelectorAll(".sticker").forEach(s => s.classList.remove("selected"));
  selected = el;
  if(el) el.classList.add("selected");
}

stage.addEventListener("pointerdown", (e)=>{
  // tap na prazno -> odznači
  if(!e.target.classList.contains("sticker")) selectSticker(null);
});

/* Dodaj emoji */
document.querySelectorAll(".emojis button").forEach(btn=>{
  btn.onclick = ()=>{
    const el = document.createElement("div");
    el.className = "sticker";
    el.textContent = btn.textContent;

    // default v center
    el.dataset.x = "50";
    el.dataset.y = "55";
    el.dataset.scale = "1";
    el.dataset.rot = "0";
    applyTransform(el);

    // tap -> select
    el.addEventListener("pointerdown", (e)=>{
      e.stopPropagation();
      selectSticker(el);
    });

    enableGestures(el);
    stickersLayer.appendChild(el);
    selectSticker(el);
  };
});

/* Izbriši izbrano / počisti */
delBtn.onclick = ()=>{
  if(selected){
    selected.remove();
    selected = null;
  }
};

clearBtn.onclick = ()=>{
  stickersLayer.innerHTML = "";
  selected = null;
};

/* ---------------- Premik + pinch zoom + rotacija ---------------- */
function applyTransform(el){
  const x = Number(el.dataset.x);
  const y = Number(el.dataset.y);
  const sc = Number(el.dataset.scale);
  const rot = Number(el.dataset.rot);

  el.style.left = x + "%";
  el.style.top  = y + "%";
  el.style.transform = `translate(-50%,-50%) rotate(${rot}deg) scale(${sc})`;
}

function enableGestures(el){
  // aktivni pointerji na tej nalepki
  const pointers = new Map();

  // stanje za drag / pinch
  let dragOffset = null;
  let startDist = 0;
  let startAngle = 0;
  let startScale = 1;
  let startRot = 0;
  let startMid = null;

  function getStageRect(){ return stage.getBoundingClientRect(); }

  function pointFromEvent(ev){
    return { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
  }

  function midPoint(a,b){
    return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
  }

  function distance(a,b){
    return Math.hypot(a.x-b.x, a.y-b.y);
  }

  function angle(a,b){
    return Math.atan2(b.y-a.y, b.x-a.x);
  }

  el.addEventListener("pointerdown", (ev)=>{
    ev.preventDefault();
    el.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, pointFromEvent(ev));

    // Če je prvi prst: pripravimo “lep” drag z offsetom (brez skakanja)
    if(pointers.size === 1){
      const rect = getStageRect();
      const ex = ev.clientX - rect.left;
      const ey = ev.clientY - rect.top;

      const curX = (Number(el.dataset.x) / 100) * rect.width;
      const curY = (Number(el.dataset.y) / 100) * rect.height;

      dragOffset = { dx: ex - curX, dy: ey - curY };
    }

    // Če sta 2 prsta: inicializiramo pinch
    if(pointers.size === 2){
      const [p1, p2] = Array.from(pointers.values());
      startDist = distance(p1,p2);
      startAngle = angle(p1,p2);
      startScale = Number(el.dataset.scale);
      startRot = Number(el.dataset.rot);
      startMid = midPoint(p1,p2);
    }
  });

  el.addEventListener("pointermove", (ev)=>{
    if(!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, pointFromEvent(ev));

    const rect = getStageRect();

    // 1 prst: premik
    if(pointers.size === 1 && dragOffset){
      const p = Array.from(pointers.values())[0];
      const ex = p.x - rect.left;
      const ey = p.y - rect.top;

      let px = ex - dragOffset.dx;
      let py = ey - dragOffset.dy;

      // v %
      let x = (px / rect.width) * 100;
      let y = (py / rect.height) * 100;

      // omejitve
      x = Math.max(2, Math.min(98, x));
      y = Math.max(2, Math.min(98, y));

      el.dataset.x = String(x);
      el.dataset.y = String(y);
      applyTransform(el);
      return;
    }

    // 2 prsta: pinch zoom + rot + premik po midpointu
    if(pointers.size === 2){
      const [p1, p2] = Array.from(pointers.values());
      const dist = distance(p1,p2);
      const ang = angle(p1,p2);
      const mid = midPoint(p1,p2);

      // scale
      let newScale = startScale * (dist / startDist);
      newScale = Math.max(0.4, Math.min(3.0, newScale));

      // rotacija (delta)
      const deltaAngle = ang - startAngle;
      const newRot = startRot + (deltaAngle * 180 / Math.PI);

      // premik: midpoint sledi prstom
      if(startMid){
        const dx = mid.x - startMid.x;
        const dy = mid.y - startMid.y;

        const curXpx = (Number(el.dataset.x)/100) * rect.width;
        const curYpx = (Number(el.dataset.y)/100) * rect.height;

        const nx = curXpx + dx;
        const ny = curYpx + dy;

        let x = (nx / rect.width) * 100;
        let y = (ny / rect.height) * 100;

        x = Math.max(2, Math.min(98, x));
        y = Math.max(2, Math.min(98, y));

        el.dataset.x = String(x);
        el.dataset.y = String(y);

        // posodobimo startMid, da je premik “smooth”
        startMid = mid;
      }

      el.dataset.scale = String(newScale);
      el.dataset.rot = String(newRot);
      applyTransform(el);
      return;
    }
  });

  el.addEventListener("pointerup", (ev)=>{
    pointers.delete(ev.pointerId);
    dragOffset = null;

    // ko ostane en prst po pinch-u, ponovno izračunamo dragOffset ob naslednjem down
    if(pointers.size < 2){
      startMid = null;
    }
  });

  el.addEventListener("pointercancel", (ev)=>{
    pointers.delete(ev.pointerId);
    dragOffset = null;
    startMid = null;
  });

  // BONUS: na računalniku – wheel za zoom; Shift+wheel za rotacijo
  el.addEventListener("wheel", (ev)=>{
    ev.preventDefault();
    selectSticker(el);

    if(ev.shiftKey){
      // rotacija
      const r = Number(el.dataset.rot);
      el.dataset.rot = String(r + (ev.deltaY > 0 ? 6 : -6));
    }else{
      // zoom
      const s = Number(el.dataset.scale);
      let ns = s + (ev.deltaY > 0 ? -0.08 : 0.08);
      ns = Math.max(0.4, Math.min(3.0, ns));
      el.dataset.scale = String(ns);
    }
    applyTransform(el);
  }, { passive:false });
}

/* ---------------- FOTOGRAFIRANJE ---------------- */
shotBtn.onclick = async ()=>{
  const W=1080, H=1920;
  const canvas = document.createElement("canvas");
  canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext("2d");

  // video crop cover
  const vw=video.videoWidth, vh=video.videoHeight;
  const tr=W/H, vr=vw/vh;
  let sx=0,sy=0,sw=vw,sh=vh;
  if(vr>tr){ sw=vh*tr; sx=(vw-sw)/2; }
  else{ sh=vw/tr; sy=(vh-sh)/2; }

  if(facing==="user"){
    ctx.translate(W,0); ctx.scale(-1,1);
  }
  ctx.drawImage(video,sx,sy,sw,sh,0,0,W,H);
  ctx.setTransform(1,0,0,1,0,0);

  // overlay contain
  const overlay = document.querySelector(".overlay");
  const ow=overlay.naturalWidth, oh=overlay.naturalHeight;
  const sc=Math.min(W/ow,H/oh);
  ctx.drawImage(overlay,(W-ow*sc)/2,(H-oh*sc)/2,ow*sc,oh*sc);

  // nalepke: upoštevaj x,y,scale,rot
  const stageRect = stage.getBoundingClientRect();

  document.querySelectorAll(".sticker").forEach(el=>{
    const xPct = Number(el.dataset.x);
    const yPct = Number(el.dataset.y);
    const scale = Number(el.dataset.scale);
    const rot = Number(el.dataset.rot);

    const x = (xPct/100)*W;
    const y = (yPct/100)*H;

    // velikost emojija (osnovna) – 80px * scale
    const base = 80;
    const fontPx = base * scale;

    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(rot * Math.PI / 180);

    ctx.font = `${fontPx}px system-ui, -apple-system, "Segoe UI Emoji"`;
    ctx.textAlign="center";
    ctx.textBaseline="middle";

    // senca
    ctx.shadowColor="rgba(0,0,0,0.35)";
    ctx.shadowBlur=fontPx*0.18;
    ctx.shadowOffsetY=fontPx*0.08;

    ctx.fillText(el.textContent,0,0);
    ctx.restore();
  });

  // download / iOS odpre v novem zavihku
  const url = canvas.toDataURL("image/png");
  const a=document.createElement("a");
  a.href=url;
  a.download="fotofilter.png";
  a.target="_blank";
  a.click();
};
