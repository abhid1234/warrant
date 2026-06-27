// Judge adapter (spec §5.1 method:"judge"). For fuzzy outcomes that can't be
// reduced to a structural world-state probe (e.g. "was the summary accurate?"),
// Warrant REUSES the shipped, validated judge — the OpenTrajectory `ot judge`
// CLI / RL Trajectory Auditor 4-point judge — rather than rebuilding it.
//
// We do NOT re-implement that judge here (that would duplicate shipped, validated
// code). Instead we define the pluggable seam: inject a JudgeFn that wraps the
// shipped judge, and it produces evidence the verdict engine consumes.
//
// Hard rule still applies: a judge verdict must reason OVER independent evidence;
// the judge is not itself the ground truth. So a JudgeFn returns an EvidenceItem
// whose `independent` flag reflects the source it judged, not the judge's opinion.

import type { EvidenceItem, Verification } from "./types.js";

export interface JudgeInput {
  /** The OpenTrajectory body + the independent observations to reason over. */
  body?: Record<string, unknown>;
  evidence: EvidenceItem[];
  question: string;
}

/**
 * A JudgeFn wraps the shipped judge. Reference implementation lives in the
 * OpenTrajectory `capture` package (src/judge.ts) and the auditor; wire it here.
 * Returns the match status it concludes plus a one-line rationale.
 */
export type JudgeFn = (input: JudgeInput) => Promise<{ match: EvidenceItem["match"]; rationale: string }>;

/**
 * Build a `judge`-method verification block from a JudgeFn over already-gathered
 * independent evidence. Keeps the moat: the judge classifies the independent
 * observation; it does not invent ground truth.
 */
export async function judgeVerification(
  input: JudgeInput,
  judge: JudgeFn,
  checkedAt: string,
): Promise<Verification> {
  const { match, rationale } = await judge(input);
  // Preserve independence from the underlying evidence the judge reasoned over.
  const independent = input.evidence.some((e) => e.independent);
  return {
    method: "judge",
    checked_at: checkedAt,
    verifier_note: `Judged via the OpenTrajectory/Inspector judge: ${rationale}`,
    evidence: [
      ...input.evidence,
      {
        source: "opentrajectory/judge",
        independent,
        probe: input.question,
        observed: rationale,
        match,
      },
    ],
  };
}

/**
 * A real LLM-backed JudgeFn (Gemini), mirroring the shipped OpenTrajectory judge's
 * approach: it reasons over the INDEPENDENT evidence to classify a fuzzy outcome.
 * Gated on an API key + network — used when GEMINI_API_KEY is set; for offline/CI,
 * inject a deterministic JudgeFn instead. Zero-dep (Node built-in fetch).
 */
export function geminiJudge(opts: { apiKey: string; model?: string }): JudgeFn {
  const model = opts.model ?? "gemini-2.5-flash";
  return async (input) => {
    const prompt =
      `You audit whether an agent's claim is supported by INDEPENDENT evidence.\n` +
      `Reason only over the evidence; do not assume facts not present.\n` +
      `Question: ${input.question}\n` +
      `Evidence: ${JSON.stringify(input.evidence)}\n` +
      `Return ONLY JSON: {"match":"match|mismatch|absent|inconclusive","rationale":"<=1 sentence"}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }),
    });
    if (!res.ok) return { match: "inconclusive", rationale: `judge unavailable (HTTP ${res.status})` };
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    try {
      const parsed = JSON.parse(text) as { match?: EvidenceItem["match"]; rationale?: string };
      const valid = ["match", "mismatch", "absent", "inconclusive"] as const;
      const match = valid.includes(parsed.match as (typeof valid)[number]) ? (parsed.match as EvidenceItem["match"]) : "inconclusive";
      return { match, rationale: parsed.rationale ?? "" };
    } catch {
      return { match: "inconclusive", rationale: "judge returned unparseable output" };
    }
  };
}
