import { useCallback, useEffect, useState } from 'react';
import type { ChangeoverLogEntry } from '../../domain';
import type { ChangeoverLogService, LogActionResult, LogLoadStatus } from '../../application/use-cases/changeoverLog';

export interface LogState {
  readonly entries: readonly ChangeoverLogEntry[];
  readonly loaded: boolean;
  readonly status: LogLoadStatus;
  /** Last action message (success, save failure or validation error), shown to the user. */
  readonly message: string;
  readonly messageIsError: boolean;
}

/** Holds the service's entries in React state and turns every action result into a visible message. */
export function useChangeoverLog(service: ChangeoverLogService) {
  const [state, setState] = useState<LogState>({ entries: [], loaded: false, status: { rejectedCount: 0, loadError: null }, message: '', messageIsError: false });

  useEffect(() => {
    let active = true;
    void service.load().then((status) => { if (active) setState({ entries: service.list(), loaded: true, status, message: '', messageIsError: false }); });
    return () => { active = false; };
  }, [service]);

  const run = useCallback(async (action: Promise<LogActionResult>, okText: string): Promise<LogActionResult> => {
    const result = await action;
    setState((s) => ({
      ...s, entries: service.list(),
      message: !result.ok ? result.explanation : result.savedOnDevice ? okText : `${okText} ${result.saveError ?? 'It was NOT saved on this device.'}`,
      messageIsError: !result.ok || !result.savedOnDevice,
    }));
    return result;
  }, [service]);

  return { state, run };
}
