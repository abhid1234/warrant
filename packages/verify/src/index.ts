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
export type { VerdictOptions } from "./verdict.js";
export { compare, gatherEvidence } from "./probe.js";
export type { Probe, ProbeResult } from "./probe.js";
export { httpJsonProbe, queryProbe, staticProbe, githubIssueProbe } from "./probes.js";
export { validate } from "./validate.js";
export type { ValidationResult } from "./validate.js";
export { validateAgainstSchema } from "./schema-validate.js";
export { tallyReputation, repFor, formatReputation, tallyByHarness, formatByHarness, harnessOf } from "./reputation.js";
export type { Reputation, DomainRep, AgentRep, HarnessRep, ReputationOptions } from "./reputation.js";
export { consensusVerdict, verifierStandings, outcomeKey } from "./consensus.js";
export type { Consensus, VerifierStanding } from "./consensus.js";
export { issueWarrant, verifyWarrant, issueJudgedWarrant } from "./verify.js";
export type { IssueParams, VerifyResult, VerifyOptions } from "./verify.js";
export { canonicalize, canonicalWarrant, generateKeypair, signWarrant, verifySignature } from "./sign.js";
export { judgeVerification, geminiJudge } from "./judge.js";
export type { JudgeFn, JudgeInput } from "./judge.js";
