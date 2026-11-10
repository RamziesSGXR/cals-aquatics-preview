/* ------------------------------------------------------------------
   The animated fish tank used behind the hero and inside the game.
   Static parts (water, rocks, gravel) are painted once per resize;
   plants, fish, bubbles and light are animated each frame.
------------------------------------------------------------------- */

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

const FISH_COLORS = ["#f2714b", "#f4c64e", "#4fb3d9", "#f2f5f4", "#ff7d9c", "#ffa94d"];
const PEBBLES = ["#2a4743", "#36564f", "#45665b", "#58786a", "#223b38", "#6b8676"];

export function createTank(canvas, opts = {}) {
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const s = {
    W: 0, H: 0, DPR: Math.min(window.devicePixelRatio || 1, 2),
    ground: 0,
    fish: [], bubbles: [], backPlants: [], frontPlants: [],
    staticLayer: document.createElement("canvas"),
    airstone: 0,
    targetFish: opts.fishCount ?? 7,
  };
  const speedScale = reduceMotion ? 0.25 : 1;

  /* ---------- builders ---------- */

  function makeFish(n) {
    const out = [];
    while (out.length < n) {
      const left = n - out.length;
      const roll = Math.random();
      if (roll < 0.22 && left >= 4) {
        // a small school of neon tetras
        const count = Math.min(left, 4 + ((Math.random() * 3) | 0));
        const y = rand(s.H * 0.18, s.H * 0.6);
        const dir = Math.random() < 0.5 ? 1 : -1;
        const x = rand(0, s.W);
        const speed = rand(38, 55);
        for (let k = 0; k < count; k++) {
          out.push({ kind: "tetra", x: x - dir * k * rand(18, 28), y: y + rand(-22, 22), ty: y + rand(-18, 18), dir, speed,
            size: rand(7, 10), depth: rand(0.75, 1), wobble: rand(0, 6.28), color: "#5fd0f0" });
        }
        continue;
      }
      const kind = roll < 0.4 ? "angel" : "round";
      out.push({
        kind,
        x: rand(0, s.W), y: rand(s.H * 0.15, s.H * 0.65),
        ty: rand(s.H * 0.15, s.H * 0.65),
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: kind === "angel" ? rand(16, 26) : rand(22, 40),
        size: kind === "angel" ? rand(15, 22) : rand(13, 24),
        depth: rand(0.55, 1),
        wobble: rand(0, 6.28),
        color: kind === "angel" ? "#dfe6e4" : pick(FISH_COLORS),
      });
    }
    return out;
  }

  function makePlants(count, depth) {
    const plants = [];
    for (let i = 0; i < count; i++) {
      const blades = [];
      const n = 3 + ((Math.random() * 4) | 0);
      const tall = rand(0.16, depth < 1 ? 0.42 : 0.3);
      for (let b = 0; b < n; b++) {
        blades.push({
          len: s.H * tall * rand(0.6, 1),
          width: rand(7, 13) * (depth < 1 ? 0.9 : 1.15),
          lean: rand(-0.35, 0.35),
          phase: rand(0, 6.28),
          off: rand(-10, 10),
        });
      }
      plants.push({
        x: rand(-20, s.W + 20),
        blades,
        speed: rand(0.5, 0.9),
        color: depth < 1 ? pick(["#0f4a3c", "#124f3a", "#0d4237"]) : pick(["#1f7a45", "#2a8a4a", "#3d9a4f"]),
        alpha: depth < 1 ? 0.75 : 0.95,
      });
    }
    return plants;
  }

  function makeBubble(fromStone) {
    return {
      x: fromStone ? s.airstone + rand(-6, 6) : rand(0, s.W),
      y: fromStone ? s.ground - 6 : rand(s.H * 0.3, s.ground),
      r: fromStone ? rand(2, 5.5) : rand(1.5, 3.5),
      speed: fromStone ? rand(70, 120) : rand(30, 60),
      wobble: rand(0, 6.28),
      stone: fromStone,
    };
  }

  function paintStatic() {
    const L = s.staticLayer;
    L.width = s.W * s.DPR;
    L.height = s.H * s.DPR;
    const g = L.getContext("2d");
    g.setTransform(s.DPR, 0, 0, s.DPR, 0, 0);

    // water
    const water = g.createLinearGradient(0, 0, 0, s.H);
    water.addColorStop(0, "#0d4552");
    water.addColorStop(0.45, "#093543");
    water.addColorStop(1, "#05222c");
    g.fillStyle = water;
    g.fillRect(0, 0, s.W, s.H);

    // soft glow near the surface
    const glow = g.createRadialGradient(s.W * 0.55, -s.H * 0.2, 20, s.W * 0.55, -s.H * 0.2, s.W * 0.9);
    glow.addColorStop(0, "rgba(170,230,225,0.22)");
    glow.addColorStop(1, "rgba(170,230,225,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, s.W, s.H);

    // distant hills of rock for depth
    g.fillStyle = "rgba(4,28,34,0.55)";
    g.beginPath();
    g.moveTo(0, s.ground);
    for (let x = 0; x <= s.W + 40; x += 40) {
      g.lineTo(x, s.ground - 40 - Math.sin(x * 0.006) * 30 - Math.sin(x * 0.017) * 14);
    }
    g.lineTo(s.W, s.ground);
    g.closePath();
    g.fill();

    // rocks resting on the gravel
    const rocks = Math.max(2, Math.round(s.W / 520));
    for (let i = 0; i < rocks; i++) {
      const rx = (s.W / rocks) * (i + 0.5) + rand(-80, 80);
      const rw = rand(90, 170);
      const rh = rand(45, 90);
      const rg = g.createLinearGradient(rx, s.ground - rh, rx, s.ground);
      rg.addColorStop(0, "#3d5a5a");
      rg.addColorStop(1, "#1b3236");
      g.fillStyle = rg;
      g.beginPath();
      g.moveTo(rx - rw / 2, s.ground + 4);
      g.quadraticCurveTo(rx - rw * 0.45, s.ground - rh * 0.8, rx - rw * 0.05, s.ground - rh);
      g.quadraticCurveTo(rx + rw * 0.4, s.ground - rh * 0.9, rx + rw / 2, s.ground + 4);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(200,235,230,0.08)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(rx - rw * 0.3, s.ground - rh * 0.6);
      g.quadraticCurveTo(rx - rw * 0.1, s.ground - rh * 0.95, rx + rw * 0.15, s.ground - rh * 0.9);
      g.stroke();
    }

    // gravel bed
    const gravelTop = (x) => s.ground + Math.sin(x * 0.01) * 4 + Math.sin(x * 0.033) * 2;
    const bed = g.createLinearGradient(0, s.ground, 0, s.H);
    bed.addColorStop(0, "#2c4842");
    bed.addColorStop(1, "#14272a");
    g.fillStyle = bed;
    g.beginPath();
    g.moveTo(0, s.H);
    for (let x = 0; x <= s.W + 10; x += 10) g.lineTo(x, gravelTop(x));
    g.lineTo(s.W, s.H);
    g.closePath();
    g.fill();

    const count = Math.round((s.W * (s.H - s.ground)) / 60);
    for (let i = 0; i < count; i++) {
      const x = rand(0, s.W);
      const top = gravelTop(x);
      const y = rand(top + 2, s.H);
      const r = rand(2, 5.5);
      g.fillStyle = pick(PEBBLES);
      g.beginPath();
      g.ellipse(x, y, r * 1.25, r, rand(0, 3.14), 0, Math.PI * 2);
      g.fill();
      if (Math.random() < 0.35) {
        g.fillStyle = "rgba(220,240,235,0.12)";
        g.beginPath();
        g.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, Math.PI * 2);
        g.fill();
      }
    }

    // airstone
    g.fillStyle = "#24393a";
    g.beginPath();
    g.ellipse(s.airstone, s.ground + 2, 14, 7, 0, 0, Math.PI * 2);
    g.fill();
  }

  /* ---------- per-frame drawing ---------- */

  function drawPlant(p, t) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    for (const b of p.blades) {
      const base = s.ground + 6;
      const sway = reduceMotion ? 0 : Math.sin(t * 0.001 * p.speed + b.phase) * b.len * 0.08;
      const x0 = p.x + b.off;
      const tipX = x0 + b.lean * b.len * 0.5 + sway;
      const tipY = base - b.len;
      ctx.beginPath();
      ctx.moveTo(x0 - b.width / 2, base);
      ctx.quadraticCurveTo(x0 - b.width / 2 + sway * 0.4 + b.lean * b.len * 0.15, base - b.len * 0.55, tipX, tipY);
      ctx.quadraticCurveTo(x0 + b.width / 2 + sway * 0.4 + b.lean * b.len * 0.15, base - b.len * 0.5, x0 + b.width / 2, base);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function fishPose(f, t) {
    const wob = reduceMotion ? 0 : Math.sin(t * 0.003 + f.wobble) * 5 * f.depth;
    return { x: f.x, y: f.y + wob, scale: f.depth };
  }

  function drawFish(f, t) {
    const { x, y, scale } = fishPose(f, t);
    const flap = reduceMotion ? 0 : Math.sin(t * 0.014 + f.wobble);
    const sz = f.size;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f.dir * scale, scale);
    ctx.globalAlpha = 0.45 + 0.55 * f.depth;

    if (f.kind === "angel") {
      // tall fins
      ctx.fillStyle = "rgba(223,230,228,0.75)";
      ctx.beginPath();
      ctx.moveTo(-sz * 0.2, -sz * 0.5);
      ctx.quadraticCurveTo(-sz * 0.5, -sz * 1.7, -sz * 0.9, -sz * 1.6);
      ctx.quadraticCurveTo(-sz * 0.6, -sz * 0.8, -sz * 0.6, -sz * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-sz * 0.2, sz * 0.5);
      ctx.quadraticCurveTo(-sz * 0.5, sz * 1.7, -sz * 0.9, sz * 1.6);
      ctx.quadraticCurveTo(-sz * 0.6, sz * 0.8, -sz * 0.6, sz * 0.2);
      ctx.closePath();
      ctx.fill();
      // tail
      ctx.beginPath();
      ctx.moveTo(-sz * 0.75, 0);
      ctx.lineTo(-sz * 1.3, -sz * 0.45 + flap * 3);
      ctx.lineTo(-sz * 1.3, sz * 0.45 + flap * 3);
      ctx.closePath();
      ctx.fill();
      // body
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.moveTo(sz * 0.75, 0);
      ctx.quadraticCurveTo(sz * 0.3, -sz * 0.75, -sz * 0.8, 0);
      ctx.quadraticCurveTo(sz * 0.3, sz * 0.75, sz * 0.75, 0);
      ctx.fill();
      ctx.fillStyle = "rgba(30,45,48,0.55)";
      ctx.fillRect(sz * 0.1, -sz * 0.5, sz * 0.12, sz);
      ctx.fillRect(-sz * 0.3, -sz * 0.42, sz * 0.12, sz * 0.84);
    } else if (f.kind === "tetra") {
      ctx.fillStyle = "rgba(200,225,230,0.7)";
      ctx.beginPath();
      ctx.moveTo(-sz * 0.85, 0);
      ctx.lineTo(-sz * 1.45, -sz * 0.4 + flap * 2);
      ctx.lineTo(-sz * 1.45, sz * 0.4 + flap * 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#c9dde0";
      ctx.beginPath();
      ctx.ellipse(0, 0, sz, sz * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e2484d";
      ctx.beginPath();
      ctx.ellipse(-sz * 0.2, sz * 0.12, sz * 0.62, sz * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = f.color;
      ctx.fillRect(-sz * 0.7, -sz * 0.1, sz * 1.3, sz * 0.14);
    } else {
      ctx.fillStyle = f.color;
      // tail
      ctx.beginPath();
      ctx.moveTo(-sz * 0.85, 0);
      ctx.quadraticCurveTo(-sz * 1.3, -sz * 0.2, -sz * 1.6, -sz * 0.55 + flap * 5);
      ctx.quadraticCurveTo(-sz * 1.35, 0, -sz * 1.6, sz * 0.55 + flap * 5);
      ctx.quadraticCurveTo(-sz * 1.3, sz * 0.2, -sz * 0.85, 0);
      ctx.fill();
      // dorsal fin
      ctx.beginPath();
      ctx.moveTo(sz * 0.2, -sz * 0.5);
      ctx.quadraticCurveTo(-sz * 0.2, -sz * 0.95, -sz * 0.55, -sz * 0.45);
      ctx.closePath();
      ctx.fill();
      // body
      ctx.beginPath();
      ctx.ellipse(0, 0, sz, sz * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
      // belly shine
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.ellipse(sz * 0.1, sz * 0.18, sz * 0.6, sz * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // eye
    ctx.fillStyle = "#0b1d22";
    ctx.beginPath();
    ctx.arc(sz * (f.kind === "tetra" ? 0.6 : 0.5), -sz * 0.08, Math.max(1.4, sz * 0.09), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function updateFish(f, dt) {
    f.x += f.dir * f.speed * dt * speedScale * (f.burst ? 3 : 1);
    if (f.burst) f.burst = Math.max(0, f.burst - dt);
    f.y += (f.ty - f.y) * Math.min(1, dt * 0.4);
    if (Math.random() < dt * 0.08) f.ty = rand(s.H * 0.15, s.ground - 50);
    const margin = 60 + f.size * 2;
    if ((f.dir === 1 && f.x > s.W + margin) || (f.dir === -1 && f.x < -margin)) {
      f.dir *= -1;
      f.ty = rand(s.H * 0.15, s.ground - 50);
      f.y = f.ty;
    }
  }

  function drawBubbles(dt, t) {
    if (!reduceMotion && Math.random() < dt * 4) s.bubbles.push(makeBubble(true));
    ctx.lineWidth = 1;
    for (let i = s.bubbles.length - 1; i >= 0; i--) {
      const b = s.bubbles[i];
      b.y -= b.speed * dt * speedScale;
      const bx = b.x + Math.sin(t * 0.003 + b.wobble) * (b.stone ? 4 : 7);
      if (b.y < -10) {
        if (b.stone) s.bubbles.splice(i, 1);
        else { b.y = s.ground; b.x = rand(0, s.W); }
        continue;
      }
      ctx.strokeStyle = "rgba(225,247,245,0.45)";
      ctx.beginPath();
      ctx.arc(bx, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(bx - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLight(t) {
    for (let i = 0; i < 4; i++) {
      const sway = reduceMotion ? 0 : Math.sin(t * 0.0004 + i * 1.7) * 50;
      const x = s.W * (0.12 + i * 0.24) + sway;
      const grad = ctx.createLinearGradient(0, 0, 0, s.ground);
      grad.addColorStop(0, "rgba(210,245,240,0.09)");
      grad.addColorStop(1, "rgba(210,245,240,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 60 + i * 8, 0);
      ctx.lineTo(x - 30 + i * 10, s.ground);
      ctx.lineTo(x - 130 + i * 6, s.ground);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGlass() {
    const g = ctx.createLinearGradient(0, 0, s.W * 0.25, 0);
    g.addColorStop(0, "rgba(255,255,255,0.06)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s.W * 0.25, s.H);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.W * 0.04, 0);
    ctx.lineTo(s.W * 0.015, s.H);
    ctx.stroke();
  }

  /* ---------- public ---------- */

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width));
    const H = Math.max(1, Math.round(rect.height));
    const changed = W !== s.W || H !== s.H;
    s.W = W; s.H = H;
    canvas.width = W * s.DPR;
    canvas.height = H * s.DPR;
    ctx.setTransform(s.DPR, 0, 0, s.DPR, 0, 0);
    s.ground = H - Math.min(110, Math.max(54, H * 0.1));
    s.airstone = W * 0.86;
    if (changed) {
      paintStatic();
      s.backPlants = makePlants(Math.max(4, Math.round(W / 220)), 0.6);
      s.frontPlants = makePlants(Math.max(2, Math.round(W / 420)), 1);
      s.fish = makeFish(s.targetFish);
      s.bubbles = Array.from({ length: 10 }, () => makeBubble(false));
    }
  }

  function setFishCount(n) {
    s.targetFish = n;
    if (s.fish.length < n) s.fish = s.fish.concat(makeFish(n - s.fish.length));
    else if (s.fish.length > n) s.fish.length = n;
  }

  function fishAt(x, y, t) {
    for (let i = s.fish.length - 1; i >= 0; i--) {
      const f = s.fish[i];
      const p = fishPose(f, t);
      const rx = f.size * 1.2 * p.scale + 6;
      const ry = f.size * 0.75 * p.scale + 6;
      const dx = (x - p.x) / rx;
      const dy = (y - p.y) / ry;
      if (dx * dx + dy * dy <= 1) return f;
    }
    return null;
  }

  function draw(t, dt) {
    if (!s.W) return;
    ctx.drawImage(s.staticLayer, 0, 0, s.W, s.H);
    drawLight(t);
    for (const p of s.backPlants) drawPlant(p, t);
    const ordered = [...s.fish].sort((a, b) => a.depth - b.depth);
    for (const f of ordered) { updateFish(f, dt); drawFish(f, t); }
    drawBubbles(dt, t);
    for (const p of s.frontPlants) drawPlant(p, t);
    drawGlass();
  }

  resize();
  return { ctx, state: s, draw, resize, setFishCount, fishAt };
}
