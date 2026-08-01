// Checks the loading screen shows rotating flavour text and a bar that still
// tracks real progress.
//
// Polling from Node undercounts badly: generation owns the main thread, so
// page.evaluate only lands in the gaps. A MutationObserver installed before
// the app boots records every change from inside the page instead.
import puppeteer from 'puppeteer';

const URL = process.env.URL ?? 'http://localhost:4174/';

const browser = await puppeteer.launch({
  headless: 'shell',
  protocolTimeout: 300_000,
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--no-sandbox',
  ],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.evaluateOnNewDocument(() => {
  const log = { t0: 0, lines: [], bars: [], done: 0 };
  window.__load = log;
  document.addEventListener('DOMContentLoaded', () => {
    const label = document.getElementById('load-label');
    const bar = document.getElementById('load-bar');
    const screen = document.getElementById('loading');
    if (!label || !bar || !screen) return;
    log.t0 = performance.now();
    const push = () => {
      const text = label.textContent ?? '';
      const at = Math.round(performance.now() - log.t0);
      if (log.lines[log.lines.length - 1]?.text !== text) log.lines.push({ text, at });
      const w = bar.style.width;
      if (w && log.bars[log.bars.length - 1]?.w !== w) log.bars.push({ w, at });
    };
    push();
    new MutationObserver(push).observe(screen, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style'],
    });
    new MutationObserver(() => {
      if (!document.getElementById('loading') && !log.done) {
        log.done = Math.round(performance.now() - log.t0);
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page
  .waitForFunction(() => window.__load?.done > 0, { timeout: 240_000, polling: 500 })
  .catch(() => console.log('(loading screen never went away, reporting what we have)'));

const log = await page.evaluate(() => window.__load);

console.log(`load took ${log.done} ms (headless software raster, far slower than real)\n`);
// How long each line was actually on screen, the last one running to removal.
const held = log.lines.map((l, i) => (log.lines[i + 1]?.at ?? log.done) - l.at);

console.log(`lines shown (${log.lines.length}):`);
for (const [i, l] of log.lines.entries()) {
  console.log(`  ${String(l.at).padStart(6)} ms  held ${String(held[i]).padStart(6)} ms  ${l.text}`);
}
console.log(`\nbar: ${log.bars.length} steps, ${log.bars[0]?.w} -> ${log.bars[log.bars.length - 1]?.w}`);

const texts = log.lines.map((l) => l.text);
const technical = texts.filter((s) => /carv|ridge|rasteri|heightmap|valley|coastline|loading/i.test(s));
const dupes = texts.length !== new Set(texts).size;
const finalBar = log.bars[log.bars.length - 1]?.w;

// The screen should survive scene setup and the first render, not vanish the
// moment the heightfield is done.
const genEnd = log.bars.find((b) => b.w === '96%')?.at ?? 0;
const heldThroughSetup = log.done - genEnd;
console.log(`held ${heldThroughSetup} ms past terrain generation, through scene setup`);

// Every line must get long enough to read, including the last one.
const READABLE_MS = 1900;
const rushed = log.lines
  .map((l, i) => ({ text: l.text, ms: held[i] }))
  .filter((l) => l.ms < READABLE_MS);

const ok =
  log.lines.length >= 3 &&
  technical.length === 0 &&
  !dupes &&
  finalBar === '100%' &&
  heldThroughSetup > 0 &&
  rushed.length === 0;
console.log(
  ok
    ? `\nPASS  ${log.lines.length} lines, each readable for ${READABLE_MS}ms+, no technical labels, bar reaches 100%, screen held to first frame`
    : `\nFAIL  lines=${log.lines.length} technical=${JSON.stringify(technical)} dupes=${dupes} finalBar=${finalBar} held=${heldThroughSetup} rushed=${JSON.stringify(rushed)}`,
);
await browser.close();
process.exitCode = ok ? 0 : 1;
