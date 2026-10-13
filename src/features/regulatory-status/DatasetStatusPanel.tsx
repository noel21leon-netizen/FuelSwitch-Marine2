import type { DatasetNotice, DatasetStatusView } from '../../domain';
import { DATASET_STATUS_BASIS_TEXT, NOX_SCOPE_TEXT } from '../../shared/constants';

const NOT_RECORDED = 'not recorded';

function NoticeItem({ notice }: { notice: DatasetNotice }) {
  // Severity is spelled out in text so it is never conveyed by colour alone (NFR-008).
  const prefix = notice.severity === 'block' ? 'NOT USED' : notice.severity === 'warn' ? 'WARNING' : 'NOTE';
  return <li className={`dataset-notice dataset-notice--${notice.severity}`} role={notice.severity === 'block' ? 'alert' : 'note'}>
    <strong>{prefix}:</strong> {notice.text}
  </li>;
}

/** Regulatory data status for the More tab (FR-010). Wording comes from the pure presenter; no rules live here. */
export function DatasetStatusPanel({ view, asOfUtc, clockLabel }: { view: DatasetStatusView; asOfUtc: string; clockLabel: string }) {
  return <section className="panel" aria-label="Regulatory data status">
    <h2>Regulatory data status</h2>
    <p><strong>SOx / PM boundary: {view.statusLabel}</strong>{view.datasetName ? ` — ${view.datasetName}` : ''}</p>
    {view.notices.length > 0 && <ul className="dataset-notices">{view.notices.map((n, i) => <NoticeItem key={`${n.kind}-${i}`} notice={n}/>)}</ul>}
    <dl className="metrics">
      <dt>Source</dt><dd>{view.sourceName}</dd>
      <dt>Dataset version</dt><dd>{view.datasetVersion}</dd>
      <dt>Declared status</dt><dd>{view.declaredStatus ? view.declaredStatus.toUpperCase() : 'UNAVAILABLE'}</dd>
      <dt>Effective from</dt><dd>{view.effectiveFrom ?? NOT_RECORDED}</dd>
      <dt>Effective to</dt><dd>{view.effectiveTo ?? NOT_RECORDED}</dd>
      <dt>Last reviewed (UTC)</dt><dd>{view.lastReviewedAtUtc ?? NOT_RECORDED}</dd>
      <dt>Assessed at (UTC)</dt><dd>{asOfUtc} ({clockLabel})</dd>
    </dl>
    <p className="muted">{DATASET_STATUS_BASIS_TEXT}</p>
    <p>{NOX_SCOPE_TEXT}</p>
  </section>;
}
