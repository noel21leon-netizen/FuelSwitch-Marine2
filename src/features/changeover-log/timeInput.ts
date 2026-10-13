// Conversion between <input type="datetime-local"> values (device local time) and ISO UTC strings.
// Presentation-only helpers: no regulatory or maritime formulas.
const pad = (n: number): string => String(n).padStart(2, '0');

/** ISO UTC → value for datetime-local (device local time, minute precision). Returns '' if not a valid instant. */
export function utcIsoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value (device local time) → ISO UTC with whole seconds, or null if empty/invalid. */
export function localInputToUtcIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Reject values the Date constructor silently rolled over (e.g. 31 February).
  if (utcIsoToLocalInput(d.toISOString()) !== value) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
