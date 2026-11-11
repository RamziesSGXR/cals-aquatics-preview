/* ------------------------------------------------------------------
   Digital business card: switch the QR code, show it full screen,
   keep the screen awake while it's showing, and share the card.
   Phone/email on the buttons are filled in from the dashboard by site.js.
------------------------------------------------------------------- */

const $ = (sel) => document.querySelector(sel);

const QR = {
  book: {
    src: "images/qr/book.svg",
    alt: "QR code that opens the booking page",
    caption: "Point your camera here to pick a day",
    full: "Scan to pick a day",
  },
  contact: {
    src: "images/qr/contact.svg",
    alt: "QR code that saves Cameron's contact",
    caption: "Scan to add Cameron to your contacts",
    full: "Scan to save my contact",
  },
};
let current = "book";

function showQr(kind) {
  current = kind;
  const q = QR[kind];
  $("#qrImg").src = q.src;
  $("#qrImg").alt = q.alt;
  $("#qrCaption").textContent = q.caption;
  document.querySelectorAll("[data-qr]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.qr === kind)));
}

document.querySelectorAll("[data-qr]").forEach((b) => b.addEventListener("click", () => showQr(b.dataset.qr)));

/* full screen, with the screen kept awake so it doesn't dim mid-scan */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not supported or not allowed; fine */ }
}

const full = $("#qrFull");
function openFull() {
  const q = QR[current];
  $("#qrFullImg").src = q.src;
  $("#qrFullCaption").textContent = q.full;
  full.hidden = false;
  document.documentElement.classList.add("game-open"); // reuse the scroll lock
  keepAwake(true);
  $("#qrClose").focus();
}
function closeFull() {
  full.hidden = true;
  document.documentElement.classList.remove("game-open");
  keepAwake(false);
  $("#qrFrame").focus();
}
$("#qrFrame").addEventListener("click", openFull);
$("#qrClose").addEventListener("click", closeFull);
full.addEventListener("click", (e) => { if (e.target === full) closeFull(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !full.hidden) closeFull(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !full.hidden) keepAwake(true); });

/* flip the business card */
const flip = $("#flipCard");
flip.addEventListener("click", () => {
  const flipped = flip.classList.toggle("flipped");
  flip.setAttribute("aria-label", `Business card, ${flipped ? "back" : "front"} side. Tap to flip.`);
});

/* share: send the card picture plus the link where the phone supports it */
$("#shareBtn").addEventListener("click", async () => {
  const url = new URL("card.html", location.href).href;
  const text = "Cameron Latimer, Cal's Perfection Aquatics. Aquarium, pond, and water feature cleaning in Spokane.";
  const label = $("#shareBtn span");
  try {
    if (navigator.share) {
      try {
        const blob = await (await fetch("images/cameron-card-share.jpg")).blob();
        const file = new File([blob], "Cameron Latimer - Cal's Perfection Aquatics.jpg", { type: "image/jpeg" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "Cameron Latimer", text: `${text} ${url}` });
          return;
        }
      } catch (err) {
        if (err?.name === "AbortError") return; // closed the share sheet
      }
      await navigator.share({ title: "Cameron Latimer", text, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    label.textContent = "Link copied";
    setTimeout(() => (label.textContent = "Share this card"), 2000);
  } catch { /* share sheet closed */ }
});
