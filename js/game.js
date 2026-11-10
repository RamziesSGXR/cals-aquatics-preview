/* ------------------------------------------------------------------
   "Scrub the glass" — tap algae before it fogs the tank.
   Each level brings more algae and more fish. Clear the owner's
   chosen level to unlock the discount code; keep going for a high
   score until the water clarity runs out.
------------------------------------------------------------------- */
import { createTank } from "./tank.js";

const rand = (a, b) => a + Math.random() * (b - a);

export const levelThreshold = (level) =>
  level <= 1 ? 0 : Math.round(40 * (level - 1) ** 1.5 + 80 * (level - 1));

export const difficulty = (level) => ({
  spawnMs: Math.max(300, 1250 - (level - 1) * 140),
  maxAlgae: Math.min(16, 3 + level),
  fish: Math.min(18, 4 + (level - 1) * 2),
  drain: 0.9 * (1 + 0.07 * (level - 1)), // clarity lost per second for each patch on the glass
});

const CLEAN_RESTORE = 2.5;     // clarity gained per patch scrubbed
const FISH_PENALTY = 4;

function readJSON(key) {
  try { return JSON.parse(window.localStorage.getItem(key) || "null"); } catch { return null; }
}
function writeJSON(key, v) {
  try { window.localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

export function getWonCode() {
  return readJSON("cpa_won");
}

export function initGame(root, getSettings, { onUseCode } = {}) {
  const $ = (sel) => root.querySelector(sel);
  const canvas = $("#gameCanvas");
  const sponge = $(".sponge");
  const ui = {
    level: $("#hudLevel"), xp: $("#hudXp"), goal: $("#hudGoal"),
    clarity: $("#hudClarity"), score: $("#hudScore"), best: $("#hudBest"),
    toast: $("#gameToast"),
    start: $("#gameStart"), win: $("#gameWin"), over: $("#gameOver"),
  };

  let tank = null;
  let state = "closed"; // closed | intro | playing | paused | over
  let algae = [];
  let particles = [];
  let score = 0, level = 1, clarity = 100;
  let spawnTimer = 0;
  let wonThisRun = false;
  let best = Number(readJSON("cpa_best")) || 0;
  let lastT = 0;
  let rafId = 0;
  let lastFocus = null;
  let toastTimer = 0;

  ui.best.textContent = best;

  /* ---------- helpers ---------- */

  const discount = () => getSettings().discount || {};
  const discountOn = () => Boolean(discount().enabled && discount().code);
  const winLevel = () => Math.min(10, Math.max(2, Number(discount().winLevel) || 5));

  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 1300);
  }

  function show(card) {
    for (const c of [ui.start, ui.win, ui.over]) c.hidden = c !== card;
    if (card) card.querySelector("button")?.focus();
  }

  function updateHud() {
    const lo = levelThreshold(level);
    const hi = levelThreshold(level + 1);
    ui.level.textContent = `Level ${level}`;
    ui.xp.style.width = `${Math.min(100, ((score - lo) / (hi - lo)) * 100)}%`;
    ui.score.textContent = score;
    ui.clarity.style.width = `${clarity}%`;
    ui.clarity.parentElement.classList.toggle("low", clarity < 30);
    if (score > best) {
      best = score;
      ui.best.textContent = best;
      writeJSON("cpa_best", best);
    }
    if (discountOn() && !wonThisRun) {
      ui.goal.textContent = `Clear level ${winLevel()} to win ${discount().offer || "a discount"}`;
    } else {
      ui.goal.textContent = "Keep the water clear for a high score";
    }
  }

  function applyLevel() {
    tank.setFishCount(difficulty(level).fish);
  }

  function spawnAlgae() {
    const d = difficulty(level);
    if (algae.length >= d.maxAlgae) return;
    const { W, ground } = tank.state;
    const pad = 50;
    const hud = root.querySelector(".game-hud").getBoundingClientRect().bottom;
    const topSafe = Math.min(ground - 80, hud + 36); // keep clear of the HUD
    algae.push({
      x: rand(pad, W - pad),
      y: rand(topSafe, ground - 30),
      r: 5, target: rand(17, 30), age: 0,
      seed: Math.random() * 10,
    });
  }

  function drawAlgae(ctx, a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    const old = a.age > 5;
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + a.seed;
      const rr = a.r * (0.55 + 0.25 * Math.sin(i * 2.1 + a.seed));
      ctx.fillStyle = old ? "rgba(74,112,38,0.92)" : "rgba(118,170,62,0.85)";
      ctx.beginPath();
      ctx.ellipse(Math.cos(ang) * a.r * 0.45, Math.sin(ang) * a.r * 0.45, rr * 0.7, rr * 0.5, ang, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = old ? "rgba(58,90,30,0.95)" : "rgba(92,140,45,0.95)";
    ctx.beginPath();
    ctx.arc(0, 0, a.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(200,235,150,0.25)";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(Math.cos(a.seed + i * 1.6) * a.r * 0.4, Math.sin(a.seed + i * 1.6) * a.r * 0.4, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function burst(x, y) {
    for (let i = 0; i < 12; i++) {
      particles.push({ x, y, vx: rand(-90, 90), vy: rand(-140, -20), life: 1, r: rand(1.5, 3.5),
        color: Math.random() < 0.5 ? "rgba(220,250,245,0.9)" : "rgba(150,205,95,0.9)" });
    }
  }

  let audio = null;
  function pop(freq = 560) {
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq + rand(-60, 60), audio.currentTime);
      o.frequency.exponentialRampToValueAtTime(180, audio.currentTime + 0.12);
      g.gain.setValueAtTime(0.05, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.13);
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + 0.14);
    } catch {}
  }

  /* ---------- game flow ---------- */

  function reset() {
    algae = []; particles = [];
    score = 0; level = 1; clarity = 100; spawnTimer = 0; wonThisRun = false;
    applyLevel();
    updateHud();
  }

  function startPlaying() {
    reset();
    show(null);
    state = "playing";
    canvas.focus({ preventScroll: true });
  }

  function levelUp(newLevel) {
    level = newLevel;
    applyLevel();
    if (discountOn() && !wonThisRun && level > winLevel()) {
      wonThisRun = true;
      const d = discount();
      writeJSON("cpa_won", { code: d.code, offer: d.offer, at: Date.now() });
      $("#winCode").textContent = d.code;
      $("#winOffer").textContent = d.offer || "a discount";
      $("#winLevel").textContent = winLevel();
      $("#copyNote").textContent = "";
      state = "paused";
      show(ui.win);
    } else {
      toast(`Level ${level}: more algae, more fish`);
    }
  }

  function gameOver() {
    state = "over";
    $("#overScore").textContent = score;
    $("#overBest").textContent = best;
    const won = getWonCode();
    const reminder = $("#overCode");
    if (discountOn() && won && won.code === discount().code) {
      reminder.hidden = false;
      reminder.querySelector("strong").textContent = won.code;
    } else {
      reminder.hidden = true;
    }
    show(ui.over);
  }

  function scrubAt(x, y, t) {
    sponge.classList.remove("scrub");
    void sponge.offsetWidth;
    sponge.classList.add("scrub");
    if (state !== "playing") return;

    for (let i = algae.length - 1; i >= 0; i--) {
      const a = algae[i];
      if (Math.hypot(a.x - x, a.y - y) <= a.r + 14) {
        algae.splice(i, 1);
        score += Math.round(6 + a.r * 0.6);
        clarity = Math.min(100, clarity + CLEAN_RESTORE);
        burst(a.x, a.y);
        pop();
        let next = level;
        while (score >= levelThreshold(next + 1)) next++;
        if (next !== level) levelUp(next);
        updateHud();
        return;
      }
    }
    const fish = tank.fishAt(x, y, t);
    if (fish) {
      fish.burst = 0.6;
      fish.dir *= -1;
      clarity = Math.max(0, clarity - FISH_PENALTY);
      pop(260);
      toast("Careful, that's a fish!");
      updateHud();
    }
  }

  /* ---------- loop ---------- */

  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    const ctx = tank.ctx;
    tank.draw(t, state === "paused" ? 0 : dt);

    if (state === "playing") {
      spawnTimer += dt * 1000;
      if (spawnTimer >= difficulty(level).spawnMs) { spawnTimer = 0; spawnAlgae(); }
      let drain = 0;
      for (const a of algae) {
        a.age += dt;
        if (a.r < a.target) a.r = Math.min(a.target, a.r + dt * 9);
        if (a.age > 1) drain += difficulty(level).drain;
      }
      clarity = Math.max(0, clarity - drain * dt);
      ui.clarity.style.width = `${clarity}%`;
      ui.clarity.parentElement.classList.toggle("low", clarity < 30);
      if (clarity <= 0) gameOver();
    }

    // murky haze as clarity drops
    const haze = (100 - clarity) / 100;
    if (haze > 0.02) {
      ctx.fillStyle = `rgba(88,120,52,${haze * 0.55})`;
      ctx.fillRect(0, 0, tank.state.W, tank.state.H);
    }
    for (const a of algae) drawAlgae(ctx, a);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.life -= dt * 1.8;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (state !== "closed") rafId = requestAnimationFrame(frame);
  }

  /* ---------- open / close ---------- */

  function open() {
    if (state !== "closed") return;
    lastFocus = document.activeElement;
    root.hidden = false;
    document.documentElement.classList.add("game-open");
    tank ??= createTank(canvas, { fishCount: 4 });
    tank.resize();
    reset();
    const d = discount();
    $("#startGoal").textContent = discountOn()
      ? `Clear level ${winLevel()} and you'll get a code for ${d.offer || "a discount"}.`
      : "Keep the water clear as long as you can and chase a high score.";
    state = "intro";
    show(ui.start);
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function close() {
    state = "closed";
    cancelAnimationFrame(rafId);
    root.hidden = true;
    document.documentElement.classList.remove("game-open");
    lastFocus?.focus?.();
  }

  /* ---------- input ---------- */

  root.addEventListener("pointermove", (e) => {
    sponge.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  });
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    sponge.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    scrubAt(e.clientX, e.clientY, performance.now());
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  window.addEventListener("resize", () => { if (state !== "closed") tank.resize(); });

  root.querySelectorAll("[data-game-close]").forEach((b) => b.addEventListener("click", close));
  root.querySelectorAll("[data-game-start]").forEach((b) => b.addEventListener("click", startPlaying));
  $("#keepGoing").addEventListener("click", () => { show(null); state = "playing"; });
  $("#copyCode").addEventListener("click", async () => {
    const code = discount().code;
    try {
      await navigator.clipboard.writeText(code);
      $("#copyNote").textContent = "Copied.";
    } catch {
      $("#copyNote").textContent = `Your code is ${code}`;
    }
  });
  root.querySelectorAll("[data-use-code]").forEach((b) =>
    b.addEventListener("click", () => {
      close();
      onUseCode?.(discount().code);
    })
  );

  // Lets automated balance tests read the game state (only with ?gametest in the URL).
  if (location.search.includes("gametest")) {
    window.__tankGame = () => ({ state, score, level, clarity, algae: algae.map((a) => ({ x: a.x, y: a.y, r: a.r })) });
  }

  return { open, close };
}
