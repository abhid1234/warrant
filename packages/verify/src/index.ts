// @warrant/verify — zero-dependency Warrant verifier (spec v0).
export type {
  Warrant,
  Party,
  TaskContext,
  Intent,
  ClaimedOutcome,
  EvidenceItem,
  Verification,
  Verdict,
  Signature,
  VerdictValue,
  MatchStatus,
  VerificationMethod,
} from "./types.js";

export { computeVerdict, checkVerdict } from "./verdict.js";
export { compare, gatherEvidence } from "./probe.js";
export type { Probe, ProbeResult } from "./probe.js";
export { httpJsonProbe, queryProbe, staticProbe, githubIssueProbe } from "./probes.js";
export { validate } from "./validate.js";
export type { ValidationResult } from "./validate.js";
export { validateAgainstSchema } from "./schema-validate.js";
export { tallyReputation, repFor, formatReputation, tallyByHarness, formatByHarness, harnessOf } from "./reputation.js";
export type { Reputation, DomainRep, AgentRep, HarnessRep } from "./reputation.js";
export { issueWarrant, verifyWarrant } from "./verify.js";
export type { IssueParams, VerifyResult } from "./verify.js";
export { canonicalize, canonicalWarrant, generateKeypair, signWarrant, verifySignature } from "./sign.js";
export { judgeVerification } from "./judge.js";
export type { JudgeFn, JudgeInput } from "./judge.js";
