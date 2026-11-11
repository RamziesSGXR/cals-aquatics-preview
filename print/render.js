const { chromium } = require('playwright');
(async () => {
  // Usage: node print/render.js <output-folder>   (needs Playwright)
  const src = 'file://' + require('path').resolve(__dirname, 'business-card.html');
  const out = process.argv[2]; const b = await chromium.launch(); const p = await b.newPage();
  // Print-shop PDF: 2 pages (front, back), 3.75 x 2.25 in with bleed
  await p.goto(src, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: `${out}/CPA-business-card-print-shop.pdf`, width: '3.75in', height: '2.25in', printBackground: true, preferCSSPageSize: true });
  // Preview PNGs at trim size, 300 dpi
  const pv = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 300 / 96 });
  await pv.goto(src, { waitUntil: 'networkidle' }); await pv.evaluate(() => document.fonts.ready);
  for (const [i, name] of [[0, 'front'], [1, 'back']]) {
    const el = (await pv.$$('.face'))[i];
    const box = await el.boundingBox();
    await pv.screenshot({ path: `${out}/card-${name}.png`, clip: { x: box.x + 12, y: box.y + 12, width: 336, height: 192 } }); // trim (0.125in = 12px)
  }
  // Home-print sheets (Letter, 10-up): fronts then backs in one PDF
  const fronts = await b.newPage(); await fronts.goto(src + '?sheet=front', { waitUntil: 'networkidle' }); await fronts.evaluate(() => document.fonts.ready);
  await fronts.pdf({ path: `${out}/sheet-front.pdf`, width: '8.5in', height: '11in', printBackground: true, preferCSSPageSize: true });
  const backs = await b.newPage(); await backs.goto(src + '?sheet=back', { waitUntil: 'networkidle' }); await backs.evaluate(() => document.fonts.ready);
  await backs.pdf({ path: `${out}/sheet-back.pdf`, width: '8.5in', height: '11in', printBackground: true, preferCSSPageSize: true });
  await b.close();
})();
