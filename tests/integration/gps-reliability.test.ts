// FR-003 / ADR-048: automatic restart of the GPS search, with fake geolocation and fake timers (no GPS, no real waiting).
import { describe, it, expect } from 'vitest';
import type { PositionEvent, PositionListener, PositionProvider } from '../../src/application/ports';
import { defaultMonitoringConfig, MonitoringController } from '../../src/application/use-cases/monitoring';
import {
  BrowserPositionProvider, type GeolocationLike, type GeolocationPositionLike, type TimerApi,
} from '../../src/infrastructure/geolocation/browser/browserPositionProvider';

const T0 = Date.UTC(2026, 9, 12, 6, 0, 0);
const fix = (): GeolocationPositionLike => ({ coords: { latitude: 0.5, longitude: -1, accuracy: 8, speed: null, heading: null }, timestamp: T0 });

type Opts = { maximumAge?: number; enableHighAccuracy?: boolean; timeout?: number } | undefined;
class FakeGeo implements GeolocationLike {
  nextId = 1; started: number[] = []; cleared: number[] = []; options: Opts[] = [];
  handlers = new Map<number, { ok: (p: GeolocationPositionLike) => void; err: (e: { code: number; message: string }) => void }>();
  watchPosition(ok: (p: GeolocationPositionLike) => void, err: (e: { code: number; message: string }) => void, o?: Opts): number {
    const id = this.nextId; this.nextId += 1;
    this.started.push(id); this.options.push(o); this.handlers.set(id, { ok, err });
    return id;
  }
  clearWatch(id: number): void { this.cleared.push(id); }
  get latestId(): number { return this.started[this.started.length - 1] as number; }
  fix(id = this.latestId): void { this.handlers.get(id)?.ok(fix()); }
  fail(code: number, id = this.latestId): void { this.handlers.get(id)?.err({ code, message: '' }); }
}

/** Timers that only move when the test says so. */
class FakeTimers implements TimerApi {
  now = 0; private seq = 0; private items: { id: number; at: number; fn: () => void }[] = [];
  setTimeout(fn: () => void, ms: number): unknown { this.seq += 1; this.items.push({ id: this.seq, at: this.now + ms, fn }); return this.seq; }
  clearTimeout(h: unknown): void { this.items = this.items.filter((i) => i.id !== h); }
  get pending(): number { return this.items.length; }
  advanceSeconds(s: number): void {
    const end = this.now + s * 1000;
    for (;;) {
      const due = this.items.filter((i) => i.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.items = this.items.filter((i) => i.id !== due.id);
      this.now = due.at; due.fn();
    }
    this.now = end;
  }
}

function setup(over: { silenceRestartSeconds?: number } = {}) {
  const geo = new FakeGeo(); const timers = new FakeTimers(); const events: PositionEvent[] = [];
  const p = new BrowserPositionProvider({ geolocation: geo, isSecureContext: true }, { timers, ...over });
  p.start((e) => { events.push(e); });
  return { geo, timers, events, p };
}
const errors = (events: PositionEvent[]) => events.flatMap((e) => (e.type === 'error' ? [e] : []));

describe('restart after a recoverable GPS error', () => {
  it('reports the error with the retry plan, drops the watch and waits before restarting', () => {
    const { geo, timers, events } = setup({ silenceRestartSeconds: 0 });
    geo.fail(2);
    expect(errors(events)[0]).toMatchObject({ kind: 'position-unavailable', retry: { attempt: 1, inSeconds: 2 } });
    expect(geo.cleared).toEqual([1]);
    expect(geo.started).toEqual([1]);
    timers.advanceSeconds(1);
    expect(geo.started).toEqual([1]);
    timers.advanceSeconds(1);
    expect(geo.started).toEqual([1, 2]);
  });
  it('restarts with the same strict options: high accuracy and never a cached fix', () => {
    const { geo, timers } = setup({ silenceRestartSeconds: 0 });
    geo.fail(3); timers.advanceSeconds(2);
    expect(geo.options[1]?.maximumAge).toBe(0);
    expect(geo.options[1]?.enableHighAccuracy).toBe(true);
  });
  it('waits longer each time (2, 4, 8, 15 s) and then keeps 15 s', () => {
    const { geo, timers, events } = setup({ silenceRestartSeconds: 0 });
    for (const wait of [2, 4, 8, 15, 15]) {
      geo.fail(2);
      expect(errors(events).at(-1)?.retry?.inSeconds).toBe(wait);
      timers.advanceSeconds(wait);
    }
    expect(geo.started).toHaveLength(6);
  });
  it('a good fix resets the wait back to 2 s', () => {
    const { geo, timers, events } = setup({ silenceRestartSeconds: 0 });
    geo.fail(2); timers.advanceSeconds(2); geo.fail(2); timers.advanceSeconds(4);
    geo.fix();
    geo.fail(2);
    expect(errors(events).at(-1)?.retry).toEqual({ attempt: 1, inSeconds: 2 });
  });
  it('ignores late callbacks from a watch that was already dropped', () => {
    const { geo, events } = setup({ silenceRestartSeconds: 0 });
    geo.fail(2);
    const before = events.length;
    geo.fix(1); geo.fail(2, 1);
    expect(events).toHaveLength(before);
  });
});

describe('errors that retrying cannot fix', () => {
  it('permission denied is reported once, with no retry and no timers left running', () => {
    const { geo, timers, events } = setup();
    geo.fail(1);
    const e = errors(events);
    expect(e).toHaveLength(1);
    expect(e[0]?.kind).toBe('permission-denied');
    expect(e[0]?.retry).toBeUndefined();
    expect(timers.pending).toBe(0);
    timers.advanceSeconds(600);
    expect(geo.started).toEqual([1]);
  });
  it('an invalid reading is reported but does not restart anything', () => {
    const { geo, timers, events } = setup({ silenceRestartSeconds: 0 });
    geo.handlers.get(1)?.ok({ coords: { latitude: Number.NaN, longitude: 0, accuracy: 5, speed: null, heading: null }, timestamp: T0 });
    expect(errors(events)[0]?.kind).toBe('invalid-fix');
    expect(errors(events)[0]?.retry).toBeUndefined();
    expect(timers.pending).toBe(0);
  });
});

describe('silent stall watchdog', () => {
  it('restarts the watch after 45 s of silence without reporting an error', () => {
    const { geo, timers, events } = setup();
    timers.advanceSeconds(44);
    expect(geo.started).toEqual([1]);
    timers.advanceSeconds(1);
    expect(geo.started).toEqual([1, 2]);
    expect(geo.cleared).toEqual([1]);
    expect(errors(events)).toHaveLength(0);
  });
  it('any fix pushes the next restart back', () => {
    const { geo, timers } = setup();
    timers.advanceSeconds(40); geo.fix();
    timers.advanceSeconds(44);
    expect(geo.started).toEqual([1]);
    timers.advanceSeconds(1);
    expect(geo.started).toEqual([1, 2]);
  });
  it('can be switched off', () => {
    const { geo, timers } = setup({ silenceRestartSeconds: 0 });
    timers.advanceSeconds(3600);
    expect(geo.started).toEqual([1]);
  });
});

describe('stop and start', () => {
  it('stop cancels every timer and nothing restarts afterwards', () => {
    const { geo, timers, p } = setup();
    geo.fail(2);
    p.stop();
    expect(timers.pending).toBe(0);
    timers.advanceSeconds(600);
    expect(geo.started).toEqual([1]);
  });
  it('can be started again after a stop with a fresh watch and a reset wait', () => {
    const { geo, timers, events, p } = setup({ silenceRestartSeconds: 0 });
    geo.fail(2); timers.advanceSeconds(2); geo.fail(2);
    p.stop();
    p.start((e) => { events.push(e); });
    expect(geo.started).toHaveLength(3);
    geo.fail(2);
    expect(errors(events).at(-1)?.retry).toEqual({ attempt: 1, inSeconds: 2 });
  });
});

describe('monitoring controller with the retry information', () => {
  class FakeProvider implements PositionProvider {
    readonly kind = 'browser-gps' as const; starts = 0; stops = 0; listener: PositionListener | null = null;
    start(l: PositionListener): void { this.starts += 1; this.listener = l; }
    stop(): void { this.stops += 1; }
  }
  const make = () => {
    const provider = new FakeProvider();
    const controller = new MonitoringController({ provider, notifier: null, clock: () => '2026-10-12T06:00:00Z', config: defaultMonitoringConfig() });
    controller.start();
    return { provider, controller };
  };
  it('keeps the retry plan next to the error so the dashboard can show it', async () => {
    const { provider, controller } = make();
    provider.listener?.({ type: 'error', kind: 'timeout', message: 'Timed out waiting for a GPS fix.', retry: { attempt: 2, inSeconds: 4 } });
    const s = await controller.tick();
    expect(s.providerError?.retry).toEqual({ attempt: 2, inSeconds: 4 });
    expect(s.providerError?.kind).toBe('timeout');
  });
  it('an error without a retry plan has no retry field', async () => {
    const { provider, controller } = make();
    provider.listener?.({ type: 'error', kind: 'permission-denied', message: 'denied' });
    const s = await controller.tick();
    expect(s.providerError?.retry).toBeUndefined();
  });
  it('stop then start (Try GPS again) clears the old error and asks the provider to start again', async () => {
    const { provider, controller } = make();
    provider.listener?.({ type: 'error', kind: 'permission-denied', message: 'denied' });
    expect((await controller.tick()).providerError?.kind).toBe('permission-denied');
    controller.stop(); controller.start();
    expect(provider.starts).toBe(2);
    expect(provider.stops).toBe(1);
    expect((await controller.tick()).providerError).toBeNull();
  });
});
