// Stabilna mobilna verzija: touch geste (1 prst premik, 2 prsta pinch+rot), plus download brez modala.

const video = document.getElementById("video");
const overlayImg = document.getElementById("overlay");
const stage = document.getElementById("stage");
const stickersLayer = document.getElementById("stickersLayer");

const shotBtn = document.getElementById("shot");
const flipBtn = document.getElementById("flip");
const deleteBtn = document.getElementById("deleteSelected");
const clearBtn = document.getElementById("clearAll");

let stream = null;
let facing = "user";
let selected = null;

function isIOSSafari(){
  const ua = navigator.userAgent || "";
  const iOS = /iP(hone|ad|od)/.test(ua);
  const webkit = /WebKit/.test(ua);
  const isChromeiOS = /CriOS/.test(ua);
  return iOS && webkit && !isChromeiOS;
}

/* ----------------- CAMERA ----------------- */
async function startCamera(){
  try{
    if(stream) stream.getTracks().forEach(t => t.stop());

    stream = await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{ facingMode: facing }
    });

    video.srcObject = stream;

    // mirror samo pri selfie
    video.style.transform = (facing === "user") ? "scaleX(-1)" : "none";

    await video.play();
  }catch(err){
    console.error(err);
    // iOS pogosto rabi user-gesture: zato bo delovalo, ko uporabnik klikne gumb.
  }
}

flipBtn.addEventListener("click", async ()=>{
  facing = (facing === "user") ? "environment" : "user";
  await startCamera();
});

startCamera();

/* ----------------- STICKERS: selection ----------------- */
function selectSticker(el){
  document.querySelectorAll(".sticker").forEach(s => s.classList.remove("selected"));
  selected = el;
  if(el) el.classList.add("selected");
}

stage.addEventListener("click", (e)=>{
  if(!e.target.classList.contains("sticker")) selectSticker(null);
});

deleteBtn.addEventListener("click", ()=>{
  if(selected){
    selected.remove();
    selected = null;
  }
});

clearBtn.addEventListener("click", ()=>{
  stickersLayer.innerHTML = "";
  selected = null;
});

/* ----------------- STICKERS: create ----------------- */
document.querySelectorAll("#emojiBar button").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    addSticker(btn.textContent);
  });
});

function addSticker(emoji){
  const el = document.createElement("div");
  el.className = "sticker";
  el.textContent = emoji;

  // hranimo podatke (v %)
  el.dataset.x = "50";
  el.dataset.y = "55";
  el.dataset.scale = "1";
  el.dataset.rot = "0";
  applyTransform(el);

  // tap to select
  el.addEventListener("click", (e)=>{
    e.stopPropagation();
    selectSticker(el);
  });

  enableTouchGestures(el);

  stickersLayer.appendChild(el);
  selectSticker(el);
}

function applyTransform(el){
  const x = Number(el.dataset.x);
  const y = Number(el.dataset.y);
  const s = Number(el.dataset.scale);
  const r = Number(el.dataset.rot);

  el.style.left = x + "%";
  el.style.top  = y + "%";
  el.style.transform = `translate(-50%,-50%) rotate(${r}deg) scale(${s})`;
}

function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

/* ----------------- TOUCH GESTURES (reliable on phones) ----------------- */
function enableTouchGestures(el){
  let dragging = false;

  // 1 finger drag
  let dragOffset = null;

  // 2 finger pinch/rotate
  let pinchStartDist = 0;
  let pinchStartAngle = 0;
  let pinchStartScale = 1;
  let pinchStartRot = 0;
  let lastMid = null;

  function rect(){ return stage.getBoundingClientRect(); }

  function getTouchPoints(touches){
    const pts = [];
    for(let i=0;i<touches.length;i++){
      pts.push({ x: touches[i].clientX, y: touches[i].clientY });
    }
    return pts;
  }
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function angle(a,b){ return Math.atan2(b.y-a.y, b.x-a.x); }
  function mid(a,b){ return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }

  el.addEventListener("touchstart", (ev)=>{
    ev.preventDefault();
    ev.stopPropagation();
    selectSticker(el);

    const touches = ev.touches;

    if(touches.length === 1){
      // smooth drag with offset (no jumping)
      dragging = true;
      const r = rect();
      const t = touches[0];

      const ex = t.clientX - r.left;
      const ey = t.clientY - r.top;

      const curX = (Number(el.dataset.x)/100) * r.width;
      const curY = (Number(el.dataset.y)/100) * r.height;

      dragOffset = { dx: ex - curX, dy: ey - curY };
      return;
    }

    if(touches.length === 2){
      dragging = false;
      dragOffset = null;

      const [p1,p2] = getTouchPoints(touches);
      pinchStartDist = dist(p1,p2);
      pinchStartAngle = angle(p1,p2);
      pinchStartScale = Number(el.dataset.scale);
      pinchStartRot = Number(el.dataset.rot);
      lastMid = mid(p1,p2);
      return;
    }
  }, { passive:false });

  el.addEventListener("touchmove", (ev)=>{
    ev.preventDefault();
    ev.stopPropagation();

    const r = rect();
    const touches = ev.touches;

    if(touches.length === 1 && dragging && dragOffset){
      const t = touches[0];
      const ex = t.clientX - r.left;
      const ey = t.clientY - r.top;

      // position in px relative to stage, then -> %
      let px = ex - dragOffset.dx;
      let py = ey - dragOffset.dy;

      let x = (px / r.width) * 100;
      let y = (py / r.height) * 100;

      x = clamp(x, 2, 98);
      y = clamp(y, 2, 98);

      el.dataset.x = String(x);
      el.dataset.y = String(y);
      applyTransform(el);
      return;
    }

    if(touches.length === 2){
      const [p1,p2] = getTouchPoints(touches);
      const d = dist(p1,p2);
      const a = angle(p1,p2);
      const m = mid(p1,p2);

      // scale
      let ns = pinchStartScale * (d / pinchStartDist);
      ns = clamp(ns, 0.4, 3.0);

      // rotation
      const delta = a - pinchStartAngle;
      const nr = pinchStartRot + (delta * 180 / Math.PI);

      // move by midpoint delta
      if(lastMid){
        const dx = m.x - lastMid.x;
        const dy = m.y - lastMid.y;

        const curXpx = (Number(el.dataset.x)/100) * r.width;
        const curYpx = (Number(el.dataset.y)/100) * r.height;

        const nxpx = curXpx + dx;
        const nypx = curYpx + dy;

        let x = (nxpx / r.width) * 100;
        let y = (nypx / r.height) * 100;

        x = clamp(x, 2, 98);
        y = clamp(y, 2, 98);

        el.dataset.x = String(x);
        el.dataset.y = String(y);
        lastMid = m; // smooth follow
      }

      el.dataset.scale = String(ns);
      el.dataset.rot = String(nr);
      applyTransform(el);
    }
  }, { passive:false });

  el.addEventListener("touchend", (ev)=>{
    // reset states
    dragging = false;
    dragOffset = null;

    // ko ostane manj kot 2 touch, reset midpoint
    if(ev.touches.length < 2) lastMid = null;
  });
}

/* ----------------- CAPTURE (1080x1920) ----------------- */
async function ensureOverlayLoaded(){
  if(overlayImg.complete && overlayImg.naturalWidth > 0) return;
  await new Promise((resolve, reject)=>{
    overlayImg.onload = resolve;
    overlayImg.onerror = reject;
  });
}

shotBtn.addEventListener("click", async ()=>{
  // iOS pogosto rabi gesture, zato ob kliku še enkrat poskusimo zagnat, če ni streama
  if(!stream){
    await startCamera();
  }

  await ensureOverlayLoaded();

  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  // če video ni pripravljen, prekini
  if(!vw || !vh){
    alert("Kamera še ni pripravljena. Poskusi še enkrat.");
    return;
  }

  // cover crop video -> 9:16
  const targetRatio = W / H;
  const videoRatio = vw / vh;

  let sx=0, sy=0, sw=vw, sh=vh;
  if(videoRatio > targetRatio){
    sh = vh;
    sw = Math.round(vh * targetRatio);
    sx = Math.round((vw - sw) / 2);
  }else{
    sw = vw;
    sh = Math.round(vw / targetRatio);
    sy = Math.round((vh - sh) / 2);
  }

  // draw video (mirror for user)
  if(facing === "user"){
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
    ctx.restore();
  }else{
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
  }

  // overlay (contain)
  const ow = overlayImg.naturalWidth, oh = overlayImg.naturalHeight;
  const sc = Math.min(W/ow, H/oh);
  const dw = ow * sc, dh = oh * sc;
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;
  ctx.drawImage(overlayImg, dx, dy, dw, dh);

  // stickers
  const stickers = Array.from(document.querySelectorAll(".sticker"));
  stickers.forEach(el=>{
    const xPct = Number(el.dataset.x);
    const yPct = Number(el.dataset.y);
    const scale = Number(el.dataset.scale);
    const rot = Number(el.dataset.rot);

    const x = (xPct/100) * W;
    const y = (yPct/100) * H;

    const base = 80;
    const fontPx = base * scale;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot * Math.PI / 180);

    ctx.font = `${fontPx}px system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = fontPx * 0.18;
    ctx.shadowOffsetY = fontPx * 0.08;

    ctx.fillText(el.textContent, 0, 0);
    ctx.restore();
  });

  const dataUrl = canvas.toDataURL("image/png");

  // download (Android), iOS Safari običajno odpre v novem zavihku (Save Image)
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "fotofilter.png";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
});
