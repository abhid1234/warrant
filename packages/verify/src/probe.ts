// The world-state check — THE NEW PART (spec §5).
// A probe observes ground truth from a system the verifier trusts, independent
// of the subject agent. gatherEvidence() runs probes and turns their
// observations into EvidenceItem[] by comparing observed-vs-claimed.
//
// This is what separates Warrant from trace-grading: we query the airline's
// reservation system, not the agent's log.

import type { ClaimedOutcome, EvidenceItem, Intent, MatchStatus } from "./types.js";

export interface ProbeResult {
  observed: unknown;
  /** The exact query/action run, for the audit record. */
  probe?: string;
}

export interface Probe {
  /** The system observed, e.g. "amadeus-pnr-api" or "postgres:orders". */
  source: string;
  /** True iff this source is outside the subject's control (the moat). */
  independent: boolean;
  /** Observe ground truth. May hit the network, a DB, a filesystem, etc. */
  run(): Promise<ProbeResult>;
  /** What the claim predicts the probe should show. Defaults to asserted_facts. */
  expectedFrom?: (claim: ClaimedOutcome, intent: Intent) => unknown;
  /**
   * TrueCall-style post-condition override: decide match directly from the
   * observation instead of structural comparison. Use for predicates like
   * "balance increased by 50".
   */
  evaluate?: (observed: unknown, expected: unknown) => MatchStatus;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Structural comparison of an observation against the claimed facts.
 *  - expected undefined            -> inconclusive (nothing to check)
 *  - observed null/undefined       -> absent (the thing isn't there)
 *  - every expected key present & equal in observed -> match
 *  - zero expected keys present in observed          -> absent (e.g. NOT_FOUND)
 *  - some present, some wrong/missing                -> mismatch
 * Non-object expected values are compared by deep equality.
 */
export function compare(observed: unknown, expected: unknown): MatchStatus {
  if (expected === undefined) return "inconclusive";
  if (observed === null || observed === undefined) return "absent";

  if (isObj(expected)) {
    const obs = isObj(observed) ? observed : {};
    const keys = Object.keys(expected);
    if (keys.length === 0) return "inconclusive";
    let present = 0;
    let correct = 0;
    for (const k of keys) {
      if (k in obs) {
        present++;
        if (deepEqual(obs[k], expected[k])) correct++;
      }
    }
    if (present === 0) return "absent";
    if (correct === keys.length) return "match";
    return "mismatch";
  }

  return deepEqual(observed, expected) ? "match" : "mismatch";
}

/** Run every probe and assemble the evidence array (spec §5.2). */
export async function gatherEvidence(
  claim: ClaimedOutcome,
  intent: Intent,
  probes: Probe[],
): Promise<EvidenceItem[]> {
  const out: EvidenceItem[] = [];
  for (const p of probes) {
    const expected = p.expectedFrom ? p.expectedFrom(claim, intent) : claim.asserted_facts;
    const { observed, probe } = await p.run();
    const match = p.evaluate ? p.evaluate(observed, expected) : compare(observed, expected);
    const item: EvidenceItem = {
      source: p.source,
      independent: p.independent,
      observed,
      expected,
      match,
    };
    if (probe !== undefined) item.probe = probe;
    out.push(item);
  }
  return out;
}
