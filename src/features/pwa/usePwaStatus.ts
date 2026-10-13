import { useCallback, useEffect, useReducer } from 'react';
import type { ServiceWorkerRegistrar } from '../../application/ports';
import { INITIAL_PWA_STATE, applyPwaUpdate, reducePwaState, type PwaState } from '../../application/use-cases/pwaStatus';

export interface PwaStatus {
  readonly state: PwaState;
  /** Wire to a button the user taps. Never call it automatically. */
  readonly applyUpdate: () => Promise<void>;
}

/** `reload` must be a stable function (define it outside the component). */
export function usePwaStatus(registrar: ServiceWorkerRegistrar, reload: () => void): PwaStatus {
  const [state, dispatch] = useReducer(reducePwaState, INITIAL_PWA_STATE);
  useEffect(() => {
    // subscribe first so no event is missed; the registrar replays earlier events and start() is idempotent (StrictMode runs effects twice in dev).
    const unsubscribe = registrar.subscribe(dispatch);
    registrar.start();
    return unsubscribe;
  }, [registrar]);
  const applyUpdate = useCallback(() => applyPwaUpdate({ state, registrar, dispatch, reload }), [state, registrar, reload]);
  return { state, applyUpdate };
}
