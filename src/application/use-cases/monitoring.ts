// Monitoring use-case (FR-001/003/004/005/006/008 wiring). No browser APIs: time comes from an injected clock, position and
// notifications come from ports. Data flow (KOS 03):
//   fix → assessPosition → analyzeRouteApproach|analyzeCourseProjection → computeEta → planChangeover → evaluateAlerts
// Any failed link yields an unavailable-with-reason result; nothing is defaulted.
import {
  analyzeCourseProjection, analyzeRouteApproach, assessPosition, computeEta, DEFAULT_ALERT_THRESHOLDS_MINUTES,
  DEFAULT_DOMAIN_SETTINGS, evaluateAlerts, INITIAL_ALERT_STATE, ManualVerifiedDurationCalculator, planChangeover,
  type AlertDue, type AlertState, type SkippedThreshold, type ChangeoverPlanResult, type DomainSettings, type EtaResult, type EtaMode,
  type PositionAssessment, type RegulatoryDataset, type Route, type VesselPosition,
} from '../../domain';
import type { AlertDelivery, NotificationProvider, PositionErrorKind, PositionEvent, PositionProvider, PositionRetry } from '../ports';

export type PositionBadge = 'LIVE' | 'SIMULATED' | 'STALE' | 'UNAVAILABLE';

export interface MonitoringConfig {
  readonly route: Route | null;
  readonly dataset: RegulatoryDataset | null;
  readonly mode: EtaMode;
  /** Manually verified changeover duration in minutes; null = not entered. */
  readonly durationMinutes: number | null;
  /** Safety margin in minutes; null = not set (no silent default, ADR-019). */
  readonly marginMinutes: number | null;
  readonly alertThresholdsMinutes: readonly number[];
  readonly settings: DomainSettings;
}

export function defaultMonitoringConfig(over: Partial<MonitoringConfig> = {}): MonitoringConfig {
  return {
    route: null, dataset: null, mode: 'route', durationMinutes: null, marginMinutes: null,
    alertThresholdsMinutes: DEFAULT_ALERT_THRESHOLDS_MINUTES, settings: DEFAULT_DOMAIN_SETTINGS, ...over,
  };
}

export interface ProviderError { readonly kind: PositionErrorKind; readonly message: string; readonly atUtc: string; readonly retry?: PositionRetry }

export interface AlertRecord {
  readonly alert: AlertDue;
  readonly delivery: AlertDelivery;
  /** Why it was in-app only (permission, unsupported, failed), when applicable. */
  readonly deliveryNote: string | null;
  readonly raisedAtUtc: string;
}

/** A skipped alert threshold plus when the controller saw it. Session-only, like the alert list (R-030). */
export interface SkippedThresholdRecord extends SkippedThreshold { readonly recordedAtUtc: string }

export interface MonitoringSnapshot {
  readonly nowUtc: string;
  readonly badge: PositionBadge;
  readonly position: PositionAssessment;
  readonly lastFix: VesselPosition | null;
  readonly providerError: ProviderError | null;
  readonly eta: EtaResult;
  readonly plan: ChangeoverPlanResult;
  /** Alerts raised by THIS evaluation (empty when nothing new is due). */
  readonly newAlerts: readonly AlertRecord[];
  /** Every threshold the scheduler skipped in this controller's lifetime (cumulative, oldest first). Empty after a restart. */
  readonly skippedThresholds: readonly SkippedThresholdRecord[];
}

export function positionBadge(assessment: PositionAssessment): PositionBadge {
  if (assessment.ok) return assessment.position.isSimulated ? 'SIMULATED' : 'LIVE';
  if (assessment.reason === 'stale-fix') return 'STALE';
  // No fix, invalid fix or poor accuracy → UNAVAILABLE (the reason is shown separately).
  return 'UNAVAILABLE';
}

/** Pure evaluation of one moment. Used by the controller and directly by tests/UI. */
export function evaluateMonitoring(input: {
  readonly fix: VesselPosition | null;
  readonly config: MonitoringConfig;
  readonly nowUtc: string;
  readonly alertState: AlertState;
  readonly progressAlongRouteNm: number | null;
}): {
  position: PositionAssessment; eta: EtaResult; plan: ChangeoverPlanResult;
  alerts: ReturnType<typeof evaluateAlerts>;
} {
  const { fix, config, nowUtc } = input;
  const position = assessPosition(fix, nowUtc, config.settings);
  const base = { position: fix, dataset: config.dataset, nowUtc, settings: config.settings };
  const approach = config.mode === 'route'
    ? analyzeRouteApproach({
        ...base, route: config.route,
        progressHint: input.progressAlongRouteNm === null ? null : { previousAlongRouteNm: input.progressAlongRouteNm },
      })
    : analyzeCourseProjection(base);
  const eta = computeEta(approach, config.settings);
  const plan = planChangeover(eta, new ManualVerifiedDurationCalculator(config.durationMinutes), config.marginMinutes, nowUtc);
  const alerts = evaluateAlerts(plan, config.alertThresholdsMinutes, input.alertState, nowUtc);
  return { position, eta, plan, alerts };
}

export interface MonitoringDeps {
  readonly provider: PositionProvider;
  readonly notifier: NotificationProvider | null;
  /** Returns "now" as ISO UTC. In simulator mode pass the simulator's clock so fix age stays meaningful. */
  readonly clock: () => string;
  readonly config: MonitoringConfig;
}

export type SnapshotListener = (snapshot: MonitoringSnapshot) => void;

export class MonitoringController {
  private config: MonitoringConfig;
  private lastFix: VesselPosition | null = null;
  private providerError: ProviderError | null = null;
  private alertState: AlertState = INITIAL_ALERT_STATE;
  private progressAlongRouteNm: number | null = null;
  private skippedThresholds: readonly SkippedThresholdRecord[] = [];
  private listeners = new Set<SnapshotListener>();
  private running = false;
  private latest: MonitoringSnapshot | null = null;

  constructor(private readonly deps: MonitoringDeps) {
    this.config = deps.config;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  get snapshot(): MonitoringSnapshot | null { return this.latest; }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.providerError = null; // a fresh start (e.g. Try GPS again) shows "searching" until the provider reports something new
    this.deps.provider.start((e) => { void this.onEvent(e); });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.deps.provider.stop();
  }

  /** Settings changed (duration, margin, route, thresholds…): recalculate immediately (FR-006). Progress is reset if the route changed. */
  updateConfig(config: MonitoringConfig): Promise<MonitoringSnapshot> {
    if (config.route !== this.config.route || config.mode !== this.config.mode) this.progressAlongRouteNm = null;
    this.config = config;
    return this.evaluate();
  }

  /** Re-evaluate with no new fix, so an old fix ages into STALE. The caller drives this on a timer. */
  tick(): Promise<MonitoringSnapshot> { return this.evaluate(); }

  private async onEvent(e: PositionEvent): Promise<void> {
    if (e.type === 'position') {
      this.lastFix = e.position;
      this.providerError = null;
    } else if (e.type === 'error') {
      // The last fix is kept (it will age to STALE); the error is shown alongside — never hidden, never replaced by a made-up value.
      this.providerError = { kind: e.kind, message: e.message, atUtc: this.deps.clock(), ...(e.retry ? { retry: e.retry } : {}) };
    }
    await this.evaluate();
  }

  private async evaluate(): Promise<MonitoringSnapshot> {
    const nowUtc = this.deps.clock();
    const r = evaluateMonitoring({
      fix: this.lastFix, config: this.config, nowUtc, alertState: this.alertState, progressAlongRouteNm: this.progressAlongRouteNm,
    });
    this.alertState = r.alerts.state;
    // The scheduler decides what was skipped and why; the controller only remembers it for the session.
    if (r.alerts.skippedDetail.length > 0) {
      this.skippedThresholds = [...this.skippedThresholds, ...r.alerts.skippedDetail.map((d) => ({ ...d, recordedAtUtc: nowUtc }))];
    }
    if (r.eta.status === 'available' && this.config.mode === 'route') this.progressAlongRouteNm = r.eta.vesselAlongPathNm;

    const newAlerts: AlertRecord[] = [];
    for (const alert of r.alerts.due) newAlerts.push(await this.deliver(alert, nowUtc));

    const snapshot: MonitoringSnapshot = {
      nowUtc, badge: positionBadge(r.position), position: r.position, lastFix: this.lastFix,
      providerError: this.providerError, eta: r.eta, plan: r.plan, newAlerts, skippedThresholds: this.skippedThresholds,
    };
    this.latest = snapshot;
    for (const l of this.listeners) l(snapshot);
    return snapshot;
  }

  private async deliver(alert: AlertDue, raisedAtUtc: string): Promise<AlertRecord> {
    const notifier = this.deps.notifier;
    if (!notifier) return { alert, delivery: 'in-app-only', deliveryNote: 'No notification provider.', raisedAtUtc };
    const result = await notifier.show(alert);
    if (result.delivered) return { alert, delivery: 'notified', deliveryNote: null, raisedAtUtc };
    return { alert, delivery: 'in-app-only', deliveryNote: `${result.reason}: ${result.detail}`, raisedAtUtc };
  }
}
