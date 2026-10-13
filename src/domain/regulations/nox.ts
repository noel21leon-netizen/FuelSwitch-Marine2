// NOx applicability — modelled SEPARATELY from SOx changeover (FR-011). SOx changeover is never NOx compliance.
// No NOx regulatory rule is encoded here: none has been sourced (KOS 06). This module only reports whether the
// inputs a human reviewer would need are present, and never returns "compliant" / "applicable" / "not applicable".
import { evaluateDatasetUsability, type RegulatoryDataset } from './dataset';

export interface NoxEngineCertification {
  readonly tier: string;
  readonly certificateRef: string;
  /** Always false in this prototype: certificates are free text and unverified. */
  readonly verified: false;
}

export interface NoxVesselInput {
  readonly engineCertification: NoxEngineCertification | null;
  /** Effective-date facts (e.g. keel-laid / engine installation) are entered by a human; unknown = null. */
  readonly engineInstallationDateUtc: string | null;
}

export type NoxAssessment =
  | { readonly status: 'not-assessed'; readonly reasons: string[]; readonly disclaimer: string }
  | { readonly status: 'inputs-present-needs-human-review'; readonly reasons: string[]; readonly disclaimer: string };

export const NOX_DISCLAIMER =
  'NOx is assessed separately from SOx. A sulfur fuel changeover says nothing about NOx compliance. This tool does not determine NOx applicability or compliance.';

export function assessNoxInputs(vessel: NoxVesselInput, noxDataset: RegulatoryDataset | null, nowUtc: string): NoxAssessment {
  const reasons: string[] = [];
  if (!vessel.engineCertification) reasons.push('No engine NOx certification recorded.');
  else reasons.push('Engine certification is free text and UNVERIFIED.');
  if (!vessel.engineInstallationDateUtc) reasons.push('Engine installation date unknown.');
  const usability = evaluateDatasetUsability(noxDataset, nowUtc, 'NOX');
  if (!usability.usable) reasons.push(`NOx boundary/effective-date data not usable: ${usability.reason}`);
  else reasons.push(...usability.warnings);

  const missing = !vessel.engineCertification || !vessel.engineInstallationDateUtc || !usability.usable;
  return missing
    ? { status: 'not-assessed', reasons, disclaimer: NOX_DISCLAIMER }
    : { status: 'inputs-present-needs-human-review', reasons, disclaimer: NOX_DISCLAIMER };
}
