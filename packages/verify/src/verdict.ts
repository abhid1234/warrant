// The verdict engine — pure, deterministic, zero-dependency.
// Given the world-state evidence, decide: warranted | refuted | unverifiable.
// Implements docs/warrant-spec.md §5.2 (the hard rule) and §6 (verdict semantics).
//
// THE MOAT: the verdict is computed ONLY from verification.evidence — the
// independent observations of ground truth. It never reads the agent's
// self-reported trace (warrant.body). Self-reported evidence (independent:false)
// can enrich a warrant but can NEVER, on its own, support `warranted`.

import type { Verification, Verdict } from "./types.js";

const CONTRADICTS = (m: string): boolean => m === "mismatch" || m === "absent";

/**
 * Derive a verdict from a verification block. Pure function.
 *
 * Precedence (spec §6):
 *  1. No independent evidence (or method "none") -> unverifiable.
 *  2. Any independent evidence contradicts the claim -> refuted.
 *  3. >=1 independent evidence matches and none contradicts -> warranted.
 *  4. Independent evidence exists but is all inconclusive -> unverifiable.
 */
export function computeVerdict(verification: Verification): Verdict {
  const evaluator = "warrant/verify 0.1";
  const all = verification.evidence ?? [];
  const independent = all.filter((e) => e.independent === true);

  if (verification.method === "none" || independent.length === 0) {
    return {
      value: "unverifiable",
      confidence: 0.3,
      reasoning:
        "No independent world-state evidence was available, so the claim could not be checked against ground truth. Absence of evidence is not negative evidence.",
      evaluator,
    };
  }

  const contradicting = independent.filter((e) => CONTRADICTS(e.match));
  if (contradicting.length > 0) {
    const sources = contradicting.map((e) => e.source).join(", ");
    return {
      value: "refuted",
      confidence: 0.97,
      reasoning: `Independent evidence contradicts the claim (${sources}): the claimed world-state change was not found or did not match. The agent reported success on a task it did not complete.`,
      evaluator,
    };
  }

  const matching = independent.filter((e) => e.match === "match");
  if (matching.length > 0) {
    const sources = matching.map((e) => e.source).join(", ");
    return {
      value: "warranted",
      confidence: 0.95,
      reasoning: `Independent evidence confirms the claim (${sources}): the world changed as claimed and matches the success criteria.`,
      evaluator,
    };
  }

  return {
    value: "unverifiable",
    confidence: 0.3,
    reasoning:
      "Independent probes ran but returned inconclusive results; the claim could neither be confirmed nor contradicted.",
    evaluator,
  };
}

/**
 * Check whether a warrant's STATED verdict is actually justified by its own
 * evidence, and whether it honors the structural invariants. Used to validate a
 * warrant received from someone else (don't trust the stamped verdict — re-derive it).
 */
export function checkVerdict(args: {
  issuerId: string;
  subjectId: string;
  claimSource: string;
  verification: Verification;
  statedVerdict: { value: string };
}): { ok: boolean; errors: string[]; derived: Verdict } {
  const errors: string[] = [];
  if (args.issuerId === args.subjectId) errors.push("issuer.id must differ from subject.id (no self-warranting)");
  if (args.claimSource !== "self-report") errors.push('claimed_outcome.source must be "self-report"');

  const derived = computeVerdict(args.verification);
  if (derived.value !== args.statedVerdict.value) {
    errors.push(`stated verdict "${args.statedVerdict.value}" does not match evidence-derived verdict "${derived.value}"`);
  }
  // Re-assert the §5.2 hard rule explicitly (defense in depth).
  if (args.statedVerdict.value === "warranted") {
    const hasIndepMatch = (args.verification.evidence ?? []).some((e) => e.independent && e.match === "match");
    if (!hasIndepMatch) errors.push("warranted requires >=1 evidence item with independent:true and match:match");
  }
  return { ok: errors.length === 0, errors, derived };
}
