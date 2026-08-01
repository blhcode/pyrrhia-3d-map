import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const IMG = `data:image/png;base64,${readFileSync('reference/pyrrhia.png').toString('base64')}`;

const PROBES = [
  ['frame left', 8, 228],
  ['frame top', 300, 8],
  ['frame right', 592, 228],
  ['frame bottom', 300, 448],
  ['frame left in', 22, 228],
  ['frame top in', 300, 22],
  ['frame right in', 578, 228],
  ['frame bottom in', 300, 434],
  ['inner left', 30, 228],
  ['inner top', 300, 30],
  ['ice centre', 130, 110],
  ['ice north', 120, 80],
  ['ice edge', 175, 130],
  ['ocean west', 40, 200],
  ['ocean north', 300, 40],
  ['ocean NE', 470, 90],
  ['sea kingdom bay', 480, 185],
  ['sea kingdom bay2', 500, 210],
  ['desert', 180, 270],
  ['desert2', 230, 300],
  ['sky mtns', 300, 150],
  ['sky green', 350, 130],
  ['mud', 420, 290],
  ['rainforest', 400, 370],
  ['east arm', 520, 270],
  ['east arm2', 505, 250],
  ['ocean south', 300, 430],
  ['ocean east', 570, 300],
];

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

const out = await page.evaluate(
  async (src, probes) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.getElementById('c');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;

    // Median of a small patch, to skip ink hatching and paper grain.
    return probes.map(([name, x, y]) => {
      const rs = [], gs = [], bs = [];
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const i = ((y + dy) * img.width + (x + dx)) * 4;
          rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]);
        }
      const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
      return [name, med(rs), med(gs), med(bs)];
    });
  },
  IMG,
  PROBES,
);

await browser.close();
for (const [name, r, g, b] of out) {
  console.log(
    `${name.padEnd(18)} rgb(${String(r).padStart(3)},${String(g).padStart(3)},${String(b).padStart(3)})` +
      `  b-r=${String(b - r).padStart(4)}  sum=${r + g + b}`,
  );
}
