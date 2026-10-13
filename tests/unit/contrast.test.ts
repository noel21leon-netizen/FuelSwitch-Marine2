// Contrast check for the design tokens (R-039). Pure arithmetic on the CSS file; no browser.
// WCAG 2.x relative luminance / contrast ratio. Expected thresholds are the WCAG AA text minimum (4.5:1), not values taken from the code.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tokensCss = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');
const baseCss = readFileSync(join(root, 'src/styles/base.css'), 'utf8');

const token = (name: string): string => {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokensCss);
  if (!m) throw new Error(`token ${name} not found`);
  return m[1] as string;
};
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('contrast of secondary (muted) text — R-039', () => {
  const surfaces = ['--ink-900', '--ink-800', '--ink-700'];
  it('the secondary TEXT token reaches 4.5:1 on every surface it can sit on', () => {
    for (const s of surfaces) expect(ratio(token('--ink-300'), token(s))).toBeGreaterThanOrEqual(4.5);
  });
  it('primary text is comfortably above 7:1 on every surface (sanity check of the calculation)', () => {
    for (const s of surfaces) expect(ratio(token('--paper'), token(s))).toBeGreaterThanOrEqual(7);
  });
  it('the old border colour is NOT a text-safe colour on the panel surface (documents why it was replaced)', () => {
    expect(ratio(token('--ink-500'), token('--ink-800'))).toBeLessThan(4.5);
  });
  it('no rule uses the border colour as a TEXT colour any more', () => {
    expect(/(^|[;{\s])color:\s*var\(--ink-500\)/m.test(baseCss)).toBe(false);
  });
  it('the muted classes use the text-safe token', () => {
    expect(baseCss).toMatch(/\.muted\s*\{\s*color:\s*var\(--ink-300\)/);
    expect(baseCss).toMatch(/\.metrics dt\s*\{\s*color:\s*var\(--ink-300\)/);
  });
});
