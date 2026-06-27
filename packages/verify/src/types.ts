// Warrant v0 types — the TypeScript mirror of schema/warrant-0.schema.json.
// See docs/warrant-spec.md for normative field semantics.

export type VerdictValue = "warranted" | "refuted" | "unverifiable";
export type MatchStatus = "match" | "mismatch" | "absent" | "inconclusive";
export type VerificationMethod = "world-state-probe" | "post-condition" | "judge" | "none";

export interface Party {
  id: string;
  name?: string;
  key_id?: string;
}

export interface TaskContext {
  domain: string;
  capability?: string;
  tags?: string[];
  /** Optional task difficulty/value weight (default 1) — discounts farming easy tasks. */
  weight?: number;
}

export interface Intent {
  description: string;
  parameters?: Record<string, unknown>;
  success_criteria?: string[];
}

export interface ClaimedOutcome {
  status: string;
  summary?: string;
  asserted_facts?: Record<string, unknown>;
  /** Always self-report: this is the agent's own word, the claim under test. */
  source: "self-report";
}

/** One independent (or self-reported) observation of the world. */
export interface EvidenceItem {
  source: string;
  /** True iff from a source the subject does not control and could not fabricate. */
  independent: boolean;
  probe?: string;
  observed: unknown;
  expected?: unknown;
  match: MatchStatus;
}

export interface Verification {
  method: VerificationMethod;
  checked_at: string;
  verifier_note?: string;
  evidence: EvidenceItem[];
}

export interface Verdict {
  value: VerdictValue;
  confidence?: number;
  reasoning: string;
  evaluator?: string;
}

export interface Signature {
  alg: string;
  key_id: string;
  value: string;
}

export interface Warrant {
  warrant_version: string;
  warrant_id: string;
  issued_at: string;
  issuer: Party;
  subject: Party;
  caller?: Party;
  task_context: TaskContext;
  intent: Intent;
  claimed_outcome: ClaimedOutcome;
  verification: Verification;
  verdict: Verdict;
  /** Full OpenTrajectory 0.1 record of the run. Context/claim, NOT evidence. */
  body?: Record<string, unknown>;
  /** Optional anti-replay nonce, unique per (subject, task). See docs/trust-model.md. */
  nonce?: string;
  signature?: Signature;
}
