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

export interface VerifyOptions {
  /** Ground the `independent` flag: only recognized sources count (spec §5.2). */
  recognizedSource?: (source: string) => boolean;
  /** Reject if `issued_at` is older than this many ms (freshness window). */
  maxAgeMs?: number;
  /** Tolerated future skew for `issued_at`, default 5 min. */
  clockSkewMs?: number;
  /** Injectable clock (ms since epoch); defaults to Date.now(). */
  nowMs?: number;
}

/**
 * Re-verify a warrant received from someone else. Never trust the stamped
 * verdict — re-derive it from the evidence and confirm the invariants. Pass
 * options to ground `independent` (recognizedSource) and to reject stale or
 * future-dated warrants (maxAgeMs). Signature verification is separate (sign.ts).
 */
export function verifyWarrant(w: Warrant, opts: VerifyOptions = {}): VerifyResult {
  const structural = validate(w);
  const logic = checkVerdict({
    issuerId: w.issuer?.id ?? "",
    subjectId: w.subject?.id ?? "",
    claimSource: w.claimed_outcome?.source ?? "",
    verification: w.verification,
    statedVerdict: w.verdict,
    recognizedSource: opts.recognizedSource,
  });
  const errors = [...structural.errors, ...logic.errors];

  if (opts.maxAgeMs !== undefined) {
    const t = Date.parse(w.issued_at ?? "");
    const now = opts.nowMs ?? Date.now();
    const skew = opts.clockSkewMs ?? 5 * 60 * 1000;
    if (Number.isNaN(t)) errors.push("issued_at is not a valid timestamp");
    else if (now - t > opts.maxAgeMs) errors.push(`stale: issued_at is older than maxAgeMs (${opts.maxAgeMs}ms)`);
    else if (t - now > skew) errors.push("issued_at is in the future beyond clock skew");
  }

  return { ok: errors.length === 0, errors, derivedVerdict: logic.derived };
}
