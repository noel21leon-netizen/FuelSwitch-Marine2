#!/usr/bin/env node
// Dependency-free static checks for the chunk-1 scaffold. Needs only Node >= 18.
// It does NOT replace typecheck/build/tests. See docs/KOS/09 ADR-013.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail ?? '' });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
  }
};
const assert = (c, m) => { if (!c) throw new Error(m); };
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));

// --- KOS + project docs ---
const KOS = ['00-system-overview', '01-product-brief', '02-requirements', '03-architecture', '04-domain-model',
  '05-calculation-spec', '06-regulatory-source-register', '07-geodata-spec', '08-risk-register',
  '09-architecture-decisions', '10-test-strategy', '11-release-readiness', '12-prompt-library', '13-phone-test-checklist'].map((f) => `docs/KOS/${f}.md`);
KOS.push('docs/KOS/CHANGELOG.md', 'CLAUDE.md', 'README.md', 'NEXT_STEPS.md');
check('KOS + project docs present and non-empty', () => {
  for (const f of KOS) {
    assert(existsSync(join(root, f)), `missing ${f}`);
    assert(statSync(join(root, f)).size > 100, `${f} is nearly empty`);
  }
  return `${KOS.length} files`;
});

// --- Manifest ---
const manifest = (() => { try { return json('public/manifest.webmanifest'); } catch { return null; } })();
check('manifest parses', () => { assert(manifest, 'cannot parse manifest'); });
check('manifest required fields', () => {
  assert(manifest.name === 'FuelSwitch Marine', 'name must be "FuelSwitch Marine"');
  for (const k of ['short_name', 'start_url', 'scope', 'background_color', 'theme_color']) assert(manifest[k], `missing ${k}`);
  assert(manifest.display === 'standalone', 'display must be standalone');
});

// --- Icons ---
function pngSize(path) {
  const b = readFileSync(path);
  assert(b.slice(1, 4).toString() === 'PNG', `${path} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
check('manifest icons exist with declared sizes', () => {
  assert(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'need >=3 icons');
  for (const ic of manifest.icons) {
    const p = join(root, 'public', ic.src);
    assert(existsSync(p), `icon file missing: ${ic.src}`);
    const [w, h] = pngSize(p);
    assert(`${w}x${h}` === ic.sizes, `${ic.src} is ${w}x${h}, manifest says ${ic.sizes}`);
  }
  return `${manifest.icons.length} icons`;
});
check('icons include 192, 512 and maskable 512', () => {
  const has = (s, p) => manifest.icons.some((i) => i.sizes === s && i.purpose === p);
  assert(has('192x192', 'any'), 'no 192 any');
  assert(has('512x512', 'any'), 'no 512 any');
  assert(has('512x512', 'maskable'), 'no 512 maskable');
});
check('apple-touch-icon and favicon exist', () => {
  assert(existsSync(join(root, 'public/icons/apple-touch-icon.png')), 'missing apple-touch-icon.png');
  assert(existsSync(join(root, 'public/icons/favicon.svg')), 'missing favicon.svg');
});

// --- index.html ---
check('index.html viewport, manifest link, icons', () => {
  const h = read('index.html');
  assert(/viewport-fit=cover/.test(h), 'viewport-fit=cover missing');
  assert(/width=device-width/.test(h), 'device-width missing');
  assert(/rel="manifest"/.test(h), 'manifest link missing');
  assert(/apple-touch-icon/.test(h), 'apple-touch-icon link missing');
  assert(/theme-color/.test(h), 'theme-color missing');
});

// --- Synthetic geodata ---
function ringClosed(r) { const a = r[0], b = r[r.length - 1]; return r.length >= 4 && a[0] === b[0] && a[1] === b[1]; }
function inRange(c) { return Math.abs(c[1]) <= 90 && Math.abs(c[0]) <= 180; }
check('synthetic ECA: metadata + valid closed ring', () => {
  const g = json('public/demo-data/synthetic-eca.geojson');
  const m = g.fuelswitch;
  assert(m && m.verificationStatus === 'synthetic', 'verificationStatus must be synthetic');
  assert(m.notice === 'DEMO DATA — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE', 'DEMO notice missing/changed');
  for (const k of ['datasetId', 'name', 'emissionCategory', 'datasetVersion', 'sourceName']) assert(k in m, `metadata missing ${k}`);
  const poly = g.features[0].geometry;
  assert(poly.type === 'Polygon', 'expected Polygon');
  for (const ring of poly.coordinates) { assert(ringClosed(ring), 'ring not closed'); assert(ring.every(inRange), 'coord out of range'); }
});
check('synthetic route: LineString with >=2 valid points, flagged synthetic', () => {
  const g = json('public/demo-data/synthetic-route.geojson');
  assert(g.fuelswitch.verificationStatus === 'synthetic', 'route must be synthetic');
  const l = g.features[0].geometry;
  assert(l.type === 'LineString' && l.coordinates.length >= 2 && l.coordinates.every(inRange), 'bad LineString');
});

// --- Service worker + config sanity ---
check('service worker source present, no location code', () => {
  const s = read('src/sw.ts');
  assert(/precacheAndRoute/.test(s), 'precacheAndRoute missing');
  assert(!/geolocation/.test(s.replace(/\/\/.*$/gm, '')), 'service worker must not use geolocation');
});
check('package.json scripts and no lint claim', () => {
  const p = json('package.json');
  for (const s of ['dev', 'build', 'test', 'typecheck', 'verify:scaffold']) assert(p.scripts[s], `missing script ${s}`);
  assert(!p.scripts.lint, 'lint script exists but is documented as absent');
});
check('product name consistent in src/public/index.html', () => {
  const files = ['index.html', 'src/shared/constants.ts', 'public/manifest.webmanifest'];
  for (const f of files) assert(!/bunker\s*pilot/i.test(read(f)), `${f} uses a forbidden name`);
  assert(read('src/shared/constants.ts').includes("PRODUCT_NAME = 'FuelSwitch Marine'"), 'PRODUCT_NAME wrong');
});

// --- Repo hygiene (added chunk 2) ---
import { readdirSync } from 'node:fs';
function walkDirs(dir, out = []) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.git')) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { out.push(rel); walkDirs(rel, out); }
  }
  return out;
}
check('no literal brace-named directories (chunk-1 shell brace-expansion bug)', () => {
  const bad = ['src', 'tests', 'docs', 'public'].flatMap((d) => walkDirs(d)).filter((p) => /[{},]/.test(p));
  assert(bad.length === 0, `literal brace dirs: ${bad.join(', ')}`);
});
check('expected domain/feature/infrastructure directories exist', () => {
  const need = ['position', 'geospatial', 'eta', 'changeover', 'regulations', 'logging'].map((d) => `src/domain/${d}`)
    .concat(['dashboard', 'map', 'monitoring', 'changeover', 'vessel-profile', 'regulatory-status', 'changeover-log'].map((d) => `src/features/${d}`))
    .concat(['browser', 'simulator'].map((d) => `src/infrastructure/geolocation/${d}`));
  const missing = need.filter((d) => !existsSync(join(root, d)));
  assert(missing.length === 0, `missing: ${missing.join(', ')}`);
  return `${need.length} dirs`;
});

// --- Report ---
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} static checks passed. (Not a build, typecheck or unit-test result.)`);
process.exit(failed ? 1 : 0);
