/* ------------------------------------------------------------------
   Alerts sent to the owner when a cleaning request comes in.
   Both are optional and configured in config.js (NOTIFY).
------------------------------------------------------------------- */
import { NOTIFY } from "./config.js";
import { formatDateLong } from "./calendar.js";

const dashboardUrl = () => new URL("admin.html", location.href).href;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, fail) => setTimeout(() => fail(new Error("timeout")), ms))]);
}

// Email with every detail, so Cameron can act on it straight from his inbox.
async function emailAlert(req, businessName) {
  const tank = [req.kind, req.water !== "Not sure" ? req.water : "", req.size ? `about ${req.size}` : ""].filter(Boolean).join(", ");
  const body = {
    access_key: NOTIFY.web3formsKey,
    subject: `New cleaning request from ${req.name}`,
    from_name: `${businessName} website`,
    "Name": req.name,
    "Phone or email": req.contact,
    "What needs cleaning": tank,
    "City": req.city,
    "Preferred day": req.day ? `${formatDateLong(req.day)}${req.time ? ` (${req.time})` : ""}` : "",
    "Discount code": req.code,
    "Notes": req.notes,
    "Dashboard": dashboardUrl(),
  };
  if (/\S+@\S+\.\S+/.test(req.contact)) body.replyto = req.contact.trim(); // hitting Reply answers the customer
  for (const [k, v] of Object.entries(body)) if (v === "") delete body[k];
  const res = await withTimeout(fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }), 10000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.message || `email alert failed (${res.status})`);
}

// Phone push. Deliberately no customer details: ntfy topics aren't private.
async function phoneAlert() {
  const res = await withTimeout(fetch(`https://ntfy.sh/${encodeURIComponent(NOTIFY.ntfyTopic)}`, {
    method: "POST",
    headers: { Title: "New cleaning request", Tags: "tropical_fish", Priority: "high", Click: dashboardUrl() },
    body: "Someone just sent a cleaning request. Tap to open your dashboard.",
    keepalive: true,
  }), 10000);
  if (!res.ok) throw new Error(`phone alert failed (${res.status})`);
}

// Returns { email, phone }: true if sent, false if failed, null if not set up.
export async function sendRequestAlerts(req, businessName) {
  const [email, phone] = await Promise.allSettled([
    NOTIFY.web3formsKey ? emailAlert(req, businessName) : Promise.resolve(null),
    NOTIFY.ntfyTopic ? phoneAlert() : Promise.resolve(null),
  ]);
  const result = (r) => (r.status === "fulfilled" ? (r.value === null ? null : true) : false);
  for (const r of [email, phone]) if (r.status === "rejected") console.warn(r.reason);
  return { email: result(email), phone: result(phone) };
}
