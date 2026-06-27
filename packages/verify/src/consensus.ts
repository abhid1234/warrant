// N-of-M independent verification + verifier reputation (trust-model.md).
// Non-crypto analog of staking: instead of money on the line, require multiple
// INDEPENDENT verifiers to agree, and hold verifiers accountable when they
// disagree with a peer consensus. One vote per distinct issuer.

import type { VerdictValue, Warrant } from "./types.js";

export interface Consensus {
  value: VerdictValue | "disputed";
  issuers: number; // distinct issuers that weighed in
  warranted: number;
  refuted: number;
  unverifiable: number;
  /** True when issuers disagree on the decisive verdict (warranted vs refuted). */
  disputed: boolean;
}

/** Key identifying warrants that concern the SAME outcome. */
export function outcomeKey(w: Warrant): string {
  return [w.subject?.id, w.task_context?.domain, JSON.stringify(w.claimed_outcome?.asserted_facts ?? {})].join("|");
}

/** One vote per distinct issuer — the latest by issued_at. */
function votesByIssuer(warrants: Warrant[]): Map<string, { value: VerdictValue; at: number; name?: string }> {
  const m = new Map<string, { value: VerdictValue; at: number; name?: string }>();
  for (const w of warrants) {
    const id = w.issuer?.id ?? "";
    const at = Date.parse(w.issued_at ?? "") || 0;
    const prev = m.get(id);
    if (!prev || at >= prev.at) m.set(id, { value: w.verdict.value, at, name: w.issuer?.name });
  }
  return m;
}

/**
 * Consensus over warrants about ONE outcome from possibly several verifiers.
 *  - any disagreement on the decisive verdict -> `disputed`
 *  - >=n issuers refute -> `refuted` (a lie caught by N independents)
 *  - >=n issuers warrant -> `warranted`
 *  - otherwise -> `unverifiable`
 */
export function consensusVerdict(warrants: Warrant[], opts: { n?: number } = {}): Consensus {
  const n = opts.n ?? 2;
  const votes = [...votesByIssuer(warrants).values()].map((v) => v.value);
  const warranted = votes.filter((v) => v === "warranted").length;
  const refuted = votes.filter((v) => v === "refuted").length;
  const unverifiable = votes.filter((v) => v === "unverifiable").length;
  const disputed = warranted > 0 && refuted > 0;
  let value: Consensus["value"];
  if (disputed) value = "disputed";
  else if (refuted >= n) value = "refuted";
  else if (warranted >= n) value = "warranted";
  else value = "unverifiable";
  return { value, issuers: votes.length, warranted, refuted, unverifiable, disputed };
}

export interface VerifierStanding {
  issuerId: string;
  name?: string;
  /** Outcomes where this issuer voted and the OTHER issuers had a clear consensus. */
  judged: number;
  /** Of those, how many times this issuer disagreed with that peer consensus. */
  outvoted: number;
  /** 1 - outvoted/judged; null until the issuer has been peer-checked. */
  score: number | null;
}

const decisive = (v: VerdictValue): boolean => v === "warranted" || v === "refuted";

/**
 * Verifier reputation, grounded in N-of-M: across every multi-verifier outcome,
 * check whether each issuer agreed with the consensus of its peers. A verifier
 * that keeps disagreeing with independent consensus loses standing — the
 * accountability mechanism that lets the network weight whom to trust.
 */
export function verifierStandings(warrants: Warrant[], opts: { n?: number } = {}): VerifierStanding[] {
  const n = opts.n ?? 2;
  const groups = new Map<string, Warrant[]>();
  for (const w of warrants) {
    const k = outcomeKey(w);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(w);
  }

  const stand = new Map<string, VerifierStanding>();
  const ensure = (id: string, name?: string): VerifierStanding => {
    let s = stand.get(id);
    if (!s) { s = { issuerId: id, name, judged: 0, outvoted: 0, score: null }; stand.set(id, s); }
    if (name && !s.name) s.name = name;
    return s;
  };

  for (const group of groups.values()) {
    const votes = votesByIssuer(group);
    if (votes.size < 2) continue; // need peers to be accountable to
    for (const [id, v] of votes) {
      const peers = [...votes.entries()].filter(([pid]) => pid !== id).map(([, pv]) => pv.value);
      const pw = peers.filter((x) => x === "warranted").length;
      const pr = peers.filter((x) => x === "refuted").length;
      // peers have a clear consensus only if they agree on a single decisive verdict
      let peerConsensus: VerdictValue | null = null;
      if (pw >= n && pr === 0) peerConsensus = "warranted";
      else if (pr >= n && pw === 0) peerConsensus = "refuted";
      if (!peerConsensus) continue;
      const s = ensure(id, v.name);
      s.judged++;
      if (decisive(v.value) && v.value !== peerConsensus) s.outvoted++;
    }
  }

  const out = [...stand.values()];
  for (const s of out) s.score = s.judged === 0 ? null : 1 - s.outvoted / s.judged;
  return out.sort((a, b) => (b.score ?? 2) - (a.score ?? 2) || b.judged - a.judged);
}
