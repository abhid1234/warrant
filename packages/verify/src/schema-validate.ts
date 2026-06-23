// A tiny, zero-dependency JSON Schema validator — just the subset that
// schema/warrant-0.schema.json uses (type, required, properties, items, enum,
// minItems, minLength, $ref into #/$defs). This makes the schema file the SOURCE
// OF TRUTH for structural conformance, instead of a second hand-written check
// drifting from it. It is intentionally NOT a general JSON Schema implementation.

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function matchType(t: string, v: unknown): boolean {
  switch (t) {
    case "object":
      return isObj(v);
    case "array":
      return Array.isArray(v);
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number";
    case "integer":
      return typeof v === "number" && Number.isInteger(v);
    case "boolean":
      return typeof v === "boolean";
    case "null":
      return v === null;
    default:
      return true;
  }
}

/** Validate `doc` against a JSON Schema object (the warrant schema). */
export function validateAgainstSchema(doc: unknown, schema: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const root = schema;

  const resolve = (node: unknown): Record<string, unknown> | null => {
    if (!isObj(node)) return null;
    if (typeof node.$ref === "string") {
      const parts = node.$ref.replace(/^#\//, "").split("/");
      let cur: unknown = root;
      for (const p of parts) cur = isObj(cur) ? cur[p] : undefined;
      return isObj(cur) ? cur : null;
    }
    return node;
  };

  const check = (rawNode: unknown, val: unknown, path: string): void => {
    const node = resolve(rawNode);
    if (!node) return;
    const label = path || "(root)";

    if (node.type !== undefined) {
      const types = Array.isArray(node.type) ? (node.type as string[]) : [node.type as string];
      if (!types.some((t) => matchType(t, val))) {
        errors.push(`${label}: expected ${types.join(" | ")}`);
        return; // type wrong -> downstream checks are noise
      }
    }
    if (Array.isArray(node.enum) && !node.enum.includes(val)) {
      errors.push(`${label}: must be one of ${node.enum.map((e) => JSON.stringify(e)).join(", ")}`);
    }
    if (typeof val === "string" && typeof node.minLength === "number" && val.length < node.minLength) {
      errors.push(`${label}: string shorter than minLength ${node.minLength}`);
    }
    if (Array.isArray(val)) {
      if (typeof node.minItems === "number" && val.length < node.minItems) {
        errors.push(`${label}: fewer than minItems ${node.minItems}`);
      }
      if (node.items) val.forEach((item, i) => check(node.items, item, `${path}[${i}]`));
    }
    if (isObj(val)) {
      if (Array.isArray(node.required)) {
        for (const r of node.required as string[]) {
          if (!(r in val)) errors.push(`${label}: missing required "${r}"`);
        }
      }
      if (isObj(node.properties)) {
        for (const k of Object.keys(node.properties)) {
          if (k in val) check(node.properties[k], val[k], path ? `${path}.${k}` : k);
        }
      }
    }
  };

  check(root, doc, "");
  return { valid: errors.length === 0, errors };
}
