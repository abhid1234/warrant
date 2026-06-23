// The "did it book the flight?" clip. Two agents over A2A return the SAME task
// status (COMPLETED). Warrant probes the world and tells them apart — live.
import { generateKeypair, signWarrant, verifySignature, verifyWarrant } from "../../verify/src/index.js";
import type { Warrant } from "../../verify/src/index.js";
import { runFlightDemo } from "./scenarios.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const OFF = "\x1b[0m";

function show(label: string, w: Warrant, color: string): void {
  const ev = w.verification.evidence[0];
  const mark = w.verdict.value === "warranted" ? "✓ WARRANTED" : w.verdict.value === "refuted" ? "✗ REFUTED" : "? UNVERIFIABLE";
  console.log(`${BOLD}${label} — ${w.subject.name}${OFF}`);
  console.log(`  ${DIM}A2A task status (self-reported):${OFF} ${w.claimed_outcome.status} — "${w.claimed_outcome.summary}"`);
  console.log(`  ${DIM}Warrant probes the world:${OFF}        ${ev.probe} @ ${ev.source} ${DIM}(independent)${OFF}`);
  console.log(`  ${DIM}World shows:${OFF}                     ${JSON.stringify(ev.observed)}  →  ${ev.match}`);
  console.log(`  ${color}${BOLD}${mark}${OFF} ${DIM}(conf ${w.verdict.confidence})${OFF}  ${w.verdict.reasoning}`);
  console.log("");
}

(async () => {
  console.log(`\n${BOLD}Warrant — live demo${OFF}  ${DIM}"Your agent says it booked the flight — did it?"${OFF}\n`);
  console.log(`${DIM}Concierge hires two agents over A2A for the same task. Both reply COMPLETED.`);
  console.log(`A2A's opaque-execution principle means the status is all the caller gets.${OFF}\n`);

  const demo = await runFlightDemo();
  show("Agent A", demo.honest.warrant, GREEN);
  show("Agent B", demo.lying.warrant, RED);

  // Non-crypto signature + independent re-verification (don't trust the stamp).
  const { publicKey, privateKey } = generateKeypair();
  const signed = signWarrant(demo.honest.warrant, privateKey, "demo-ed25519-1");
  const sigOk = verifySignature(signed, publicKey);
  const reverify = verifyWarrant(demo.lying.warrant);

  console.log(`${DIM}Both agents reported identical success. The world did not agree.${OFF}`);
  console.log(`${DIM}Green warrant signed (Ed25519, non-crypto): ${sigOk ? "signature verifies" : "FAILED"}.${OFF}`);
  console.log(`${DIM}Red warrant re-derived from its own evidence: ${reverify.derivedVerdict.value} (a flipped stamp would be rejected).${OFF}`);
  console.log(`\n${DIM}Build the public reputation board:  npm run board${OFF}\n`);
})();
