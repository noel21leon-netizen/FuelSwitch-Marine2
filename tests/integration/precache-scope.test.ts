// 5C-2 / ADR-009, ADR-039: the service worker precaches the app shell + bundled synthetic data and has NO runtime caching,
// so no regulatory dataset can be served from a runtime cache. Static checks of vite.config.ts and src/sw.ts: they do not
// prove what a browser caches (NOT RUN in a browser).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');
/** Removes comments but leaves string literals alone: a glob such as '**\/*.{js}' contains "/*" and must not be read as a comment. */
function strip(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    const next = src[i + 1];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
    } else { out += c; i++; }
  }
  return out;
}
const viteConfig = strip(read('vite.config.ts'));
const sw = strip(read('src/sw.ts'));

/** Extension list from `globPatterns: ['**\/*.{a,b,c}']`. */
function precachedExtensions(): string[] {
  const m = viteConfig.match(/globPatterns\s*:\s*\[([^\]]*)\]/);
  if (!m) throw new Error('globPatterns not found in vite.config.ts');
  const exts: string[] = [];
  for (const pattern of (m[1] as string).matchAll(/['"]([^'"]+)['"]/g)) {
    const braces = (pattern[1] as string).match(/\*\.\{([^}]*)\}$/);
    const single = (pattern[1] as string).match(/\*\.(\w+)$/);
    if (braces) exts.push(...(braces[1] as string).split(',').map((e) => e.trim()));
    else if (single) exts.push(single[1] as string);
  }
  return exts;
}

describe('precache scope (vite.config.ts)', () => {
  it('uses the injectManifest strategy (our own sw.ts, so nothing is generated behind our back)', () => {
    expect(/strategies\s*:\s*['"]injectManifest['"]/.test(viteConfig)).toBe(true);
  });
  it('geojson is in injectManifest.globPatterns, so the bundled demo dataset and route are precached', () => {
    expect(precachedExtensions()).toContain('geojson');
  });
  it('the shell types are precached too (js, css, html, webmanifest)', () => {
    for (const e of ['js', 'css', 'html', 'webmanifest']) expect(precachedExtensions()).toContain(e);
  });
  it('every bundled demo-data file has a precached extension', () => {
    for (const f of ['public/demo-data/synthetic-eca.geojson', 'public/demo-data/synthetic-route.geojson']) {
      expect(existsSync(join(root, f))).toBe(true);
      expect(precachedExtensions()).toContain(extname(f).slice(1));
    }
  });
  it('configures no runtimeCaching (that option only exists for generateSW; it must not appear here)', () => {
    expect(/runtimeCaching/.test(viteConfig)).toBe(false);
  });
});

describe('no runtime caching in src/sw.ts', () => {
  it('registers exactly one route: the navigation route', () => {
    const calls = [...sw.matchAll(/registerRoute\s*\(/g)];
    expect(calls).toHaveLength(1);
    expect(/registerRoute\s*\(\s*new\s+NavigationRoute\s*\(/.test(sw)).toBe(true);
  });
  it('imports no caching-strategy or expiration module and uses no caching strategy class', () => {
    expect(/workbox-(strategies|expiration|cacheable-response|background-sync|broadcast-update)/.test(sw)).toBe(false);
    expect(/\b(CacheFirst|NetworkFirst|StaleWhileRevalidate|CacheOnly|NetworkOnly)\b/.test(sw)).toBe(false);
  });
  it('imports only workbox-precaching and workbox-routing', () => {
    const specs = [...sw.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect([...specs].sort()).toEqual(['workbox-precaching', 'workbox-routing']);
  });
  it('has no hand-written fetch handler and never opens a cache itself', () => {
    expect(/addEventListener\s*\(\s*['"]fetch['"]/.test(sw)).toBe(false);
    expect(/\bcaches\s*\.\s*(open|put|add|addAll)\b/.test(sw)).toBe(false);
  });
  it('never calls clientsClaim() or skipWaiting() outside the SKIP_WAITING message handler (ADR-035)', () => {
    expect(/clientsClaim\s*\(/.test(sw)).toBe(false);
    expect([...sw.matchAll(/skipWaiting\s*\(/g)]).toHaveLength(1);
    expect(/SKIP_WAITING[\s\S]*skipWaiting\s*\(/.test(sw)).toBe(true);
  });
});
