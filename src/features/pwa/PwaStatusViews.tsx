import type { PwaState } from '../../application/use-cases/pwaStatus';
import { describePwaState } from './describePwaState';
import type { InstallStatus } from './useInstallAdvice';

/** Banner shown above the tabs only for states that need attention. Never reloads by itself. */
export function PwaBanner({ state, onApply }: { state: PwaState; onApply: () => void }) {
  if (state.status !== 'update-available' && state.status !== 'applying-update' && state.status !== 'update-applied' && state.status !== 'failed') return null;
  const view = describePwaState(state);
  return <section className={`banner-pwa banner-pwa--${view.tone}`} role={state.status === 'failed' ? 'alert' : 'status'} aria-label="App update status">
    <strong>{view.label}</strong>
    <p>{view.detail}</p>
    {view.action === 'apply-update' && <button type="button" onClick={onApply}>Update and reload</button>}
  </section>;
}

/** Always-visible status on the More tab, including states the banner hides. */
export function PwaStatusPanel({ state, onApply }: { state: PwaState; onApply: () => void }) {
  const view = describePwaState(state);
  return <section className="panel" aria-label="App and offline status">
    <h2>App and offline status</h2>
    <p><strong>{view.label}</strong></p>
    <p>{view.detail}</p>
    {view.action === 'apply-update' && <button type="button" onClick={onApply}>Update and reload</button>}
  </section>;
}

/** Install help on the More tab (FR-010). Text comes from the pure `installAdvice`; the button exists only when the browser holds an install prompt. */
export function InstallHelpPanel({ status }: { status: InstallStatus }) {
  const { advice } = status;
  return <section className="panel" aria-label="Install this app">
    <h2>Install this app</h2>
    <p><strong>{advice.label}</strong></p>
    <p>{advice.detail}</p>
    {advice.kind === 'install-prompt-available' && <button type="button" disabled={status.busy} onClick={() => void status.install()}>Install app</button>}
    {status.outcomeText && <p role="status">{status.outcomeText}</p>}
  </section>;
}
