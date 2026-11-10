/* ------------------------------------------------------------------
   Owner dashboard
------------------------------------------------------------------- */
import {
  mode, loadSettings, loadAvailability, saveSettings, saveAvailability, resetPreview,
  watchAuth, signIn, signOutOwner, isOwner,
  listRequests, updateRequest, deleteRequest,
} from "./store.js";
import {
  MONTHS, WEEKDAYS, WEEKDAYS_SHORT, TIME_OPTIONS, monthGrid, todayKey, fromKey, addDays,
  toMinutes, toHHMM, formatTime, formatRange, formatDateLong, formatDateShort,
  openWindows, blocksOn, newId, pruneBlocks, dayStatus,
} from "./calendar.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids.filter((k) => k != null));
  return node;
};

let draft = null;      // { settings, availability }
let savedJSON = "";
let currentTab = "overview";
const cal = { year: 0, month: 0, selected: todayKey() };

/* ---------------- dirty tracking ---------------- */

const snapshot = () => JSON.stringify(draft);
const isDirty = () => draft && snapshot() !== savedJSON;

function changed() {
  $("#saveBar").hidden = !isDirty();
  renderOverview();
  renderDiscountPreview();
  renderAnnouncePreview();
}

window.addEventListener("beforeunload", (e) => {
  if (isDirty()) { e.preventDefault(); e.returnValue = ""; }
});

let toastTimer = 0;
function toast(msg, kind = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `admin-toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "admin-toast"), 3200);
}

/* ---------------- simple field bindings ---------------- */

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}

function readField(input) {
  if (input.type === "checkbox") return input.checked;
  if (input.dataset.type === "number") return Number(input.value);
  if (input.dataset.transform === "code") {
    const clean = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean !== input.value) input.value = clean;
    return clean;
  }
  return input.value;
}

function writeField(input, value) {
  if (input.type === "checkbox") input.checked = Boolean(value);
  else input.value = value ?? "";
}

function fillBindings() {
  const root = { settings: draft.settings, availability: draft.availability };
  $$("[data-bind]").forEach((input) => writeField(input, getPath(root, input.dataset.bind)));
  syncDiscountFields();
}

function initBindings() {
  $$("[data-bind]").forEach((input) => {
    const evt = input.type === "checkbox" || input.tagName === "SELECT" ? "change" : "input";
    input.addEventListener(evt, () => {
      setPath(draft, input.dataset.bind, readField(input));
      if (input.dataset.bind.startsWith("settings.booking")) renderCalendar();
      if (input.dataset.bind === "settings.discount.enabled") syncDiscountFields();
      if (input.dataset.bind === "settings.business.owner") $("#hiName").textContent = firstName();
      changed();
    });
  });
}

const firstName = () => String(draft?.settings.business.owner || "there").split(" ")[0];

/* ---------------- tabs ---------------- */

function showTab(name) {
  currentTab = name;
  $$('[role="tab"]').forEach((t) => {
    const on = t.id === `tab-${name}`;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $$('[role="tabpanel"]').forEach((p) => (p.hidden = p.id !== `panel-${name}`));
  try { sessionStorage.setItem("cpa_admin_tab", name); } catch {}
}

function initTabs() {
  const tabs = $$('[role="tab"]');
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => showTab(t.id.replace("tab-", "")));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    });
  });
  let start = "overview";
  try { start = sessionStorage.getItem("cpa_admin_tab") || start; } catch {}
  showTab($(`#tab-${start}`) ? start : "overview");
}

/* ---------------- overview ---------------- */

function statusItem(label, value, tab, tone = "") {
  const btn = el("button", { type: "button", className: "link-btn", textContent: "Edit" });
  btn.addEventListener("click", () => showTab(tab));
  return el("li", { className: tone }, el("span", { className: "status-label", textContent: label }), el("span", { className: "status-value", textContent: value }), btn);
}

function renderOverview() {
  if (!draft) return;
  const { settings: s, availability: a } = draft;
  $("#hiName").textContent = firstName();

  const d = s.discount;
  const discountText = d.enabled && d.code
    ? `On. Clear level ${d.winLevel} to win ${d.offer} with code ${d.code}`
    : "Off. The game is just for high scores";

  const today = todayKey();
  let open = 0, limited = 0, blocked = 0;
  for (let i = 0; i < 14; i++) {
    const key = addDays(today, i);
    const { status } = dayStatus(a, { noticeDays: 0, weeksAhead: 52 }, key, today);
    if (status === "open") open++;
    else if (status === "limited") limited++;
    else if (status === "booked") blocked++;
  }
  const availText = `${open} open, ${limited} partly booked, ${blocked} blocked`;
  const ann = s.announcement;
  const annText = ann.enabled && ann.text.trim() ? `Showing: "${ann.text.trim()}"` : "Off";

  const newCount = requests.filter((r) => r.status === "new").length;
  const reqText = requestsLoaded
    ? (newCount ? `${newCount} new, waiting for a reply` : "No new requests")
    : "Loading…";
  $("#statusList").replaceChildren(
    statusItem("Requests", reqText, "requests", newCount ? "alert" : ""),
    statusItem("Discount", discountText, "discount", d.enabled ? "on" : ""),
    statusItem("Next two weeks", availText, "availability"),
    statusItem("Announcement", annText, "announce", ann.enabled ? "on" : ""),
    statusItem("Phone", s.business.phone, "business"),
  );

  const upcoming = pruneBlocks(a.blocks)
    .sort((x, y) => (x.date + (x.start || "")).localeCompare(y.date + (y.start || "")))
    .slice(0, 6);
  const list = $("#upcoming");
  if (!upcoming.length) {
    list.replaceChildren(el("li", { className: "muted", textContent: "No days blocked off. Every working day is open." }));
  } else {
    list.replaceChildren(
      ...upcoming.map((b) =>
        el("li", {}, el("strong", { textContent: formatDateShort(b.date) }), document.createTextNode(b.allDay ? "Blocked all day" : `Busy ${formatRange([toMinutes(b.start), toMinutes(b.end)])}`))
      )
    );
  }
}

/* ---------------- availability ---------------- */

function adminDayState(key) {
  const a = draft.availability;
  const weekly = a.weekly[fromKey(key).getDay()];
  const blocks = blocksOn(a, key);
  if (blocks.some((b) => b.allDay)) return "blocked";
  if (!weekly.open) return "closed";
  if (blocks.length) return openWindows(a, key).length ? "part" : "blocked";
  return "open";
}

function renderCalendar() {
  if (!draft) return;
  $("#aMonth").textContent = `${MONTHS[cal.month]} ${cal.year}`;
  const today = todayKey();
  const t = fromKey(today);
  $("#aPrev").disabled = cal.year * 12 + cal.month <= t.getFullYear() * 12 + t.getMonth();
  const rows = monthGrid(cal.year, cal.month).map((week) =>
    el("div", { className: "cal-week" }, ...week.map((key) => {
      if (!key) return el("div", { className: "cal-cell empty" });
      const state = adminDayState(key);
      const past = key < today;
      const btn = el("button", {
        type: "button",
        className: `a-day a-${state}${past ? " a-past" : ""}${key === today ? " a-today" : ""}`,
        textContent: fromKey(key).getDate(),
        disabled: past,
      });
      btn.dataset.date = key;
      btn.setAttribute("aria-label", `${formatDateLong(key)}: ${{ open: "open", part: "some hours blocked", blocked: "blocked", closed: "not a work day" }[state]}`);
      if (key === cal.selected) btn.setAttribute("aria-pressed", "true");
      return el("div", { className: "cal-cell" }, btn);
    }))
  );
  $("#aGrid").replaceChildren(...rows);
  renderDayEditor();
}

function timeSelect(value, label) {
  const sel = el("select");
  sel.setAttribute("aria-label", label);
  for (const m of TIME_OPTIONS) sel.append(el("option", { value: toHHMM(m), textContent: formatTime(m), selected: toHHMM(m) === value }));
  return sel;
}

function renderDayEditor() {
  const box = $("#dayEditor");
  const key = cal.selected;
  if (!key || key < todayKey()) {
    box.replaceChildren(el("p", { className: "muted", textContent: "Pick a day on the calendar." }));
    return;
  }
  const a = draft.availability;
  const weekly = a.weekly[fromKey(key).getDay()];
  const blocks = blocksOn(a, key);
  const allDay = blocks.find((b) => b.allDay);

  const head = el("h2", { textContent: formatDateLong(key) });
  const normal = el("p", { className: "muted",
    textContent: weekly.open
      ? `Normal hours: ${formatRange([toMinutes(weekly.start), toMinutes(weekly.end)])}`
      : `${WEEKDAYS[fromKey(key).getDay()]}s are normally not a work day.`,
  });

  const toggle = el("button", {
    type: "button",
    className: allDay ? "btn btn-outline" : "btn btn-primary",
    textContent: allDay ? "Unblock this day" : "Block the whole day",
  });
  toggle.addEventListener("click", () => {
    if (allDay) a.blocks = a.blocks.filter((b) => b !== allDay);
    else a.blocks = a.blocks.filter((b) => b.date !== key).concat({ id: newId(), date: key, allDay: true });
    renderCalendar();
    changed();
  });

  const parts = [head, normal, toggle];

  if (!allDay && weekly.open) {
    const list = el("ul", { className: "busy-list" });
    for (const b of blocks) {
      const rm = el("button", { type: "button", className: "link-btn", textContent: "Remove" });
      rm.addEventListener("click", () => {
        a.blocks = a.blocks.filter((x) => x !== b);
        renderCalendar();
        changed();
      });
      list.append(el("li", {}, el("span", { textContent: `Busy ${formatRange([toMinutes(b.start), toMinutes(b.end)])}` }), rm));
    }
    const startSel = timeSelect(weekly.start, "Busy from");
    const endSel = timeSelect(toHHMM(Math.min(toMinutes(weekly.start) + 180, toMinutes(weekly.end))), "Busy until");
    const add = el("button", { type: "button", className: "btn btn-outline", textContent: "Add busy time" });
    add.addEventListener("click", () => {
      if (toMinutes(endSel.value) <= toMinutes(startSel.value)) {
        toast("The end time needs to be after the start time.", "err");
        return;
      }
      a.blocks.push({ id: newId(), date: key, start: startSel.value, end: endSel.value });
      renderCalendar();
      changed();
    });
    const windows = openWindows(a, key);
    parts.push(
      el("h3", { textContent: "Busy for part of the day?" }),
      list,
      el("div", { className: "busy-add" },
        el("label", {}, el("span", { textContent: "From" }), startSel),
        el("label", {}, el("span", { textContent: "Until" }), endSel),
        add),
      el("p", { className: "customer-sees" },
        el("strong", { textContent: "Customers see: " }),
        document.createTextNode(windows.length ? `open ${windows.map(formatRange).join(", ")}` : "booked")),
    );
  }
  box.replaceChildren(...parts);
}

function renderWeekly() {
  const a = draft.availability;
  const rows = [1, 2, 3, 4, 5, 6, 0].map((i) => {
    const day = a.weekly[i];
    const check = el("input", { type: "checkbox", className: "switch", checked: day.open });
    check.setAttribute("aria-label", `Work on ${WEEKDAYS[i]}s`);
    const start = timeSelect(day.start, `${WEEKDAYS[i]} start`);
    const end = timeSelect(day.end, `${WEEKDAYS[i]} end`);
    const times = el("div", { className: "weekly-times" }, start, el("span", { textContent: "to" }), end);
    times.classList.toggle("off", !day.open);
    check.addEventListener("change", () => {
      day.open = check.checked;
      times.classList.toggle("off", !day.open);
      renderCalendar(); changed();
    });
    const onTime = () => {
      if (toMinutes(end.value) <= toMinutes(start.value)) {
        toast("Closing time needs to be after opening time.", "err");
        start.value = day.start; end.value = day.end;
        return;
      }
      day.start = start.value; day.end = end.value;
      renderCalendar(); changed();
    };
    start.addEventListener("change", onTime);
    end.addEventListener("change", onTime);
    return el("div", { className: "weekly-row" }, el("label", { className: "weekly-day" }, check, el("span", { textContent: WEEKDAYS[i] })), times);
  });
  $("#weekly").replaceChildren(...rows);
}

function initAvailability() {
  const t = fromKey(todayKey());
  cal.year = t.getFullYear();
  cal.month = t.getMonth();
  $("#aWeekdays").replaceChildren(...WEEKDAYS_SHORT.map((d) => el("div", { textContent: d })));
  $("#aPrev").addEventListener("click", () => { cal.month--; if (cal.month < 0) { cal.month = 11; cal.year--; } renderCalendar(); });
  $("#aNext").addEventListener("click", () => { cal.month++; if (cal.month > 11) { cal.month = 0; cal.year++; } renderCalendar(); });
  $("#aGrid").addEventListener("click", (e) => {
    const b = e.target.closest(".a-day");
    if (!b || b.disabled) return;
    cal.selected = b.dataset.date;
    renderCalendar();
  });

  const from = $("#rangeFrom"), to = $("#rangeTo");
  from.min = to.min = todayKey();
  from.addEventListener("change", () => { to.min = from.value || todayKey(); if (!to.value || to.value < from.value) to.value = from.value; });
  $("#rangeBlock").addEventListener("click", () => {
    if (!from.value || !to.value) { toast("Pick a start and end date.", "err"); return; }
    if (to.value < from.value) { toast("The end date is before the start date.", "err"); return; }
    let count = 0;
    const a = draft.availability;
    for (let k = from.value; k <= to.value; k = addDays(k, 1)) {
      a.blocks = a.blocks.filter((b) => b.date !== k);
      a.blocks.push({ id: newId(), date: k, allDay: true });
      count++;
      if (count > 366) break;
    }
    const f = fromKey(from.value);
    cal.year = f.getFullYear(); cal.month = f.getMonth(); cal.selected = from.value;
    renderCalendar(); changed();
    toast(`${count} day${count === 1 ? "" : "s"} blocked. Save to publish.`);
    from.value = ""; to.value = "";
  });
}

/* ---------------- discount ---------------- */

function syncDiscountFields() {
  $("#discountFields").classList.toggle("off", !draft.settings.discount.enabled);
}

function renderDiscountPreview() {
  if (!draft) return;
  const d = draft.settings.discount;
  $("#discountPreview").textContent = d.enabled
    ? `Visitors see: "Clear level ${d.winLevel} and win ${d.offer || "…"}." Winners get the code ${d.code || "…"}.`
    : `Visitors see: "Scrub the glass and chase a high score."`;
}

/* ---------------- about ---------------- */

const FACT_IDEAS = ["Keeping fish since", "First tank", "Tanks at home", "Favorite fish", "Specialty", "Fun fact"];

function renderFacts() {
  const facts = draft.settings.about.facts;
  const rows = facts.map((f, i) => {
    const label = el("input", { value: f.label, placeholder: "Label", maxLength: 40 });
    label.setAttribute("aria-label", `Fact ${i + 1} label`);
    const value = el("input", { value: f.value, placeholder: "What to show", maxLength: 80 });
    value.setAttribute("aria-label", `Fact ${i + 1} value`);
    label.addEventListener("input", () => { f.label = label.value; changed(); });
    value.addEventListener("input", () => { f.value = value.value; changed(); });
    const rm = el("button", { type: "button", className: "link-btn", textContent: "Remove" });
    rm.addEventListener("click", () => { facts.splice(i, 1); renderFacts(); changed(); });
    return el("div", { className: "fact-row" }, label, value, rm);
  });
  $("#factsEditor").replaceChildren(...rows);

  const used = new Set(facts.map((f) => f.label));
  const sugg = $("#factSuggest");
  sugg.replaceChildren(el("span", { textContent: facts.length >= 8 ? "That's plenty of facts." : "Add:" }));
  if (facts.length < 8) {
    for (const idea of [...FACT_IDEAS.filter((i) => !used.has(i)), "Something else"]) {
      const b = el("button", { type: "button", className: "chip-btn", textContent: idea });
      b.addEventListener("click", () => {
        facts.push({ label: idea === "Something else" ? "" : idea, value: "" });
        renderFacts(); changed();
        $$("#factsEditor .fact-row").at(-1)?.querySelector(idea === "Something else" ? "input" : "input:nth-child(2)")?.focus();
      });
      sugg.append(b);
    }
  }
}

/* ---------------- announcement ---------------- */

function renderAnnouncePreview() {
  if (!draft) return;
  const a = draft.settings.announcement;
  $("#annCount").textContent = a.text.length;
  const p = $("#annPreview");
  p.textContent = a.text.trim() || "Your message will look like this.";
  p.classList.toggle("off", !a.enabled);
}

/* ---------------- save / discard ---------------- */

function validate() {
  const s = draft.settings;
  if (s.discount.enabled && !s.discount.code) return ["discount", "Add a discount code, or turn the discount off."];
  if (s.discount.enabled && !s.discount.offer.trim()) return ["discount", "Say what the winner gets, like \"15% off your next cleaning\"."];
  if (!s.business.phone.trim() && !s.business.email.trim()) return ["business", "Add at least a phone number or an email."];
  if (s.announcement.enabled && !s.announcement.text.trim()) return ["announce", "Write a message, or turn the announcement off."];
  return null;
}

async function save() {
  const problem = validate();
  if (problem) { showTab(problem[0]); toast(problem[1], "err"); return; }
  const btn = $("#saveBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    draft.availability.blocks = pruneBlocks(draft.availability.blocks);
    draft.settings.about.facts = draft.settings.about.facts.filter((f) => f.label.trim() || f.value.trim());
    await Promise.all([saveSettings(draft.settings), saveAvailability(draft.availability)]);
    savedJSON = snapshot();
    renderFacts();
    changed();
    toast(mode === "live" ? "Saved. The website is updated." : "Saved in this browser (preview mode).");
  } catch (err) {
    console.error(err);
    const denied = /permission|insufficient/i.test(String(err?.code || err?.message));
    toast(denied ? "Couldn't save: this account isn't allowed to make changes. Check the owner list in firestore.rules." : `Couldn't save: ${err?.message || "unknown error"}`, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save changes";
  }
}

function discard() {
  draft = JSON.parse(savedJSON);
  renderAll();
  changed();
  toast("Changes discarded.");
}

/* ---------------- requests inbox ---------------- */

let requests = [];
let requestsLoaded = false;
let reqFilter = "new";
const STATUS_LABEL = { new: "New", contacted: "Contacted", done: "Done" };

const isEmail = (v) => /\S+@\S+\.\S+/.test(v);
const phoneDigits = (v) => {
  const d = String(v).replace(/\D/g, "");
  return d.length === 10 ? "1" + d : d.length === 11 && d[0] === "1" ? d : "";
};
const firstOf = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

function whenText(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const d = new Date(ms);
  const time = formatTime(d.getHours() * 60 + d.getMinutes());
  const days = Math.floor(diff / 86400000);
  if (days < 2) return `Yesterday, ${time}`;
  return `${formatDateShort(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)}, ${time}`;
}

function replyText(r) {
  const s = draft.settings;
  const me = firstOf(s.business.owner);
  const dayPart = r.day ? ` for ${formatDateShort(r.day)}` : "";
  return `Hi ${firstOf(r.name)}, this is ${me} with ${s.business.name}. Thanks for your cleaning request${dayPart}! ` +
    (r.day ? "Does that day still work for a free consultation?" : "What day works for a free consultation?");
}

function contactLinks(r) {
  const s = draft.settings;
  const links = [];
  const digits = phoneDigits(r.contact);
  if (digits) {
    links.push({ label: "Call", href: `tel:+${digits}` });
    links.push({ label: "Text", href: `sms:+${digits}?&body=${encodeURIComponent(replyText(r))}` });
  }
  if (isEmail(r.contact)) {
    const subject = `Your cleaning request with ${s.business.name}`;
    const body = `${replyText(r)}\n\n${firstOf(s.business.owner)}\n${s.business.name}\n${s.business.phone}`;
    links.push({ label: "Email", href: `mailto:${r.contact.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` });
  }
  return links;
}

async function setStatus(r, status) {
  const patch = { status };
  if (status === "contacted" && !r.contactedAt) patch.contactedAt = Date.now();
  if (status === "done") patch.doneAt = Date.now();
  if (status === "new") { patch.contactedAt = 0; patch.doneAt = 0; }
  const before = { status: r.status, contactedAt: r.contactedAt, doneAt: r.doneAt };
  Object.assign(r, patch);
  renderRequests();
  try {
    await updateRequest(r.id, patch);
  } catch (err) {
    Object.assign(r, before);
    renderRequests();
    toast(`Couldn't update that request: ${err?.message || "unknown error"}`, "err");
  }
}

function requestCard(r) {
  const li = el("li", { className: `req is-${r.status}` });
  li.append(el("div", { className: "req-top" },
    el("span", { className: "req-name", textContent: r.name || "No name" }),
    el("span", { className: "req-status", textContent: STATUS_LABEL[r.status] || r.status }),
    el("span", { className: "req-time", textContent: whenText(r.createdAt) })));

  const rows = [];
  const add = (label, value) => { if (value) rows.push(el("dt", { textContent: label }), el("dd", {}, ...[].concat(value))); };
  add("Contact", r.contact);
  const tank = [r.kind, r.water && r.water !== "Not sure" ? r.water : "", r.size ? `about ${r.size}` : ""].filter(Boolean).join(", ");
  add("Tank", tank);
  add("City", r.city);
  if (r.day) add("Preferred", `${formatDateLong(r.day)}${r.time ? `, ${r.time}` : ""}`);
  if (r.code) {
    const current = draft.settings.discount;
    const ok = current.enabled && r.code.toUpperCase() === String(current.code).toUpperCase();
    add("Code", [document.createTextNode(r.code), el("span", { className: `code-tag ${ok ? "code-ok" : "code-old"}`, textContent: ok ? "matches current code" : "not the current code" })]);
  }
  // Older requests were also sent by the visitor's text or email app.
  add("Also sent by", r.via === "text" ? "Text message" : r.via === "email" ? "Email" : "");
  li.append(el("dl", { className: "req-details" }, ...rows));
  if (r.notes) li.append(el("p", { className: "req-notes", textContent: r.notes }));

  const actions = el("div", { className: "req-actions" });
  for (const link of contactLinks(r)) {
    const a = el("a", { className: "btn btn-primary contact-btn", href: link.href, textContent: link.label });
    a.setAttribute("aria-label", `${link.label} ${r.name}`);
    a.addEventListener("click", () => { if (r.status === "new") setStatus(r, "contacted"); });
    actions.append(a);
  }
  actions.append(el("span", { className: "spacer" }));
  const statusBtn = (label, status) => {
    const b = el("button", { type: "button", className: "btn btn-outline", textContent: label });
    b.addEventListener("click", () => setStatus(r, status));
    return b;
  };
  if (r.status === "new") actions.append(statusBtn("Mark as contacted", "contacted"));
  if (r.status !== "done") actions.append(statusBtn("Mark done", "done"));
  if (r.status !== "new") actions.append(statusBtn("Move back to new", "new"));
  const del = el("button", { type: "button", className: "link-btn", textContent: "Delete" });
  del.addEventListener("click", async () => {
    if (!confirm(`Delete the request from ${r.name}? This can't be undone.`)) return;
    try {
      await deleteRequest(r.id);
      requests = requests.filter((x) => x !== r);
      renderRequests();
      toast("Request deleted.");
    } catch (err) {
      toast(`Couldn't delete: ${err?.message || "unknown error"}`, "err");
    }
  });
  actions.append(del);
  li.append(actions);

  const meta = [];
  if (r.contactedAt) meta.push(`Contacted ${whenText(r.contactedAt).toLowerCase()}`);
  if (r.status === "done" && r.doneAt) meta.push(`marked done ${whenText(r.doneAt).toLowerCase()}`);
  if (meta.length) li.append(el("p", { className: "req-meta", textContent: meta.join(", ") + "." }));
  return li;
}

function renderRequests() {
  const counts = { new: 0, contacted: 0, done: 0, all: requests.length };
  for (const r of requests) counts[r.status] = (counts[r.status] || 0) + 1;
  $$("[data-count]").forEach((span) => (span.textContent = counts[span.dataset.count] || ""));
  $$(".req-filters button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === reqFilter)));

  const badge = $("#reqBadge");
  badge.hidden = !counts.new;
  badge.textContent = counts.new;
  document.title = `${counts.new ? `(${counts.new}) ` : ""}Owner dashboard | Cal's Perfection Aquatics`;

  const shown = reqFilter === "all" ? requests : requests.filter((r) => r.status === reqFilter);
  const list = $("#reqList");
  if (!requestsLoaded) {
    list.replaceChildren(el("li", { className: "req-empty", textContent: "Loading requests…" }));
  } else if (!shown.length) {
    const empty = {
      new: "No new requests. When someone sends one from the website, it shows up here.",
      contacted: "Nobody is waiting on a follow-up.",
      done: "Nothing marked done yet.",
      all: "No requests yet. They'll show up here when people use the form on the website.",
    }[reqFilter];
    list.replaceChildren(el("li", { className: "req-empty", textContent: empty }));
  } else {
    list.replaceChildren(...shown.map(requestCard));
  }
  renderOverview();
}

async function refreshRequests({ quiet = false } = {}) {
  try {
    requests = await listRequests();
    requestsLoaded = true;
    $("#reqError").hidden = true;
  } catch (err) {
    requestsLoaded = true;
    const denied = /permission|insufficient/i.test(String(err?.code || err?.message));
    $("#reqError").textContent = denied
      ? "Couldn't load requests: the database rules don't allow it yet. Publish the latest firestore.rules in Firebase."
      : `Couldn't load requests: ${err?.message || "unknown error"}`;
    $("#reqError").hidden = false;
  }
  renderRequests();
  if (!quiet) toast("Requests refreshed.");
}

function initRequests() {
  $$(".req-filters button").forEach((b) =>
    b.addEventListener("click", () => { reqFilter = b.dataset.filter; renderRequests(); }));
  $("#reqRefresh").addEventListener("click", () => refreshRequests());
  // Check for new requests every minute, and whenever the owner comes back to this tab.
  setInterval(() => { if (document.visibilityState === "visible") refreshRequests({ quiet: true }); }, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshRequests({ quiet: true }); });
}

/* ---------------- boot ---------------- */

function renderAll() {
  fillBindings();
  renderOverview();
  renderCalendar();
  renderWeekly();
  renderFacts();
  renderDiscountPreview();
  renderAnnouncePreview();
}

let wired = false;
async function openDashboard() {
  const [settings, availability] = await Promise.all([loadSettings(), loadAvailability()]);
  draft = { settings, availability };
  draft.availability.blocks = pruneBlocks(draft.availability.blocks);
  savedJSON = snapshot();
  if (!wired) {
    wired = true;
    initTabs();
    initBindings();
    initAvailability();
    initRequests();
    $("#saveBtn").addEventListener("click", save);
    $("#discardBtn").addEventListener("click", discard);
  }
  renderAll();
  $("#gate").hidden = true;
  $("#dash").hidden = false;
  await refreshRequests({ quiet: true });
  // Land on the inbox when someone is waiting for a reply.
  if (requests.some((r) => r.status === "new")) showTab("requests");
}

function gate({ text, error, signIn: showSignIn = false, preview = false, otherAccount = false }) {
  $("#dash").hidden = true;
  $("#gate").hidden = false;
  if (text) $("#gateText").textContent = text;
  $("#signInBtn").hidden = !showSignIn;
  $("#previewBtn").hidden = !preview;
  $("#gateSignOut").hidden = !otherAccount;
  $("#gateError").hidden = !error;
  $("#gateError").textContent = error || "";
}

function authErrorMessage(err) {
  const code = err?.code || "";
  if (code.includes("popup-closed") || code.includes("cancelled-popup")) return "";
  if (code.includes("popup-blocked")) return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
  if (code.includes("unauthorized-domain")) return `This web address isn't approved for sign-in yet. In Firebase, add ${location.hostname} under Authentication → Settings → Authorized domains.`;
  if (code.includes("operation-not-allowed")) return "Google sign-in isn't turned on yet. In Firebase, enable it under Authentication → Sign-in method.";
  return `Sign-in didn't work (${code || err?.message || "unknown error"}).`;
}

function boot() {
  if (mode === "preview") {
    $("#previewBanner").hidden = false;
    $("#resetPreviewWrap").hidden = false;
    gate({
      text: "The owner login isn't connected yet, so this dashboard is running in preview mode. You can try everything; changes only save in this browser.",
      preview: true,
    });
    $("#previewBtn").addEventListener("click", openDashboard);
    $("#resetPreview").addEventListener("click", () => {
      if (!confirm("Clear all preview changes and go back to the default content?")) return;
      resetPreview();
      openDashboard();
      toast("Preview data reset.");
    });
    return;
  }

  $("#signInBtn").addEventListener("click", async () => {
    $("#gateError").hidden = true;
    try { await signIn(); } catch (err) {
      const msg = authErrorMessage(err);
      if (msg) { $("#gateError").textContent = msg; $("#gateError").hidden = false; }
    }
  });
  const doSignOut = async () => {
    if (isDirty() && !confirm("You have unsaved changes. Sign out anyway?")) return;
    savedJSON = snapshot();
    await signOutOwner();
  };
  $("#signOutBtn").addEventListener("click", doSignOut);
  $("#gateSignOut").addEventListener("click", doSignOut);

  gate({ text: "Checking sign-in…" });
  watchAuth(async (user) => {
    $("#who").hidden = !user;
    $("#who").textContent = user?.email || "";
    $("#signOutBtn").hidden = !user;
    if (!user) {
      gate({ text: "Sign in with the Google account for Cal's Perfection Aquatics to change the discount, block off days, and edit your info.", signIn: true });
      return;
    }
    if (!isOwner(user)) {
      gate({ text: `${user.email} isn't set up as an owner of this site.`, otherAccount: true });
      return;
    }
    try {
      await openDashboard();
    } catch (err) {
      gate({ text: "Signed in, but the site content couldn't be loaded.", error: String(err?.message || err), otherAccount: true });
    }
  }).catch((err) => gate({ text: "The sign-in service couldn't load.", error: String(err?.message || err) }));
}

boot();
