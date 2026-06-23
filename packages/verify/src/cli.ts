#!/usr/bin/env node
// warrant CLI — zero dependencies (Node built-ins only).
//   warrant verify   <file>            re-derive the verdict + schema-validate
//   warrant validate <file>            structural conformance vs the JSON schema
//   warrant rep      <file|dir...>     context-conditioned reputation report
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Warrant } from "./types.js";
import { verifyWarrant } from "./verify.js";
import { validateAgainstSchema } from "./schema-validate.js";
import { tallyReputation, formatReputation, tallyByHarness, formatByHarness } from "./reputation.js";

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(here, "..", "..", "..", "..", "schema", "warrant-0.schema.json");

function loadSchema(): Record<string, unknown> {
  return JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Record<string, unknown>;
}
function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}
function collectWarrants(paths: string[]): Warrant[] {
  const out: Warrant[] = [];
  const eat = (file: string): void => {
    const v = readJson(file);
    if (Array.isArray(v)) out.push(...(v as Warrant[]));
    else if (v && typeof v === "object" && "verdict" in (v as object)) out.push(v as Warrant);
  };
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p)) if (f.endsWith(".json")) eat(join(p, f));
    } else {
      eat(p);
    }
  }
  return out;
}

function cmdValidate(file: string): number {
  const doc = readJson(file);
  const r = validateAgainstSchema(doc, loadSchema());
  if (r.valid) {
    console.log(`${file}: valid against warrant-0 schema`);
    return 0;
  }
  console.log(`${file}: INVALID`);
  for (const e of r.errors) console.log(`  - ${e}`);
  return 1;
}

function cmdVerify(file: string): number {
  const w = readJson(file) as Warrant;
  const schema = validateAgainstSchema(w, loadSchema());
  const logic = verifyWarrant(w);
  console.log(`warrant: ${w.warrant_id}`);
  console.log(`  subject:    ${w.subject?.name ?? w.subject?.id ?? "?"}`);
  console.log(`  context:    ${w.task_context?.domain ?? "?"}`);
  console.log(`  schema:     ${schema.valid ? "valid" : "INVALID"}`);
  console.log(`  stated:     ${w.verdict?.value}`);
  console.log(`  re-derived: ${logic.derivedVerdict.value}  (${logic.derivedVerdict.reasoning})`);
  const ok = schema.valid && logic.ok;
  if (ok) {
    console.log("  result:     OK — schema valid and stated verdict is justified by the evidence.");
    return 0;
  }
  console.log("  result:     REJECTED");
  for (const e of [...schema.errors, ...logic.errors]) console.log(`    - ${e}`);
  return 1;
}

function cmdRep(args: string[]): number {
  const byHarness = args.includes("--by-harness");
  const paths = args.filter((a) => a !== "--by-harness");
  const warrants = collectWarrants(paths);
  if (warrants.length === 0) {
    console.error("no warrants found");
    return 2;
  }
  console.log(formatReputation(tallyReputation(warrants)));
  if (byHarness) {
    console.log("");
    console.log(formatByHarness(tallyByHarness(warrants)));
  }
  return 0;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (cmd === "verify" && rest[0]) return cmdVerify(rest[0]);
  if (cmd === "validate" && rest[0]) return cmdValidate(rest[0]);
  if (cmd === "rep" && rest.length) return cmdRep(rest);
  console.error("usage:\n  warrant verify <file>\n  warrant validate <file>\n  warrant rep [--by-harness] <file|dir...>");
  return 2;
}

process.exit(main(process.argv.slice(2)));
