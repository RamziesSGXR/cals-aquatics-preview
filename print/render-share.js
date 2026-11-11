const { chromium } = require('playwright');
(async () => {
  // Usage: node print/render-share.js  (needs Playwright; run after render.js so the card faces exist)
  const path = require('path');
  const src = 'file://' + path.resolve(__dirname, 'share-card.html');
  const b = await chromium.launch();
  for (const [v, w, h, file, opts] of [
    ['story', 1080, 1350, path.resolve(__dirname, '../images/') + '/' + 'cameron-card-share.png', {}],
    ['og', 1200, 630, path.resolve(__dirname, '../images/') + '/' + 'card-og.jpg', { type: 'jpeg', quality: 86 }],
  ]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.goto(src + '?v=' + v, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: file, ...opts });
  }
  await b.close();
})();
