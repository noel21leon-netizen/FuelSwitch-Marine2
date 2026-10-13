import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InstallPromptPort } from '../../application/ports';
import { describeInstallOutcome, installAdvice, type InstallAdvice } from '../../application/use-cases/installAdvice';

export interface InstallStatus {
  readonly advice: InstallAdvice;
  /** Text describing the last Install app tap, or '' before any tap. */
  readonly outcomeText: string;
  readonly busy: boolean;
  /** Wire to a button the user taps. Never call it automatically. */
  readonly install: () => Promise<void>;
}

export function useInstallAdvice(port: InstallPromptPort): InstallStatus {
  const [env, setEnv] = useState(() => port.getEnvironment());
  const [outcomeText, setOutcomeText] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    const refresh = () => setEnv(port.getEnvironment());
    refresh(); // the event may have been captured between first render and this effect
    return port.subscribe(refresh);
  }, [port]);
  const advice = useMemo(() => installAdvice(env), [env]);
  const install = useCallback(async () => {
    if (busyRef.current) return; // a second tap while the prompt is open does nothing
    busyRef.current = true; setBusy(true);
    try { setOutcomeText(describeInstallOutcome(await port.promptInstall())); }
    finally { busyRef.current = false; setBusy(false); }
  }, [port]);
  return { advice, outcomeText, busy, install };
}
