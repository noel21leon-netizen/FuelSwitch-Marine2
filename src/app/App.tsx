import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { indexedDbLocalStore } from '../infrastructure/persistence/indexeddb/localStore';
import { BrowserPositionProvider } from '../infrastructure/geolocation/browser/browserPositionProvider';
import { SimulatorPositionProvider, defaultSimulatorConfig } from '../infrastructure/geolocation/simulator/routeReplaySimulator';
import { BrowserNotificationProvider } from '../infrastructure/notifications/browser/browserNotificationProvider';
import { loadDemoDataset, loadDemoRoute } from '../infrastructure/regulatory-data/local/localDatasetLoader';
import { describeGpsState } from '../application/use-cases/gpsStatus';
import { MonitoringController, defaultMonitoringConfig, type AlertRecord, type MonitoringConfig, type MonitoringSnapshot } from '../application/use-cases/monitoring';
import { ChangeoverLogService } from '../application/use-cases/changeoverLog';
import { indexedDbLogStore } from '../infrastructure/persistence/indexeddb/indexedDbLogStore';
import { ChangeoverLogPanel } from '../features/changeover-log/ChangeoverLogPanel';
import { newEntryId } from '../features/changeover-log/ids';
import { browserServiceWorkerRegistrar } from '../infrastructure/pwa/browserServiceWorker';
import { browserInstallPrompt } from '../infrastructure/pwa/browserInstallPrompt';
import { usePwaStatus } from '../features/pwa/usePwaStatus';
import { useInstallAdvice } from '../features/pwa/useInstallAdvice';
import { InstallHelpPanel, PwaBanner, PwaStatusPanel } from '../features/pwa/PwaStatusViews';
import { DatasetStatusPanel } from '../features/regulatory-status/DatasetStatusPanel';
import { ADVISORY_TEXT, BACKGROUND_GPS_LIMIT_TEXT, DEMO_BANNER_TEXT, FEATURE_NAME, NOTIFICATION_LIMIT_TEXT, PRODUCT_NAME } from '../shared/constants';
import { describeDatasetStatus, describeFixAge, describeSkippedThreshold, type RegulatoryDataset, type Route } from '../domain';

type Tab = 'dashboard' | 'map' | 'plan' | 'log' | 'more';
type SavedSettings = { duration: string; margin: string; mode: 'simulator' | 'gps' };
const EMPTY_SETTINGS: SavedSettings = { duration: '', margin: '', mode: 'simulator' };
// Stable reference for usePwaStatus. Only ever called after the user taps "Update and reload" (ADR-035).
const reloadPage = () => window.location.reload();

function MapPanel({ route, dataset, snapshot }: { route: Route | null; dataset: RegulatoryDataset | null; snapshot: MonitoringSnapshot | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    map.current = m;
    // OpenStreetMap tiles are optional. The route and synthetic overlays remain visible offline.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    return () => { m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.eachLayer(layer => { if (!(layer instanceof L.TileLayer)) m.removeLayer(layer); });
    const bounds: L.LatLngExpression[] = [];
    if (route) {
      const points = route.points.map(([lon, lat]) => [lat, lon] as L.LatLngExpression);
      L.polyline(points, { color: '#3fb6c4', weight: 4 }).addTo(m); bounds.push(...points);
    }
    dataset?.polygons.forEach(poly => poly.rings.forEach((ring, index) => {
      const points = ring.map(([lon, lat]) => [lat, lon] as L.LatLngExpression);
      L.polygon(points, { color: '#f2a93b', fillOpacity: index === 0 ? 0.12 : 0 }).addTo(m); bounds.push(...points);
    }));
    const eta = snapshot?.eta.status === 'available' ? snapshot.eta : null;
    const plan = snapshot?.plan.status === 'available' ? snapshot.plan : null;
    if (eta) L.circleMarker([eta.crossingPointLonLatDeg[1], eta.crossingPointLonLatDeg[0]], { radius: 8, color: '#f2a93b' }).bindTooltip('Predicted crossing — DEMO').addTo(m);
    if (plan?.plannedStartPointLonLatDeg) L.circleMarker([plan.plannedStartPointLonLatDeg[1], plan.plannedStartPointLonLatDeg[0]], { radius: 8, color: '#a98bff' }).bindTooltip('Planned start — DEMO').addTo(m);
    const fix = snapshot?.position.ok ? snapshot.position.position : null;
    if (fix) { L.circleMarker([fix.latitudeDeg, fix.longitudeDeg], { radius: 7, color: fix.isSimulated ? '#a98bff' : '#3fb6c4' }).bindTooltip(fix.isSimulated ? 'SIMULATED vessel position' : 'Live vessel position').addTo(m); bounds.push([fix.latitudeDeg, fix.longitudeDeg]); }
    if (bounds.length) m.fitBounds(L.latLngBounds(bounds).pad(0.12)); else m.setView([0, 0], 2);
  }, [route, dataset, snapshot]);
  return <div className="map-wrap"><div ref={el} className="map" aria-label="Interactive map of the simulated route and boundary"/><p className="muted">Synthetic overlays remain available without map tiles. Map tiles require internet access.</p></div>;
}

export function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [route, setRoute] = useState<Route | null>(null);
  const [dataset, setDataset] = useState<RegulatoryDataset | null>(null);
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [settings, setSettings] = useState<SavedSettings>(EMPTY_SETTINGS);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const controller = useRef<MonitoringController | null>(null);
  const snapshotRef = useRef<MonitoringSnapshot | null>(null);
  const [sessionAlerts, setSessionAlerts] = useState<AlertRecord[]>([]);
  const pwa = usePwaStatus(browserServiceWorkerRegistrar, reloadPage);
  const install = useInstallAdvice(browserInstallPrompt);
  // Log time: simulated time while replaying (so entries sit on the simulated timeline), device clock otherwise.
  const logClock = useRef<() => string>(() => new Date().toISOString());
  logClock.current = () => (settings.mode === 'simulator' && snapshotRef.current ? snapshotRef.current.nowUtc : new Date().toISOString());
  const logService = useMemo(() => new ChangeoverLogService({ store: indexedDbLogStore, clock: () => logClock.current(), newId: newEntryId }), []);
  const controllerConfig = useMemo<MonitoringConfig>(() => defaultMonitoringConfig({ route, dataset, durationMinutes: settings.duration === '' ? null : Number(settings.duration), marginMinutes: settings.margin === '' ? null : Number(settings.margin) }), [route, dataset, settings.duration, settings.margin]);

  // Dataset status uses the same clock the monitoring controller uses (simulated time while replaying), so what is shown matches what drives the calculation.
  const datasetNowUtc = snapshot?.nowUtc ?? new Date().toISOString();
  const datasetStatus = useMemo(() => describeDatasetStatus(dataset, datasetNowUtc), [dataset, datasetNowUtc]);

  useEffect(() => {
    let active = true;
    void Promise.all([loadDemoRoute(), loadDemoDataset(), indexedDbLocalStore.read<SavedSettings>('current')])
      .then(([r, d, saved]) => { if (!active) return; if (r.ok) setRoute(r.value); else setLoadError(r.errors.join(' ')); if (d.ok) setDataset(d.value); else setLoadError(x => `${x} ${d.errors.join(' ')}`); if (saved) setSettings(saved); })
      .catch(e => { if (active) setLoadError(`Local setup could not be loaded: ${String(e)}`); });
    const onOnline = () => setOnline(true), onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { active = false; window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  useEffect(() => {
    if (!route || !dataset) return;
    const provider = settings.mode === 'simulator'
      ? new SimulatorPositionProvider(defaultSimulatorConfig(route, new Date().toISOString()), 1800)
      : new BrowserPositionProvider();
    const notifier = new BrowserNotificationProvider();
    const c = new MonitoringController({ provider, notifier, config: controllerConfig, clock: settings.mode === 'simulator' && provider instanceof SimulatorPositionProvider ? provider.simulatedNowUtc : () => new Date().toISOString() });
    controller.current?.stop(); controller.current = c;
    const unsubscribe = c.subscribe((next) => { snapshotRef.current = next; setSnapshot(next); if (next.newAlerts.length) setSessionAlerts((prev) => [...prev, ...next.newAlerts.filter((n) => !prev.some((p) => p.alert.id === n.alert.id))]); }); c.start();
    const timer = window.setInterval(() => { void c.tick(); }, 1000);
    return () => { window.clearInterval(timer); unsubscribe(); c.stop(); if (controller.current === c) controller.current = null; };
  }, [route, dataset, settings.mode]);

  useEffect(() => { if (controller.current) void controller.current.updateConfig(controllerConfig).then(setSnapshot); }, [controllerConfig]);

  // "Try GPS again": stop and start the same controller, so the last fix and the alert state are kept and only the GPS search restarts.
  function restartGps() { const c = controller.current; if (c) { c.stop(); c.start(); } }

  async function updateSettings(next: SavedSettings) {
    setSettings(next);
    try { await indexedDbLocalStore.write('current', next); setNotice('Settings saved on this device.'); }
    catch { setNotice('Settings are active for this session but could not be saved on this device.'); }
  }
  async function requestNotifications() { const permission = await new BrowserNotificationProvider().requestPermission(); setNotice(`Notification permission: ${permission}. Alerts remain best-effort while the app is open.`); }
  async function testNotification() {
    const result = await new BrowserNotificationProvider().show({ id: 'user-test', kind: 'threshold', thresholdMinutes: null, minutesUntilPlannedStart: null, plannedStartAtUtc: new Date().toISOString(), message: `[${settings.mode === 'simulator' ? 'SIMULATED · DEMO' : 'ADVISORY'}] Test alert from FuelSwitch Marine.`, labels: [settings.mode === 'simulator' ? 'SIMULATED' : 'ADVISORY', 'DEMO'] });
    setNotice(result.delivered ? 'Test notification was accepted by this browser.' : `Test alert shown in app only (${result.reason}: ${result.detail}).`);
  }

  const position = snapshot?.position;
  // Fix age is formatted by the domain helper with the same stale limit the controller applies (no formulas in the UI).
  const fixAge = describeFixAge(position ?? null, controllerConfig.settings.staleAfterSeconds);
  const reason = position && !position.ok ? position.explanation : snapshot?.providerError?.message;
  const eta = snapshot?.eta.status === 'available' ? snapshot.eta : null;
  const plan = snapshot?.plan.status === 'available' ? snapshot.plan : null;
  const badge = snapshot?.badge ?? 'UNAVAILABLE';
  // Plain-language GPS state (ADR-048). Wording lives in the application layer, not here.
  const installEnv = browserInstallPrompt.getEnvironment();
  const gps = describeGpsState({ mode: settings.mode, snapshot, platform: installEnv.isIos ? 'ios' : 'other', standalone: installEnv.isStandalone });
  const formatTime = (iso?: string) => iso ? new Date(iso).toLocaleString() : 'Unavailable';

  return <div className="app">
    <header className="app__header"><h1 className="app__title">{PRODUCT_NAME}</h1><p className="app__subtitle">{FEATURE_NAME}</p></header>
    <p className="banner-demo" role="note">{DEMO_BANNER_TEXT}</p>
    <PwaBanner state={pwa.state} onApply={() => void pwa.applyUpdate()}/>
    <div className="chips" aria-label="Status"><span className={`chip chip--${badge.toLowerCase()}`}>{badge}</span><span className="chip">{online ? 'ONLINE' : 'OFFLINE'}</span><span className="chip">{eta ? 'ETA AVAILABLE' : 'ETA UNAVAILABLE'}</span>{(pwa.state.status === 'offline-ready' || pwa.state.status === 'update-available') && <span className="chip">OFFLINE READY</span>}</div>
    <main className="app__main">
      {tab === 'dashboard' && <>
        <section className="panel"><h2>Vessel status</h2><p><strong>{badge}</strong>{reason ? ` — ${reason}` : ''}</p>
          {settings.mode === 'gps' && <div className="gps-status" role="status" aria-live="polite" data-gps-level={gps.level}>
            <p><strong>{gps.headline}</strong>{gps.detail ? ` — ${gps.detail}` : ''}</p>
            {gps.action && <p>{gps.action}</p>}
            {gps.offerRetryButton && <button onClick={restartGps}>Try GPS again</button>}
          </div>}
          <dl className="metrics"><dt>Position</dt><dd>{position?.ok ? `${position.position.latitudeDeg.toFixed(5)}, ${position.position.longitudeDeg.toFixed(5)}` : 'Unavailable'}</dd>
          <dt>Accuracy</dt><dd>{position?.ok ? `${position.position.accuracyMeters} m` : reason ?? 'No fix received'}</dd>
          <dt>Fix age</dt><dd>{fixAge.text}</dd>
          <dt>Fix time (UTC)</dt><dd>{snapshot?.lastFix ? snapshot.lastFix.observedAtUtc : 'Unavailable — no fix received'}</dd>
          <dt>SOG</dt><dd>{position?.ok && position.position.sogKnots !== null ? `${position.position.sogKnots.toFixed(1)} kn` : 'Unavailable — no reported speed'}</dd>
          <dt>COG</dt><dd>{position?.ok && position.position.cogDegreesTrue !== null ? `${position.position.cogDegreesTrue.toFixed(0)}° true` : 'Unavailable — no reported course'}</dd>
          <dt>Next boundary</dt><dd>{datasetStatus.summaryLine}</dd>
          <dt>Boundary distance</dt><dd>{eta ? `${eta.remainingDistanceNm.toFixed(1)} nm along ${eta.mode === 'route' ? 'route' : 'assumed course'}` : snapshot?.eta.status === 'unavailable' ? snapshot.eta.explanation : 'Waiting for position and local boundary data'}</dd>
          <dt>Predicted crossing</dt><dd>{eta ? formatTime(eta.crossingAtUtc) : 'Unavailable'}</dd>
          <dt>Changeover duration</dt><dd>{plan ? `${plan.durationMinutes} min (${plan.durationLabel})` : 'Enter a duration on Plan'}</dd>
          <dt>Safety margin</dt><dd>{plan ? `${plan.marginMinutes} min` : settings.margin ? `${settings.margin} min` : 'Not set'}</dd>
          <dt>Skipped alerts</dt><dd>{!snapshot ? 'Unavailable — monitoring has not started' : snapshot.skippedThresholds.length === 0 ? 'None this session' : snapshot.skippedThresholds.map((t, i) => <span className="muted" style={{ display: 'block' }} key={`${t.thresholdMinutes}-${t.recordedAtUtc}-${i}`}>{describeSkippedThreshold(t)}</span>)}</dd>
          <dt>Planned start</dt><dd>{plan ? `${formatTime(plan.plannedStartAtUtc)} · ${plan.minutesUntilPlannedStart.toFixed(0)} min` : snapshot?.plan.status === 'unavailable' ? snapshot.plan.explanation : 'Unavailable'}</dd>
        </dl>{snapshot?.newAlerts.map(a => <p className="alert" key={a.alert.id} role="status">{a.alert.message} ({a.delivery})</p>)}
        {loadError && <p role="alert">{loadError}</p>}
      </section>
      <MapPanel route={route} dataset={dataset} snapshot={snapshot}/></>}
      {tab === 'map' && <section className="panel"><h2>Route and boundary map</h2><MapPanel route={route} dataset={dataset} snapshot={snapshot}/></section>}
      {tab === 'plan' && <>
        <section className="panel"><h2>Changeover plan</h2><p>Enter the duration verified by your vessel/company procedure. The FOBAS calculation is not implemented.</p>
          <label>Manually verified duration (minutes)<input type="number" min="1" inputMode="numeric" value={settings.duration} onChange={e => void updateSettings({...settings, duration:e.target.value})}/></label>
          <label>Safety margin (minutes)<input type="number" min="0" inputMode="numeric" value={settings.margin} onChange={e => void updateSettings({...settings, margin:e.target.value})}/></label>
          <label>Position source<select value={settings.mode} onChange={e => void updateSettings({...settings, mode:e.target.value as SavedSettings['mode']})}><option value="simulator">Route replay — SIMULATED</option><option value="gps">Browser live GPS</option></select></label>
          {plan && <p>Planned start: <strong>{formatTime(plan.plannedStartAtUtc)}</strong>. Duration source: {plan.durationLabel}.</p>}
          <p className="muted">These settings are stored locally in this browser when IndexedDB is available.</p>
        </section>
        <section className="panel"><h2>Notifications</h2><p>{NOTIFICATION_LIMIT_TEXT}</p><button onClick={() => void requestNotifications()}>Enable notification permission</button><button onClick={() => void testNotification()}>Show test alert</button></section>
      </>}
      {tab === 'log' && <ChangeoverLogPanel service={logService} snapshot={snapshot} dataset={dataset} mode={settings.mode} sessionAlerts={sessionAlerts} clock={() => logClock.current()} />}
      {tab === 'more' && <><PwaStatusPanel state={pwa.state} onApply={() => void pwa.applyUpdate()}/><InstallHelpPanel status={install}/><DatasetStatusPanel view={datasetStatus} asOfUtc={datasetNowUtc} clockLabel={settings.mode === 'simulator' ? 'simulated clock' : 'device clock'}/><section className="panel"><h2>About this prototype</h2><p>{ADVISORY_TEXT}</p><p>{BACKGROUND_GPS_LIMIT_TEXT}</p></section></>}
      {notice && <p role="status" className="notice">{notice}</p>}
    </main>
    <nav className="nav" aria-label="Main">{(['dashboard','map','plan','log','more'] as Tab[]).map(t => <button key={t} type="button" className="nav__btn" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t[0]!.toUpperCase()+t.slice(1)}</button>)}</nav>
  </div>;
}
