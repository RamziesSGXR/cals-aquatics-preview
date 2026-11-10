/* ------------------------------------------------------------------
   Availability math shared by the public calendar and the dashboard.
   Dates are plain "YYYY-MM-DD" strings in the business's local time.
------------------------------------------------------------------- */

export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export const WEEKDAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const pad = (n) => String(n).padStart(2, "0");

export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}
export const todayKey = () => toKey(new Date());

export function toMinutes(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
}
export function toHHMM(mins) {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}
export function formatTime(mins) {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? "p.m." : "a.m.";
  const h12 = ((h24 + 11) % 12) + 1;
  return m ? `${h12}:${pad(m)} ${suffix}` : `${h12} ${suffix}`;
}
export function formatRange([a, b]) {
  return `${formatTime(a)}–${formatTime(b)}`;
}
export function formatDateLong(key) {
  const d = fromKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
export function formatDateShort(key) {
  const d = fromKey(key);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

// Every 30 minutes from 6 a.m. to 9 p.m., for time pickers.
export const TIME_OPTIONS = Array.from({ length: 31 }, (_, i) => 360 + i * 30);

export const blocksOn = (availability, key) =>
  (availability.blocks || []).filter((b) => b.date === key);

// Open windows on a day: weekly hours minus that day's blocks.
export function openWindows(availability, key) {
  const weekly = availability.weekly?.[fromKey(key).getDay()];
  if (!weekly || !weekly.open) return [];
  const dayBlocks = blocksOn(availability, key);
  if (dayBlocks.some((b) => b.allDay)) return [];

  let windows = [[toMinutes(weekly.start), toMinutes(weekly.end)]];
  for (const b of dayBlocks) {
    const bs = toMinutes(b.start);
    const be = toMinutes(b.end);
    const next = [];
    for (const [s, e] of windows) {
      if (be <= s || bs >= e) { next.push([s, e]); continue; }
      if (bs > s) next.push([s, bs]);
      if (be < e) next.push([be, e]);
    }
    windows = next;
  }
  return windows.filter(([s, e]) => e - s >= 60);
}

/*
  Status for the public calendar:
  past | soon (inside notice period) | beyond (past the booking window)
  closed (not a working day) | booked (blocked off) | limited | open
*/
export function dayStatus(availability, booking, key, today = todayKey()) {
  if (key < today) return { status: "past", windows: [] };
  const notice = Number(booking?.noticeDays ?? 1);
  if (key < addDays(today, notice)) return { status: "soon", windows: [] };
  const lastDay = addDays(today, Number(booking?.weeksAhead ?? 8) * 7);
  if (key > lastDay) return { status: "beyond", windows: [] };

  const weekly = availability.weekly?.[fromKey(key).getDay()];
  if (!weekly || !weekly.open) return { status: "closed", windows: [] };

  const windows = openWindows(availability, key);
  if (!windows.length) return { status: "booked", windows };
  const full = toMinutes(weekly.end) - toMinutes(weekly.start);
  const free = windows.reduce((sum, [s, e]) => sum + (e - s), 0);
  return { status: free < full ? "limited" : "open", windows };
}

// Weeks for a month view; null fills the days outside the month.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array(first.getDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(toKey(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const newId = () => Math.random().toString(36).slice(2, 10);

// Drop blocks that are already in the past.
export const pruneBlocks = (blocks, today = todayKey()) =>
  (blocks || []).filter((b) => b.date >= today);
