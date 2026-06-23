// Non-crypto, enterprise-friendly signing (spec §8). A detached Ed25519
// signature over the canonical warrant (warrant minus the signature field).
// Uses Node's built-in node:crypto — NO chain, NO token, NO staking, NO external
// dep. Distinct from ERC-8004's on-chain model by design.

import { generateKeyPairSync, sign, verify } from "node:crypto";
import type { Signature, Warrant } from "./types.js";

/** Stable JSON serialization with sorted keys (JCS-style; spec §8). */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

/** The bytes that get signed: the warrant with `signature` removed, canonicalized. */
export function canonicalWarrant(w: Warrant): string {
  const { signature: _omit, ...rest } = w;
  return canonicalize(rest);
}

/** Generate a demo Ed25519 keypair (PEM strings). */
export function generateKeypair(): { publicKey: string; privateKey: string } {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

/** Sign a warrant, returning a copy with `signature` populated. */
export function signWarrant(w: Warrant, privateKeyPem: string, keyId: string): Warrant {
  const value = sign(null, Buffer.from(canonicalWarrant(w), "utf8"), privateKeyPem).toString("base64url");
  const signature: Signature = { alg: "Ed25519", key_id: keyId, value };
  return { ...w, signature };
}

/** Verify a warrant's signature against a public key. Returns false if unsigned. */
export function verifySignature(w: Warrant, publicKeyPem: string): boolean {
  if (!w.signature) return false;
  try {
    return verify(
      null,
      Buffer.from(canonicalWarrant(w), "utf8"),
      publicKeyPem,
      Buffer.from(w.signature.value, "base64url"),
    );
  } catch {
    return false;
  }
}
