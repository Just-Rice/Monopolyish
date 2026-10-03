// Browser load test: opens the game at a phone and a desktop viewport and
// checks there are no console errors, no sideways scrolling, and that the
// Roll Dice button is on screen once a game starts.
//
//   npm i --no-save playwright && npx playwright install chromium
//   node test/load-test.js
//
// The Google Fonts stylesheet is answered with an empty response so the test
// gives the same result offline.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
const VIEWPORTS = [
  { name: 'phone',   viewport: { width: 390,  height: 844 }, isMobile: true,  hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
];

const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  let failed = 0;

  for (const { name, ...opts } of VIEWPORTS) {
    const context = await browser.newContext(opts);
    const page = await context.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(url);
    await page.click('#btn-start-game');
    await page.waitForTimeout(500);

    const checks = await page.evaluate(() => {
      const roll = document.getElementById('btn-roll').getBoundingClientRect();
      return {
        noSidewaysScroll: document.documentElement.scrollWidth <= window.innerWidth,
        rollButtonShown: roll.width > 0 && roll.height > 0,
      };
    });
    checks.noConsoleErrors = errors.length === 0;

    for (const [check, ok] of Object.entries(checks)) {
      console.log(`${ok ? '✅' : '❌'} ${name}: ${check}`);
      if (!ok) failed++;
    }
    for (const e of errors) console.log(`   ${e}`);
    await context.close();
  }

  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
