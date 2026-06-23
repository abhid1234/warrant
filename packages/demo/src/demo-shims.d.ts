// Extra Node built-in surface the demo needs beyond the verifier's shims.
// Merges with @warrant/verify's node-shims.d.ts (same ambient module names).
declare module "node:fs" {
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, opts: { recursive: boolean }): void;
}
