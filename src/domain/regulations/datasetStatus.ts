// Dataset status presenter (pure). FR-010 "cached data labelled with source/version/status; never present expired/unverified data as current".
// It REUSES `evaluateDatasetUsability` for every decision (ADR-037); it adds wording only. No clock: `nowUtc` is injected.
import { DEMO_BANNER_TEXT } from '../../shared/constants';
import { evaluateDatasetUsability, type DatasetBlockCode, type EmissionCategory, type RegulatoryDataset, type VerificationStatus } from './dataset';

/** The status the UI must show. Differs from the declared status when the rules block the data (e.g. declared VERIFIED but past its end date → EXPIRED). */
export type DatasetStatusLabel = 'SYNTHETIC' | 'UNVERIFIED' | 'VERIFIED' | 'EXPIRED' | 'NOT YET EFFECTIVE' | 'NOT USABLE' | 'UNAVAILABLE';

export type DatasetNoticeKind =
  | 'not-loaded' | 'synthetic' | 'unverified' | 'expired' | 'not-yet-effective' | 'blocked'
  | 'unknown-source' | 'unknown-version' | 'no-end-date';

export interface DatasetNotice {
  readonly kind: DatasetNoticeKind;
  /** `block` = the data must not drive calculations; `warn` = usable but must be read with care; `info` = context. */
  readonly severity: 'block' | 'warn' | 'info';
  readonly text: string;
}

export interface DatasetStatusView {
  readonly loaded: boolean;
  readonly datasetName: string | null;
  readonly statusLabel: DatasetStatusLabel;
  /** What the dataset file itself declares. Null when nothing is loaded. */
  readonly declaredStatus: VerificationStatus | null;
  /** True only when the domain rules allow the dataset to drive a calculation right now. */
  readonly usable: boolean;
  readonly sourceName: string;
  readonly sourceKnown: boolean;
  readonly datasetVersion: string;
  readonly versionKnown: boolean;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly lastReviewedAtUtc: string | null;
  readonly notices: readonly DatasetNotice[];
  /** One line for the Dashboard "Next boundary" row. Never shows EXPIRED/UNVERIFIED data as plain current data. */
  readonly summaryLine: string;
}

export const UNKNOWN_SOURCE_TEXT = 'UNKNOWN';

const isUnknownText = (v: string): boolean => {
  const t = v.trim().toLowerCase();
  return t === '' || t === 'unknown';
};

const STATUS_BY_BLOCK: Record<DatasetBlockCode, { label: DatasetStatusLabel; kind: DatasetNoticeKind }> = {
  'no-dataset': { label: 'UNAVAILABLE', kind: 'not-loaded' },
  'wrong-category': { label: 'NOT USABLE', kind: 'blocked' },
  'no-polygons': { label: 'NOT USABLE', kind: 'blocked' },
  'invalid-now': { label: 'NOT USABLE', kind: 'blocked' },
  'marked-expired': { label: 'EXPIRED', kind: 'expired' },
  'past-effective-to': { label: 'EXPIRED', kind: 'expired' },
  'not-yet-effective': { label: 'NOT YET EFFECTIVE', kind: 'not-yet-effective' },
  'invalid-dates': { label: 'NOT USABLE', kind: 'blocked' },
  'verified-incomplete': { label: 'NOT USABLE', kind: 'blocked' },
};

export function describeDatasetStatus(
  dataset: RegulatoryDataset | null | undefined,
  nowUtc: string,
  purpose: EmissionCategory = 'SOX_PM',
): DatasetStatusView {
  const usability = evaluateDatasetUsability(dataset, nowUtc, purpose);
  if (!dataset) {
    const reason = usability.usable ? 'No boundary dataset is loaded.' : usability.reason;
    return {
      loaded: false, datasetName: null, statusLabel: 'UNAVAILABLE', declaredStatus: null, usable: false,
      sourceName: UNKNOWN_SOURCE_TEXT, sourceKnown: false, datasetVersion: UNKNOWN_SOURCE_TEXT, versionKnown: false,
      effectiveFrom: null, effectiveTo: null, lastReviewedAtUtc: null,
      notices: [{ kind: 'not-loaded', severity: 'block', text: reason }],
      summaryLine: 'Unavailable — local dataset not loaded',
    };
  }

  const sourceKnown = !isUnknownText(dataset.sourceName);
  const versionKnown = !isUnknownText(dataset.datasetVersion);
  const notices: DatasetNotice[] = [];
  let statusLabel: DatasetStatusLabel;

  if (!usability.usable) {
    const mapped = STATUS_BY_BLOCK[usability.code];
    statusLabel = mapped.label;
    notices.push({ kind: mapped.kind, severity: 'block', text: `${usability.reason} It is not used for calculations.` });
  } else if (usability.level === 'demo') {
    statusLabel = 'SYNTHETIC';
    notices.push({ kind: 'synthetic', severity: 'warn', text: usability.bannerText ?? DEMO_BANNER_TEXT });
  } else if (usability.level === 'unverified') {
    statusLabel = 'UNVERIFIED';
    notices.push({ kind: 'unverified', severity: 'warn', text: usability.bannerText ?? 'UNVERIFIED BOUNDARY — NOT FOR NAVIGATION OR REGULATORY COMPLIANCE' });
  } else {
    statusLabel = 'VERIFIED';
  }

  // The domain's own warnings (e.g. "no effective-to date recorded") are passed through verbatim, once.
  // (An unverified dataset's own warning repeats the UNVERIFIED notice above, so only verified data passes warnings through.)
  if (usability.usable && usability.level === 'verified') {
    for (const w of usability.warnings) notices.push({ kind: 'no-end-date', severity: 'warn', text: w });
  }
  if (!sourceKnown) notices.push({ kind: 'unknown-source', severity: 'warn', text: 'The source of this dataset is UNKNOWN. Do not rely on it.' });
  if (!versionKnown) notices.push({ kind: 'unknown-version', severity: 'info', text: 'The dataset version is not recorded.' });

  const name = dataset.name;
  const summaryLine = !usability.usable
    ? `${statusLabel} — ${name} (not used)`
    : `${name} (${statusLabel})${statusLabel === 'SYNTHETIC' ? ' — demo data' : statusLabel === 'UNVERIFIED' ? ' — not verified' : ''}${sourceKnown ? '' : ' — source unknown'}`;

  return {
    loaded: true, datasetName: name, statusLabel, declaredStatus: dataset.verificationStatus, usable: usability.usable,
    sourceName: sourceKnown ? dataset.sourceName : UNKNOWN_SOURCE_TEXT, sourceKnown,
    datasetVersion: versionKnown ? dataset.datasetVersion : UNKNOWN_SOURCE_TEXT, versionKnown,
    effectiveFrom: dataset.effectiveFrom, effectiveTo: dataset.effectiveTo, lastReviewedAtUtc: dataset.lastReviewedAtUtc,
    notices, summaryLine,
  };
}
