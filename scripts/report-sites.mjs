// Prints the built dimensions of every named place, so dragon-scale and
// scavenger-scale architecture can be compared at a glance.
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['scripts/_sites-entry.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'node',
});
const { LANDMARKS, SITE_SPECS, buildParts, rngFor, siteTopHeight } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const rows = [];
for (const lm of LANDMARKS) {
  const spec = SITE_SPECS.get(lm.id);
  if (!spec || spec.kind === 'none') continue;
  const parts = buildParts(spec, rngFor(lm.id));
  // Boxes only: the plain buildings, not roofs, walls or cave mouths.
  const boxes = parts.filter((p) => p.shape === 0);
  rows.push({
    name: lm.name,
    who: spec.occupant,
    kind: spec.kind,
    across: Math.round(spec.radius * 2),
    building: `${median(boxes.map((p) => p.w)).toFixed(1)} × ${median(boxes.map((p) => p.h)).toFixed(1)}`,
    tallest: Math.round(Math.max(0, ...parts.map((p) => p.y + p.h))),
    parts: parts.length,
  });
}

rows.sort((a, b) => (a.who === b.who ? b.across - a.across : a.who < b.who ? 1 : -1));

const cols = ['name', 'who', 'kind', 'across', 'building', 'tallest', 'parts'];
const head = {
  name: 'PLACE',
  who: 'BUILT BY',
  kind: 'KIND',
  across: 'ACROSS m',
  building: 'TYPICAL BUILDING w × h m',
  tallest: 'TALLEST m',
  parts: 'PARTS',
};
const width = Object.fromEntries(
  cols.map((c) => [c, Math.max(...[head, ...rows].map((r) => String(r[c]).length))]),
);
const line = (r) =>
  cols
    .map((c) =>
      typeof r[c] === 'number' && r !== head
        ? String(r[c]).padStart(width[c])
        : String(r[c]).padEnd(width[c]),
    )
    .join('  ');

console.log(line(head));
console.log(cols.map((c) => '-'.repeat(width[c])).join('  '));
for (const r of rows) console.log(line(r));

const dragon = rows.filter((r) => r.who === 'dragon');
const human = rows.filter((r) => r.who === 'scavenger');
const avg = (xs, f) => xs.reduce((s, x) => s + f(x), 0) / (xs.length || 1);
console.log(
  `\n${dragon.length} dragon sites, ${human.length} scavenger sites.` +
    `\nMean settlement width: dragon ${avg(dragon, (r) => r.across).toFixed(0)} m,` +
    ` scavenger ${avg(human, (r) => r.across).toFixed(0)} m` +
    `\nMean tallest structure: dragon ${avg(dragon, (r) => r.tallest).toFixed(1)} m,` +
    ` scavenger ${avg(human, (r) => r.tallest).toFixed(1)} m`,
);
console.log(
  '\nFraming height used by the camera (siteTopHeight), a few examples:\n' +
    ['scorpion-den', 'possibility', 'indestructible-city', 'talisman']
      .map((id) => {
        const s = SITE_SPECS.get(id);
        const lm = LANDMARKS.find((l) => l.id === id);
        return `  ${lm.name}: ${siteTopHeight(s).toFixed(1)} m (${s.occupant})`;
      })
      .join('\n'),
);
