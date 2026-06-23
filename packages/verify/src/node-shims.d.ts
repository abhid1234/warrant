// Minimal ambient declarations for the Node built-ins this verifier uses.
// Vendored so the package type-checks with ZERO external deps (no @types/node)
// in restricted or offline environments. Covers only the surface we touch.

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}

declare module "node:crypto" {
  interface KeyPairPem { publicKey: string; privateKey: string; }
  export function generateKeyPairSync(
    type: "ed25519",
    opts: {
      publicKeyEncoding: { type: "spki"; format: "pem" };
      privateKeyEncoding: { type: "pkcs8"; format: "pem" };
    },
  ): KeyPairPem;
  export function sign(algorithm: null, data: Uint8Array, key: string): { toString(enc: string): string };
  export function verify(algorithm: null, data: Uint8Array, key: string, signature: Uint8Array): boolean;
}

declare const Buffer: {
  from(data: string, enc?: string): Uint8Array & { toString(enc?: string): string };
};

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  stdout: { write(s: string): void };
  exit(code?: number): never;
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

// Minimal fetch surface (Node 18+ global) used by the HTTP probe.
interface _WResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
declare function fetch(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<_WResponse>;

declare class URL {
  constructor(url: string, base?: string);
  host: string;
  hostname: string;
  pathname: string;
  searchParams: { get(key: string): string | null };
}

declare module "node:http" {
  interface IncomingMessage {
    method?: string;
    url?: string;
    headers: Record<string, string | undefined>;
    setEncoding(enc: string): void;
    on(event: "data", cb: (chunk: string) => void): void;
    on(event: "end", cb: () => void): void;
  }
  interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string): void;
    writeHead(code: number, headers?: Record<string, string>): void;
    end(data?: string): void;
  }
  interface Server {
    listen(port: number, cb?: () => void): Server;
    close(cb?: () => void): void;
    address(): { port: number } | null;
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server;
}

interface ImportMeta {
  url: string;
}
