/* ------------------------------------------------------------------
   Public pages: fills in owner-editable content, runs the hero tank,
   the availability calendar, the request form, and the game.
------------------------------------------------------------------- */
import { cachedSettings, cachedAvailability, loadSettings, loadAvailability, submitRequest } from "./store.js";
import { createTank } from "./tank.js";
import { initGame, getWonCode } from "./game.js";
import {
  MONTHS, WEEKDAYS_SHORT, monthGrid, dayStatus, todayKey, fromKey, addDays,
  formatDateLong, formatDateShort, formatRange,
} from "./calendar.js";

let settings = cachedSettings();
let availability = cachedAvailability();

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------------- content from the dashboard ---------------- */

function telHref(phone) {
  const digits = String(phone).replace(/\D/g, "");
  return `+${digits.length === 10 ? "1" + digits : digits}`;
}

const firstName = () => String(settings.business.owner || "Cal").split(" ")[0];

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join("");
}

function paragraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function applySettings() {
  const b = settings.business;
  $$("[data-phone]").forEach((el) => (el.textContent = b.phone));
  $$("[data-tel]").forEach((el) => (el.href = `tel:${telHref(b.phone)}`));
  $$("[data-sms]").forEach((el) => (el.href = `sms:${telHref(b.phone)}`));
  $$("[data-email]").forEach((el) => (el.textContent = b.email));
  $$("[data-mailto]").forEach((el) => (el.href = `mailto:${b.email}`));
  $$("[data-hours]").forEach((el) => (el.textContent = b.hoursText));
  $$("[data-yelp]").forEach((el) => (el.href = b.yelpUrl));
  $$("[data-facebook]").forEach((el) => (el.href = b.facebookUrl));
  $$("[data-owner]").forEach((el) => (el.textContent = b.owner));
  $$("[data-owner-first]").forEach((el) => (el.textContent = firstName()));

  // announcement
  const bar = $("#announce");
  if (bar) {
    const on = settings.announcement.enabled && settings.announcement.text.trim();
    bar.hidden = !on;
    if (on) $("#announceText").textContent = settings.announcement.text.trim();
  }

  // discount
  const d = settings.discount;
  const discountOn = Boolean(d.enabled && d.code);
  $$("[data-if-discount]").forEach((el) => (el.hidden = !discountOn));
  $$("[data-if-no-discount]").forEach((el) => (el.hidden = discountOn));
  $$("[data-discount-offer]").forEach((el) => (el.textContent = d.offer));
  $$("[data-discount-level]").forEach((el) => (el.textContent = d.winLevel));

  // about
  const paras = paragraphs(settings.about.bio);
  const bio = $("#bio");
  if (bio && paras.length) {
    bio.replaceChildren(...paras.map((t) => Object.assign(document.createElement("p"), { textContent: t })));
  }
  const first = $("[data-bio-first]");
  if (first && paras.length) first.textContent = paras[0];

  const facts = $("#facts");
  if (facts) {
    const list = (settings.about.facts || []).filter((f) => f.label?.trim() && f.value?.trim());
    facts.replaceChildren(
      ...list.flatMap((f) => [
        Object.assign(document.createElement("dt"), { textContent: f.label }),
        Object.assign(document.createElement("dd"), { textContent: f.value }),
      ])
    );
    facts.hidden = !list.length;
  }

  $$("[data-portrait]").forEach((fig) => {
    const url = settings.about.photoUrl?.trim();
    const img = $("img", fig);
    const mono = $(".monogram", fig);
    if (mono) mono.textContent = initials(b.owner);
    const showMonogram = () => {
      img.hidden = true;
      if (mono) mono.hidden = false;
      fig.classList.remove("has-photo");
    };
    if (url) {
      if (url !== "images/cameron.jpg") $("source", fig)?.remove();
      img.onerror = showMonogram;
      if (img.getAttribute("src") !== url) img.src = url;
      img.alt = `${b.owner}, owner of ${b.name}`;
      img.hidden = false;
      if (mono) mono.hidden = true;
      fig.classList.add("has-photo");
    } else {
      showMonogram();
    }
  });

  fillCodeFromGame();
}

/* ---------------- nav ---------------- */

function initNav() {
  const nav = $(".site-nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("solid", window.scrollY > 30 || !nav.dataset.overHero);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const toggle = $(".nav-toggle");
  const menu = $("#navMenu");
  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("menu-open", open);
  });
  menu?.addEventListener("click", (e) => {
    if (e.target.closest("a")) {
      toggle?.setAttribute("aria-expanded", "false");
      nav.classList.remove("menu-open");
    }
  });
}

/* ---------------- hero tank ---------------- */

function initHeroTank() {
  const canvas = $("#heroTank");
  if (!canvas) return;
  const preset = Number(canvas.dataset.fish);
  const tank = createTank(canvas, { fishCount: preset || (window.innerWidth < 700 ? 6 : 11) });
  let visible = true;
  let last = performance.now();
  new IntersectionObserver(([entry]) => (visible = entry.isIntersecting)).observe(canvas);
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => tank.resize(), 120);
  });
  const loop = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (visible) tank.draw(t, dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ---------------- availability calendar ---------------- */

const cal = { year: 0, month: 0, selected: null };

const STATUS_LABEL = {
  open: "Open",
  limited: "Partly booked",
  booked: "Booked",
  closed: "Closed",
  soon: "Too soon to book",
  past: "Past",
  beyond: "Not open for booking yet",
};

function calendarBounds() {
  const today = todayKey();
  const last = addDays(today, Number(settings.booking.weeksAhead || 8) * 7);
  const t = fromKey(today), l = fromKey(last);
  return { min: t.getFullYear() * 12 + t.getMonth(), max: l.getFullYear() * 12 + l.getMonth() };
}

function renderCalendar() {
  const root = $("#publicCal");
  if (!root) return;
  const { min, max } = calendarBounds();
  const idx = cal.year * 12 + cal.month;
  $("#calMonth").textContent = `${MONTHS[cal.month]} ${cal.year}`;
  $("#calPrev").disabled = idx <= min;
  $("#calNext").disabled = idx >= max;

  const grid = $("#calGrid");
  const today = todayKey();
  const rows = monthGrid(cal.year, cal.month).map((week) => {
    const tr = document.createElement("div");
    tr.className = "cal-week";
    tr.setAttribute("role", "row");
    for (const key of week) {
      const cell = document.createElement("div");
      cell.setAttribute("role", "gridcell");
      if (!key) {
        cell.className = "cal-cell empty";
      } else {
        const { status } = dayStatus(availability, settings.booking, key, today);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `cal-day is-${status}`;
        btn.textContent = fromKey(key).getDate();
        btn.dataset.date = key;
        btn.setAttribute("aria-label", `${formatDateLong(key)}: ${STATUS_LABEL[status]}`);
        if (key === today) btn.classList.add("is-today");
        if (key === cal.selected) btn.setAttribute("aria-pressed", "true");
        const bookable = status === "open" || status === "limited";
        btn.disabled = !bookable && status !== "booked" && status !== "closed";
        cell.className = "cal-cell";
        cell.append(btn);
      }
      tr.append(cell);
    }
    return tr;
  });
  grid.replaceChildren(...rows);
  renderDetail();
}

function renderDetail() {
  const box = $("#calDetail");
  if (!box) return;
  if (!cal.selected) {
    box.innerHTML = `<p class="detail-empty">Choose a day to see open times.</p>`;
    return;
  }
  const { status, windows } = dayStatus(availability, settings.booking, cal.selected);
  const title = document.createElement("h3");
  title.textContent = formatDateLong(cal.selected);
  const body = document.createElement("div");

  if (status === "open" || status === "limited") {
    const p = document.createElement("p");
    p.textContent = status === "open" ? "Open all day. Pick a time window:" : "Partly booked. Still open:";
    const list = document.createElement("div");
    list.className = "slot-list";
    for (const w of windows) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.textContent = formatRange(w);
      b.addEventListener("click", () => chooseDay(cal.selected, formatRange(w)));
      list.append(b);
    }
    const any = document.createElement("button");
    any.type = "button";
    any.className = "slot slot-any";
    any.textContent = "Any time that day";
    any.addEventListener("click", () => chooseDay(cal.selected, "Any time"));
    list.append(any);
    body.append(p, list);
  } else {
    const p = document.createElement("p");
    p.textContent =
      status === "closed"
        ? `${firstName()} isn't scheduling cleanings on this day.`
        : "This day is fully booked. Try another day, or text to ask about a waitlist spot.";
    body.append(p);
  }
  box.replaceChildren(title, body);
}

function chooseDay(key, time) {
  const form = $("#requestForm");
  if (!form) return;
  form.elements.day.value = key;
  form.elements.time.value = time;
  updateChosenDay();
  $("#contact").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  setTimeout(() => form.elements.name.focus({ preventScroll: true }), 500);
}

function initCalendar() {
  const root = $("#publicCal");
  if (!root) return;
  const t = fromKey(todayKey());
  cal.year = t.getFullYear();
  cal.month = t.getMonth();
  $("#calWeekdays").replaceChildren(
    ...WEEKDAYS_SHORT.map((d) => Object.assign(document.createElement("div"), { textContent: d, role: "columnheader" }))
  );
  $("#calPrev").addEventListener("click", () => {
    cal.month--; if (cal.month < 0) { cal.month = 11; cal.year--; }
    renderCalendar();
  });
  $("#calNext").addEventListener("click", () => {
    cal.month++; if (cal.month > 11) { cal.month = 0; cal.year++; }
    renderCalendar();
  });
  $("#calGrid").addEventListener("click", (e) => {
    const btn = e.target.closest(".cal-day");
    if (!btn || btn.disabled) return;
    cal.selected = btn.dataset.date;
    renderCalendar();
    $("#calDetail").focus({ preventScroll: true });
  });
  renderCalendar();
}

/* ---------------- request form ---------------- */

function updateChosenDay() {
  const form = $("#requestForm");
  const chip = $("#chosenDay");
  if (!form || !chip) return;
  const day = form.elements.day.value;
  if (day) {
    chip.hidden = false;
    $("#chosenDayText").textContent = `${formatDateShort(day)}${form.elements.time.value ? `, ${form.elements.time.value}` : ""}`;
  } else {
    chip.hidden = true;
  }
}

function fillCodeFromGame() {
  const form = $("#requestForm");
  if (!form) return;
  const won = getWonCode();
  const d = settings.discount;
  if (d.enabled && won && won.code === d.code && !form.elements.code.value) {
    form.elements.code.value = won.code;
  }
}

function composeMessage(form) {
  const f = form.elements;
  const lines = [`Hi ${firstName()}, I'd like to request a cleaning.`, ""];
  lines.push(`Name: ${f.name.value.trim()}`);
  lines.push(`Best way to reach me: ${f.contact.value.trim()}`);
  const tank = [f.kind.value, f.water.value !== "Not sure" ? f.water.value : "", f.size.value.trim() ? `about ${f.size.value.trim()}` : ""]
    .filter(Boolean)
    .join(", ");
  if (tank) lines.push(`What needs cleaning: ${tank}`);
  if (f.city.value) lines.push(`City: ${f.city.value}`);
  if (f.day.value) lines.push(`Preferred day: ${formatDateLong(f.day.value)}${f.time.value ? ` (${f.time.value})` : ""}`);
  if (f.code.value.trim()) lines.push(`Discount code: ${f.code.value.trim().toUpperCase()}`);
  if (f.notes.value.trim()) lines.push("", f.notes.value.trim());
  return lines.join("\n");
}

function initForm() {
  const form = $("#requestForm");
  if (!form) return;
  const error = $("#formError");

  $("#clearDay")?.addEventListener("click", () => {
    form.elements.day.value = "";
    form.elements.time.value = "";
    updateChosenDay();
  });

  const validate = () => {
    const missing = [];
    if (!form.elements.name.value.trim()) missing.push(form.elements.name);
    if (!form.elements.contact.value.trim()) missing.push(form.elements.contact);
    for (const el of [form.elements.name, form.elements.contact]) el.setAttribute("aria-invalid", String(missing.includes(el)));
    if (missing.length) {
      error.textContent = `Add your name and a phone number or email so ${firstName()} can reach you.`;
      error.hidden = false;
      missing[0].focus();
      return false;
    }
    error.hidden = true;
    return true;
  };

  // Save a copy to the owner's dashboard inbox (once per unique request),
  // then open the visitor's text or email app so the owner is notified right away.
  let lastSaved = "";
  const saveCopy = async (via) => {
    const f = form.elements;
    if (f.website.value) return; // spam trap: real people never fill this hidden field
    const data = {
      name: f.name.value, contact: f.contact.value, kind: f.kind.value, water: f.water.value,
      size: f.size.value, city: f.city.value, day: f.day.value, time: f.time.value,
      code: f.code.value.toUpperCase(), notes: f.notes.value, via,
    };
    const key = JSON.stringify({ ...data, via: "" });
    if (key === lastSaved) return;
    try {
      // Don't keep the visitor waiting if the connection is slow.
      await Promise.race([submitRequest(data), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 2500))]);
      lastSaved = key;
    } catch (err) {
      console.warn("Request copy not saved:", err);
    }
  };

  $$("[data-send]", form).forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!validate()) return;
      const message = composeMessage(form);
      const b = settings.business;
      const via = btn.dataset.send === "sms" ? "text" : "email";
      btn.disabled = true;
      await saveCopy(via);
      btn.disabled = false;
      if (via === "text") {
        window.location.href = `sms:${telHref(b.phone)}?&body=${encodeURIComponent(message)}`;
      } else {
        const subject = `Cleaning request from ${form.elements.name.value.trim()}`;
        window.location.href = `mailto:${b.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      }
      $("#formSent").hidden = false;
    })
  );

  // Put the text option first on phones.
  if (matchMedia("(pointer: coarse)").matches) {
    const row = $(".send-row", form);
    const sms = $('[data-send="sms"]', form);
    const email = $('[data-send="email"]', form);
    sms.classList.replace("btn-outline", "btn-primary");
    email.classList.replace("btn-primary", "btn-outline");
    row.prepend(sms);
  }
  updateChosenDay();
}

/* ---------------- game ---------------- */

function initGameHooks() {
  const root = $("#game");
  if (!root) return;
  const game = initGame(root, () => settings, {
    onUseCode: (code) => {
      const form = $("#requestForm");
      if (form) form.elements.code.value = code;
      $("#contact").scrollIntoView();
      form?.elements.name.focus({ preventScroll: true });
    },
  });
  $$("[data-play-game]").forEach((b) => b.addEventListener("click", () => game.open()));
  if (location.hash === "#play") game.open();
}

/* ---------------- work gallery ---------------- */

function initGallery() {
  const items = $$(".g-item");
  const box = $("#lightbox");
  if (!items.length || !box || typeof box.showModal !== "function") return;
  const img = $("#lbImg"), cap = $("#lbCap");
  let index = 0;
  const show = (i) => {
    index = (i + items.length) % items.length;
    const it = items[index];
    const thumb = $("img", it);
    img.src = it.dataset.full;
    img.width = Number(it.dataset.w);
    img.height = Number(it.dataset.h);
    img.alt = thumb.alt;
    cap.textContent = `${$(".g-cap", it).textContent}  (${index + 1} of ${items.length})`;
  };
  items.forEach((it, i) => it.addEventListener("click", () => { show(i); box.showModal(); }));
  $("#lbPrev").addEventListener("click", () => show(index - 1));
  $("#lbNext").addEventListener("click", () => show(index + 1));
  $("#lbClose").addEventListener("click", () => box.close());
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
  box.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(index - 1);
    if (e.key === "ArrowRight") show(index + 1);
  });
  box.addEventListener("close", () => items[index].focus());
  let startX = null;
  box.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX), { passive: true });
  box.addEventListener("touchend", (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    startX = null;
  });
}

/* ---------------- boot ---------------- */

function boot() {
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
  applySettings();
  initNav();
  initHeroTank();
  initCalendar();
  initForm();
  initGallery();
  initGameHooks();

  Promise.all([loadSettings(), loadAvailability()]).then(([s, a]) => {
    settings = s;
    availability = a;
    applySettings();
    renderCalendar();
  });
}

boot();
