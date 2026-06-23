// The registry store. It trusts nothing it is sent: every submitted warrant is
// re-verified (verdict re-derived from its own evidence + schema-checked) and, if
// signed, its signature is checked against a configured trusted key before it is
// counted. Storage here is in-process (optionally seeded) — durable managed
// storage (KV/Postgres) is the next step, deliberately out of this v3 cut.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Reputation, Warrant } from "../../verify/src/index.js";
import { verifyWarrant, verifySignature, tallyReputation, repFor } from "../../verify/src/index.js";

export interface RegistryOptions {
  /** keyId -> PEM public key. Signed warrants must verify against one of these. */
  trustedKeys?: Record<string, string>;
  /** Reject warrants with no signature (default false — eases demos). */
  requireSigned?: boolean;
  /** Optional warrants to seed the store with (already trusted). */
  seed?: Warrant[];
  /**
   * Durable storage: a JSON file the accepted warrants are persisted to. On
   * startup it is re-loaded AND re-verified (a tampered file drops bad entries).
   * Zero-dep, single-host durability; swap in a KV/Postgres adapter for scale.
   */
  dataFile?: string;
}

export interface SubmitResult {
  accepted: boolean;
  warrant_id: string;
  verdict?: string;
  reason?: string;
}

export class Registry {
  private warrants = new Map<string, Warrant>();
  private trustedKeys: Record<string, string>;
  private requireSigned: boolean;
  private dataFile?: string;

  constructor(opts: RegistryOptions = {}) {
    this.trustedKeys = opts.trustedKeys ?? {};
    this.requireSigned = opts.requireSigned ?? false;
    this.dataFile = opts.dataFile;
    for (const w of opts.seed ?? []) this.warrants.set(w.warrant_id, w);
    this.load(); // re-verify anything already on disk
  }

  /** Re-verify + signature-check, then store (and persist). Never trusts the stamp. */
  submit(w: Warrant): SubmitResult {
    const r = this.accept(w);
    if (r.accepted) this.persist();
    return r;
  }

  /** The trust gate, without persistence (shared by submit() and load()). */
  private accept(w: Warrant): SubmitResult {
    const id = typeof w?.warrant_id === "string" ? w.warrant_id : "(missing id)";

    const v = verifyWarrant(w);
    if (!v.ok) return { accepted: false, warrant_id: id, reason: "verification failed: " + v.errors.join("; ") };

    if (w.signature) {
      const key = this.trustedKeys[w.signature.key_id];
      if (!key) return { accepted: false, warrant_id: id, reason: `unknown signing key: ${w.signature.key_id}` };
      if (!verifySignature(w, key)) return { accepted: false, warrant_id: id, reason: "bad signature" };
    } else if (this.requireSigned) {
      return { accepted: false, warrant_id: id, reason: "unsigned warrant rejected (requireSigned)" };
    }

    this.warrants.set(id, w);
    return { accepted: true, warrant_id: id, verdict: v.derivedVerdict.value };
  }

  private load(): void {
    if (!this.dataFile || !existsSync(this.dataFile)) return;
    try {
      const arr = JSON.parse(readFileSync(this.dataFile, "utf8")) as Warrant[];
      for (const w of arr) this.accept(w); // re-verify on load — drops tampered entries
    } catch {
      /* corrupt file -> start empty rather than crash */
    }
  }

  private persist(): void {
    if (this.dataFile) writeFileSync(this.dataFile, JSON.stringify(this.list(), null, 2));
  }

  list(): Warrant[] {
    return [...this.warrants.values()];
  }

  reputation(): Reputation {
    return tallyReputation(this.list());
  }

  /** Portable, context-conditioned reputation for one agent (optionally one domain). */
  agentReputation(agentId: string, domain?: string): unknown {
    const rep = this.reputation();
    if (domain) return repFor(rep, domain, agentId) ?? null;
    return rep.domains
      .map((d) => ({ domain: d.domain, ...(repFor(rep, d.domain, agentId) ?? {}) }))
      .filter((d) => "agentId" in d);
  }

  size(): number {
    return this.warrants.size;
  }
}
