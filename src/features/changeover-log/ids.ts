// Entry id generator, injected into the application layer. crypto.randomUUID needs a secure context, so a fallback exists.
let counter = 0;
export function newEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  counter += 1;
  return `entry-${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}
