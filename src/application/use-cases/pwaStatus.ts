// PWA lifecycle state (FR-010, NFR-003). Pure reducer + one small orchestration function.
// No browser globals and no clock: the service-worker adapter and the page reload are injected (ADR-034/035).
import type { PwaApplyResult, PwaLifecycleEvent, PwaUnsupportedReason, ServiceWorkerRegistrar } from '../ports';

export type PwaState =
  | { readonly status: 'not-started' }
  | { readonly status: 'unsupported'; readonly reason: PwaUnsupportedReason }
  | { readonly status: 'registering' }
  | { readonly status: 'registered' }
  | { readonly status: 'offline-ready' }
  | { readonly status: 'update-available'; readonly applyError: string | null }
  | { readonly status: 'applying-update' }
  | { readonly status: 'update-applied' }
  | { readonly status: 'failed'; readonly message: string };

export type PwaUserAction =
  | { readonly type: 'apply-requested' }
  | { readonly type: 'update-applied' }
  | { readonly type: 'apply-failed'; readonly message: string };

export type PwaAction = PwaLifecycleEvent | PwaUserAction;

export const INITIAL_PWA_STATE: PwaState = { status: 'not-started' };

const isUpdateFlow = (s: PwaState): boolean =>
  s.status === 'update-available' || s.status === 'applying-update' || s.status === 'update-applied';

/**
 * Rules:
 *  - An update flow is never downgraded by a late "shell-cached" / "registered" event (events can arrive in either order).
 *  - "update-available" is only ever left by an explicit user action; "applying-update" only by the adapter's answer.
 *  - Unsupported / failed are shown as such; a late "shell-cached" never turns them into "offline-ready".
 */
export function reducePwaState(state: PwaState, action: PwaAction): PwaState {
  switch (action.type) {
    case 'unsupported':
      return { status: 'unsupported', reason: action.reason };
    case 'registering':
      return state.status === 'not-started' || state.status === 'failed' ? { status: 'registering' } : state;
    case 'registered':
      return state.status === 'not-started' || state.status === 'registering' ? { status: 'registered' } : state;
    case 'shell-cached':
      return isUpdateFlow(state) || state.status === 'unsupported' || state.status === 'failed' ? state : { status: 'offline-ready' };
    case 'update-waiting':
      return isUpdateFlow(state) ? state : { status: 'update-available', applyError: null };
    case 'failed':
      return state.status === 'update-applied' ? state : { status: 'failed', message: action.message };
    case 'apply-requested':
      return state.status === 'update-available' ? { status: 'applying-update' } : state;
    case 'update-applied':
      return state.status === 'applying-update' ? { status: 'update-applied' } : state;
    case 'apply-failed':
      return state.status === 'applying-update' ? { status: 'update-available', applyError: action.message } : state;
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

export interface ApplyPwaUpdateDeps {
  readonly state: PwaState;
  readonly registrar: ServiceWorkerRegistrar;
  readonly dispatch: (action: PwaAction) => void;
  /** Reloads the page. Called ONLY after the user asked for the update and the new worker is in control. */
  readonly reload: () => void;
}

/** User tapped "Update and reload". Does nothing unless an update is actually waiting. Never reloads on its own. */
export async function applyPwaUpdate(deps: ApplyPwaUpdateDeps): Promise<void> {
  if (deps.state.status !== 'update-available') return;
  deps.dispatch({ type: 'apply-requested' });
  let result: PwaApplyResult;
  try {
    result = await deps.registrar.applyUpdate();
  } catch (error) {
    result = { ok: false, message: `The update could not be applied: ${String(error)}` };
  }
  if (result.ok) {
    deps.dispatch({ type: 'update-applied' });
    deps.reload();
  } else {
    deps.dispatch({ type: 'apply-failed', message: result.message });
  }
}
