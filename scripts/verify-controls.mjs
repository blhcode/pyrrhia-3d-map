// Verifies the documented flight keys.
//
// Real key presses drive mode switching and the held-key set. Movement is then
// stepped by pumping fly.update() directly, because the headless software
// rasteriser cannot complete a frame of this terrain in a usable time — that is
// an environment limit, not app behaviour.
import puppeteer from 'puppeteer';

const URL = process.env.URL ?? 'http://localhost:4174/';

const browser = await puppeteer.launch({
  headless: 'shell',
  protocolTimeout: 900_000,
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 800, height: 600 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page
  .waitForFunction(() => !document.getElementById('loading'), { timeout: 240000 })
  .catch(() => console.log('[warn] loading never cleared'));
await new Promise((r) => setTimeout(r, 4000));

const state = () =>
  page.evaluate(() => {
    const a = window.__pyrrhia;
    return { mode: a.modeDebug(), keys: a.fly.keysDebug() };
  });

const fail = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) fail.push(name);
};

// --- 1. Orbit mode: mouse still orbits, and W pans without stealing the mode -
const before = await state();
check('boots in orbit mode', before.mode === 'orbit', `mode=${before.mode}`);

const drag = async (dx, dy) => {
  const box = await page.evaluate(() => {
    const r = document.getElementById('viewport').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(box.x + (dx * i) / 20, box.y + (dy * i) / 20);
  }
  await page.mouse.up();
};

const rig = () =>
  page.evaluate(() => {
    const a = window.__pyrrhia;
    return {
      pos: a.camera.position.toArray(),
      quat: a.camera.quaternion.toArray(),
      radius: a.camera.position.distanceTo(a.orbit.target),
    };
  });

const orbitBefore = await rig();
await drag(220, 0);
const orbitAfter = await rig();
const orbitMoved = Math.hypot(
  orbitAfter.pos[0] - orbitBefore.pos[0],
  orbitAfter.pos[1] - orbitBefore.pos[1],
  orbitAfter.pos[2] - orbitBefore.pos[2],
);
const radiusDrift =
  Math.abs(orbitAfter.radius - orbitBefore.radius) / orbitBefore.radius;
check(
  'mouse drag orbits the camera around the target',
  orbitMoved > 1000 && radiusDrift < 0.02,
  `moved ${(orbitMoved / 1000).toFixed(1)} km, radius drift ${(radiusDrift * 100).toFixed(2)}%`,
);

await page.keyboard.down('w');
await new Promise((r) => setTimeout(r, 250));
const afterW = await state();
check(
  'W does not hijack the view mode',
  afterW.mode === 'orbit' && afterW.keys.includes('KeyW'),
  `mode=${afterW.mode} keys=${JSON.stringify(afterW.keys)}`,
);
await page.keyboard.up('w');

const panned = await page.evaluate(() => {
  const a = window.__pyrrhia;
  a.fly.keysDebugAdd('KeyW');
  const p0 = a.camera.position.clone();
  const t0 = a.orbit.target.clone();
  for (let i = 0; i < 20; i++) a.panOrbit(0.05, -45_000, 15);
  a.fly.keysDebugDelete('KeyW');
  return {
    camDelta: a.camera.position.clone().sub(p0).toArray(),
    tgtDelta: a.orbit.target.clone().sub(t0).toArray(),
  };
});
const camMove = Math.hypot(...panned.camDelta);
const rigLocked = panned.camDelta.every(
  (v, i) => Math.abs(v - panned.tgtDelta[i]) < 1,
);
check(
  'W pans the whole orbit rig across the map',
  camMove > 1000 && rigLocked && Math.abs(panned.camDelta[1]) < camMove * 0.01,
  `moved ${(camMove / 1000).toFixed(1)} km, dy=${panned.camDelta[1].toFixed(1)} m, target follows=${rigLocked}`,
);

// --- 1b. Fly mode: drag looks around without moving the camera -------------
await page.evaluate(() => window.__pyrrhia.setMode('fly'));
const flyBefore = await rig();
await drag(160, 0);
const flyAfter = await rig();
const quatDelta = flyAfter.quat.reduce(
  (m, v, i) => Math.max(m, Math.abs(v - flyBefore.quat[i])),
  0,
);
const flyMoved = Math.hypot(
  flyAfter.pos[0] - flyBefore.pos[0],
  flyAfter.pos[2] - flyBefore.pos[2],
);
check(
  'mouse drag looks around in fly mode',
  quatDelta > 0.01 && flyMoved < 1,
  `quat delta ${quatDelta.toFixed(3)}, position drift ${flyMoved.toFixed(1)} m`,
);

// --- 2. Each key moves the camera the right way ----------------------------
// Pump a fixed number of controller steps with a given key held.
const pump = (code, steps = 20, shift = false) =>
  page.evaluate(
    (code, steps, shift) => {
      const a = window.__pyrrhia;
      const held = a.fly.keysDebug();
      for (const k of held) a.fly.keysDebugDelete(k);
      a.fly.keysDebugAdd(code);
      if (shift) a.fly.keysDebugAdd('ShiftLeft');

      const fwd = a.camera.getWorldDirection(a.camera.position.clone().set(0, 0, 0));
      const f = { x: fwd.x, y: fwd.y, z: fwd.z };
      const p0 = a.camera.position.clone();
      for (let i = 0; i < steps; i++) a.fly.update(0.05, -45_000, 15);
      const p1 = a.camera.position.clone();

      for (const k of a.fly.keysDebug()) a.fly.keysDebugDelete(k);
      return {
        dist: p0.distanceTo(p1),
        dx: p1.x - p0.x,
        dy: p1.y - p0.y,
        dz: p1.z - p0.z,
        forward: f,
      };
    },
    code,
    steps,
    shift,
  );

const w = await pump('KeyW');
// Camera looks down and slightly north, so forward motion must drop altitude.
check('W moves along the view direction', w.dist > 1000 && Math.sign(w.dy) === Math.sign(w.forward.y), `moved ${(w.dist / 1000).toFixed(1)} km, dy=${(w.dy / 1000).toFixed(1)} km`);

const s = await pump('KeyS');
check('S moves opposite to W', s.dist > 1000 && Math.sign(s.dy) === -Math.sign(w.dy), `moved ${(s.dist / 1000).toFixed(1)} km`);

const a1 = await pump('KeyA');
const d1 = await pump('KeyD');
check('A and D strafe opposite ways', a1.dist > 1000 && d1.dist > 1000 && Math.sign(a1.dx) === -Math.sign(d1.dx), `A dx=${(a1.dx / 1000).toFixed(1)} km, D dx=${(d1.dx / 1000).toFixed(1)} km`);

const e1 = await pump('KeyE');
check('E climbs', e1.dy > 1000, `dy=${(e1.dy / 1000).toFixed(1)} km`);

const q1 = await pump('KeyQ');
check('Q descends', q1.dy < -1000, `dy=${(q1.dy / 1000).toFixed(1)} km`);

// --- 3. Shift boost --------------------------------------------------------
const plain = await pump('KeyE', 20, false);
const boost = await pump('KeyE', 20, true);
const ratio = boost.dist / plain.dist;
check('Shift boosts speed ~6x', ratio > 5 && ratio < 7, `ratio ${ratio.toFixed(2)}`);

// --- 4. Typing in the search box must not fly the camera -------------------
await page.click('#landmark-search');
await page.keyboard.type('sand');
const typed = await state();
check(
  'typing in search does not capture movement keys',
  !typed.keys.includes('KeyS') && !typed.keys.includes('KeyA') && !typed.keys.includes('KeyD'),
  `keys=${JSON.stringify(typed.keys)}`,
);

console.log(fail.length ? `\n${fail.length} FAILED: ${fail.join(', ')}` : '\nall checks passed');
await browser.close();
process.exitCode = fail.length ? 1 : 0;
