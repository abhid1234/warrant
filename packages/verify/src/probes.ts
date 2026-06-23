// Real world-state probes (v3). These turn the demo's fixtures into reusable
// adapters that observe ground truth from systems the subject does not control.
// Zero-dep: the HTTP probe uses Node's built-in global fetch. Anything that needs
// a client the verifier shouldn't bundle (a DB driver, a vendor SDK) is supported
// via the generic `queryProbe`, where the caller injects the lookup.

import type { ClaimedOutcome, Intent, MatchStatus } from "./types.js";
import type { Probe, ProbeResult } from "./probe.js";

/**
 * Observe ground truth over HTTP and compare it to the claim. Independent by
 * default — the source is an external system the subject doesn't control.
 *
 *  - `pick` narrows the response to the fields that matter (defaults to the whole body).
 *  - `expected` overrides what the claim predicts (defaults to claimed_outcome.asserted_facts).
 *  - a non-2xx response is treated as `absent` (the thing isn't there).
 */
export function httpJsonProbe(opts: {
  url: string;
  source?: string;
  method?: string;
  headers?: Record<string, string>;
  independent?: boolean;
  pick?: (body: unknown) => unknown;
  expected?: (claim: ClaimedOutcome, intent: Intent) => unknown;
  evaluate?: (observed: unknown, expected: unknown) => MatchStatus;
}): Probe {
  const probe: Probe = {
    source: opts.source ?? new URL(opts.url).host,
    independent: opts.independent ?? true,
    run: async (): Promise<ProbeResult> => {
      const res = await fetch(opts.url, { method: opts.method ?? "GET", headers: opts.headers });
      if (!res.ok) return { observed: null, probe: `${opts.method ?? "GET"} ${opts.url} -> ${res.status}` };
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      const observed = opts.pick ? opts.pick(body) : body;
      return { observed, probe: `${opts.method ?? "GET"} ${opts.url}` };
    },
  };
  if (opts.expected) probe.expectedFrom = opts.expected;
  if (opts.evaluate) probe.evaluate = opts.evaluate;
  return probe;
}

/**
 * Generic probe: inject any lookup that returns ground truth. Use for a database
 * row check, a CI status call via a vendor SDK, a filesystem read — anything the
 * verifier should not bundle a client for. `independent` defaults to true; set it
 * false only when the source is something the subject controls.
 */
export function queryProbe(opts: {
  source: string;
  run: () => Promise<unknown> | unknown;
  independent?: boolean;
  probeLabel?: string;
  expected?: (claim: ClaimedOutcome, intent: Intent) => unknown;
  evaluate?: (observed: unknown, expected: unknown) => MatchStatus;
}): Probe {
  const probe: Probe = {
    source: opts.source,
    independent: opts.independent ?? true,
    run: async (): Promise<ProbeResult> => ({ observed: await opts.run(), probe: opts.probeLabel }),
  };
  if (opts.expected) probe.expectedFrom = opts.expected;
  if (opts.evaluate) probe.evaluate = opts.evaluate;
  return probe;
}

/** A fixed observation — for tests, fixtures, and replaying a captured probe. */
export function staticProbe(source: string, observed: unknown, independent = true): Probe {
  return { source, independent, run: async () => ({ observed }) };
}
