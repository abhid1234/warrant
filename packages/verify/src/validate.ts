// Structural conformance validator for Warrant v0 (mirrors the OpenTrajectory
// validate.ts pattern). Zero dependencies. Checks shape, not the verdict logic —
// use checkVerdict() in verdict.ts for that.

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const VERDICTS = new Set(["warranted", "refuted", "unverifiable"]);
const MATCHES = new Set(["match", "mismatch", "absent", "inconclusive"]);
const METHODS = new Set(["world-state-probe", "post-condition", "judge", "none"]);

export function validate(doc: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObj(doc)) return { valid: false, errors: ["document is not a JSON object"] };

  for (const k of ["warrant_version", "warrant_id", "issued_at"]) {
    if (typeof doc[k] !== "string" || (doc[k] as string).length === 0)
      errors.push(`missing/invalid \`${k}\` (non-empty string)`);
  }

  for (const role of ["issuer", "subject"]) {
    const p = doc[role];
    if (!isObj(p) || typeof p.id !== "string" || p.id.length === 0)
      errors.push(`missing/invalid \`${role}.id\` (non-empty string)`);
  }
  if (isObj(doc.issuer) && isObj(doc.subject) && doc.issuer.id === doc.subject.id)
    errors.push("issuer.id must differ from subject.id (no self-warranting)");

  if (!isObj(doc.task_context) || typeof doc.task_context.domain !== "string")
    errors.push("missing/invalid `task_context.domain` (string)");

  if (!isObj(doc.intent) || typeof doc.intent.description !== "string")
    errors.push("missing/invalid `intent.description` (string)");

  const claim = doc.claimed_outcome;
  if (!isObj(claim)) {
    errors.push("missing/invalid `claimed_outcome` (object)");
  } else {
    if (typeof claim.status !== "string") errors.push("missing/invalid `claimed_outcome.status` (string)");
    if (claim.source !== "self-report") errors.push('`claimed_outcome.source` must be "self-report"');
  }

  const v = doc.verification;
  if (!isObj(v)) {
    errors.push("missing/invalid `verification` (object)");
  } else {
    if (typeof v.method !== "string" || !METHODS.has(v.method))
      errors.push(`\`verification.method\` must be one of ${[...METHODS].join(" | ")}`);
    if (typeof v.checked_at !== "string") errors.push("missing/invalid `verification.checked_at` (string)");
    if (!Array.isArray(v.evidence) || v.evidence.length === 0) {
      errors.push("`verification.evidence` must be a non-empty array");
    } else {
      v.evidence.forEach((e, i) => {
        if (!isObj(e)) {
          errors.push(`verification.evidence[${i}] is not an object`);
          return;
        }
        if (typeof e.source !== "string") errors.push(`verification.evidence[${i}].source must be a string`);
        if (typeof e.independent !== "boolean") errors.push(`verification.evidence[${i}].independent must be a boolean`);
        if (!("observed" in e)) errors.push(`verification.evidence[${i}].observed is required`);
        if (typeof e.match !== "string" || !MATCHES.has(e.match))
          errors.push(`verification.evidence[${i}].match must be one of ${[...MATCHES].join(" | ")}`);
      });
    }
  }

  const verdict = doc.verdict;
  if (!isObj(verdict)) {
    errors.push("missing/invalid `verdict` (object)");
  } else {
    if (typeof verdict.value !== "string" || !VERDICTS.has(verdict.value))
      errors.push(`\`verdict.value\` must be one of ${[...VERDICTS].join(" | ")}`);
    if (typeof verdict.reasoning !== "string") errors.push("missing/invalid `verdict.reasoning` (string)");
  }

  return { valid: errors.length === 0, errors };
}
