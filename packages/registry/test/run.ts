// Registry integration tests (zero-dep). Start the server, submit warrants over
// HTTP, assert the trust gate: valid -> accepted, forged -> rejected.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createRegistryServer, Registry } from "../src/index.js";
import { issueWarrant, signWarrant, generateKeypair, staticProbe } from "../../verify/src/index.js";
import type { Party, Warrant } from "../../verify/src/index.js";

const issuer: Party = { id: "verifier://test", name: "V", key_id: "k1" };
const subject: Party = { id: "agent://a", name: "AgentA" };
const baseParams = {
  issued_at: "2026-06-22T00:00:00Z",
  issuer,
  subject,
  task_context: { domain: "payments.refund", capability: "issue_refund" },
  intent: { description: "Refund #1" },
};

let pass = 0;
let fail = 0;
const tests: Array<[string, () => Promise<void>]> = [];
const test = (n: string, fn: () => Promise<void>): void => void tests.push([n, fn]);

async function mkWarrant(id: string): Promise<Warrant> {
  return issueWarrant(
    { ...baseParams, warrant_id: id, claimed_outcome: { status: "COMPLETED", source: "self-report", asserted_facts: { refund_id: "RF1" } } },
    [staticProbe("stripe-refunds-api", { refund_id: "RF1", status: "SETTLED" })],
  );
}

const { publicKey, privateKey } = generateKeypair();
const { server } = createRegistryServer({ trustedKeys: { k1: publicKey } });
let base = "";
const post = (w: unknown): Promise<{ status: number; body: any }> =>
  fetch(`${base}/warrants`, { method: "POST", body: JSON.stringify(w) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (p: string): Promise<{ status: number; body: any }> =>
  fetch(`${base}${p}`).then(async (r) => ({ status: r.status, body: await r.json() }));

test("valid signed warrant is accepted", async () => {
  const w = signWarrant(await mkWarrant("w1"), privateKey, "k1");
  const r = await post(w);
  assert.equal(r.status, 201);
  assert.equal(r.body.accepted, true);
  assert.equal(r.body.verdict, "warranted");
});

test("tampered verdict is rejected (re-derived, not trusted)", async () => {
  const w = signWarrant(await mkWarrant("w2"), privateKey, "k1");
  w.verdict.value = "refuted"; // flip the stamp after signing
  const r = await post(w);
  assert.equal(r.status, 422);
  assert.equal(r.body.accepted, false);
});

test("warrant signed with an untrusted key is rejected", async () => {
  const other = generateKeypair();
  const w = signWarrant(await mkWarrant("w3"), other.privateKey, "kX");
  const r = await post(w);
  assert.equal(r.status, 422);
  assert.ok(/unknown signing key/.test(r.body.reason));
});

test("reputation reflects only accepted warrants", async () => {
  const rep = await get("/reputation");
  assert.equal(rep.status, 200);
  assert.equal(rep.body.totals.warranted, 1); // only w1 was accepted
  const agent = await get("/agents/" + encodeURIComponent("agent://a") + "/reputation?domain=payments.refund");
  assert.equal(agent.body.score, 1);
  assert.equal(agent.body.warranted, 1);
});

test("durable storage: warrants persist across instances", async () => {
  const file = "/tmp/warrant-registry-persist-test.json";
  writeFileSync(file, "[]");
  const r1 = new Registry({ trustedKeys: { k1: publicKey }, dataFile: file });
  assert.equal(r1.submit(signWarrant(await mkWarrant("p1"), privateKey, "k1")).accepted, true);
  const r2 = new Registry({ trustedKeys: { k1: publicKey }, dataFile: file }); // fresh instance, same file
  assert.equal(r2.size(), 1);
  assert.equal(r2.reputation().totals.warranted, 1);
});

(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const [n, fn] of tests) {
    try {
      await fn();
      console.log("ok   - " + n);
      pass++;
    } catch (e) {
      console.error("FAIL - " + n + "\n       " + (e as Error).message);
      fail++;
    }
  }
  await new Promise<void>((r) => server.close(() => r()));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
