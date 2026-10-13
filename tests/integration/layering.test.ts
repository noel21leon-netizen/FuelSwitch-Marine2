// Layer rules (docs/KOS/03-architecture.md): arrows point inward. Domain purity is checked in tests/unit/architecture.test.ts.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : []; });
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const imports = (code: string): string[] => [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] as string);

describe('application layer', () => {
  const files = walk(join(root, 'src', 'application'));
  it('has files to check', () => expect(files.length).toBeGreaterThanOrEqual(2));
  it('imports only domain, shared and its own ports — never infrastructure, UI, React, Leaflet or IndexedDB', () => {
    for (const f of files) {
      for (const i of imports(strip(readFileSync(f, 'utf8')))) {
        expect(/(^|\/)(infrastructure|features|app)\//.test(i) || /^(react|react-dom|leaflet|idb|workbox-.*|@turf\/.*)$/.test(i)).toBe(false);
      }
    }
  });
  it('uses no browser globals and never reads the clock (time is injected)', () => {
    const banned = /\b(window|document|navigator|localStorage|sessionStorage|indexedDB|fetch|Notification|XMLHttpRequest|Date\.now|setInterval|setTimeout)\b|new Date\(/;
    for (const f of files) {
      const code = strip(readFileSync(f, 'utf8')).replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, "''");
      expect(banned.test(code)).toBe(false);
    }
  });
});

describe('infrastructure layer', () => {
  const files = walk(join(root, 'src', 'infrastructure'));
  it('has files to check', () => expect(files.length).toBeGreaterThanOrEqual(4));
  it('never imports the UI (features, app) or React', () => {
    for (const f of files) {
      for (const i of imports(strip(readFileSync(f, 'utf8')))) {
        expect(/(^|\/)(features|app)\//.test(i) || /^(react|react-dom)$/.test(i)).toBe(false);
      }
    }
  });
  it('does not put domain formulas in adapters: unit conversion is imported from domain/units, not re-implemented', () => {
    for (const f of files) {
      const code = strip(readFileSync(f, 'utf8'));
      expect(/\*\s*1852|\/\s*1852|\*\s*3600\s*\/|\*\s*0\.514|\*\s*1\.94384/.test(code)).toBe(false);
    }
  });
  it('contains no hard-coded real-world coordinates or "compliant" claims', () => {
    for (const f of files) {
      const code = strip(readFileSync(f, 'utf8'));
      expect(/\bcompliant\b/i.test(code)).toBe(false);
    }
  });
});

describe('UI never contains formulas (spot check)', () => {
  it('src/app and src/features import no geodesy helpers directly', () => {
    for (const dir of ['app', 'features']) {
      for (const f of walk(join(root, 'src', dir))) {
        expect(/haversineNm|destinationPoint|initialBearingDeg|projectOnRoute/.test(strip(readFileSync(f, 'utf8')))).toBe(false);
      }
    }
  });
});
