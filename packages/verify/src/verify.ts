// Top-level orchestration: issue a warrant by running the world-state check, and
// re-verify a received warrant by re-deriving its verdict from its own evidence.

import type { Probe } from "./probe.js";
import { gatherEvidence } from "./probe.js";
import { computeVerdict, checkVerdict } from "./verdict.js";
import { validate } from "./validate.js";
import type {
  ClaimedOutcome,
  Intent,
  Party,
  TaskContext,
  VerificationMethod,
  Warrant,
} from "./types.js";

export interface IssueParams {
  warrant_id: string;
  issued_at: string;
  issuer: Party;
  subject: Party;
  caller?: Party;
  task_context: TaskContext;
  intent: Intent;
  claimed_outcome: ClaimedOutcome;
  body?: Record<string, unknown>;
  /** Defaults to "world-state-probe"; "post-condition" when probes use evaluate(). */
  method?: VerificationMethod;
}

/**
 * Issue an (unsigned) warrant: run probes against ground truth, gather evidence,
 * compute the verdict. Sign separately with sign.ts to make it count toward
 * reputation. Throws if issuer === subject (no self-warranting).
 */
export async function issueWarrant(params: IssueParams, probes: Probe[]): Promise<Warrant> {
  if (params.issuer.id === params.subject.id)
    throw new Error("issuer.id must differ from subject.id (no self-warranting)");

  const evidence = await gatherEvidence(params.claimed_outcome, params.intent, probes);
  const method: VerificationMethod = params.method ?? (probes.length === 0 ? "none" : "world-state-probe");
  const verification = {
    method,
    checked_at: params.issued_at,
    verifier_note:
      method === "world-state-probe"
        ? "Queried authoritative external systems directly, independent of the subject agent."
        : undefined,
    evidence,
  };
  const verdict = computeVerdict(verification);

  const warrant: Warrant = {
    warrant_version: "0",
    warrant_id: params.warrant_id,
    issued_at: params.issued_at,
    issuer: params.issuer,
    subject: params.subject,
    task_context: params.task_context,
    intent: params.intent,
    claimed_outcome: params.claimed_outcome,
    verification,
    verdict,
  };
  if (params.caller) warrant.caller = params.caller;
  if (params.body) warrant.body = params.body;
  return warrant;
}

export interface VerifyResult {
  /** True iff structurally valid AND the stated verdict matches its own evidence. */
  ok: boolean;
  errors: string[];
  derivedVerdict: Warrant["verdict"];
}

/**
 * Re-verify a warrant received from someone else. Never trust the stamped
 * verdict — re-derive it from the evidence and confirm the invariants.
 * (Signature verification is separate: verifySignature in sign.ts.)
 */
export function verifyWarrant(w: Warrant): VerifyResult {
  const structural = validate(w);
  const logic = checkVerdict({
    issuerId: w.issuer?.id ?? "",
    subjectId: w.subject?.id ?? "",
    claimSource: w.claimed_outcome?.source ?? "",
    verification: w.verification,
    statedVerdict: w.verdict,
  });
  const errors = [...structural.errors, ...logic.errors];
  return { ok: errors.length === 0, errors, derivedVerdict: logic.derived };
}
