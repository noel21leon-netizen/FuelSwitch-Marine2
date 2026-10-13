// NFR-004: domain logic stays pure. Import-boundary + forbidden-global check over src/domain.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const domainDir = join(root, 'src', 'domain');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('src/domain is pure TypeScript (NFR-004)', () => {
  const files = walk(domainDir);
  it('finds domain files', () => expect(files.length).toBeGreaterThan(8));

  it('imports nothing from UI, infrastructure, application, features or browser/map/db libraries', () => {
    const forbidden = /from\s+['"](react|react-dom|leaflet|idb|workbox-[\w-]+|@turf\/[\w-]+|fake-indexeddb)['"]|from\s+['"][./]*(infrastructure|features|app|application)\//;
    for (const f of files) expect(forbidden.test(stripComments(readFileSync(f, 'utf8')))).toBe(false);
  });
  it('uses no browser globals (window, document, navigator, localStorage, indexedDB, fetch, Notification)', () => {
    const globals = /\b(window|document|navigator|localStorage|sessionStorage|indexedDB|fetch|Notification|XMLHttpRequest)\b/;
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8')).replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, "''");
      expect(globals.test(code)).toBe(false);
    }
  });
  it('relative imports stay inside src/domain or src/shared', () => {
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      for (const m of code.matchAll(/from\s+'(\.[^']*)'/g)) {
        const target = join(dirname(f), m[1] as string);
        expect(target.startsWith(domainDir) || target.startsWith(join(root, 'src', 'shared'))).toBe(true);
      }
    }
  });
  it('does not read the wall clock: time is always passed in (determinism, NFR-006)', () => {
    for (const f of files) expect(/Date\.now\(\)|new Date\(\)/.test(stripComments(readFileSync(f, 'utf8')))).toBe(false);
  });
  it('contains no FOBAS formula implementation (method is UNKNOWN)', () => {
    for (const f of files) expect(/function\s+\w*fobas\w*\s*\(/i.test(stripComments(readFileSync(f, 'utf8')))).toBe(false);
  });
});
