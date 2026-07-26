/**
 * Portable deterministic hash utilities for synthetic adapters.
 *
 * These are intentionally NOT cryptographic. They exist only so synthetic
 * adapters can produce stable, testable references/signatures without pulling
 * in a crypto dependency that differs across Node/RN/browser. Real providers
 * use their own signed verification; synthetic signatures are clearly marked.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Convert to unsigned 32-bit hex.
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Deterministic 128-bit-ish token from several parts. */
export function syntheticToken(prefix: string, ...parts: ReadonlyArray<string>): string {
  const joined = parts.join("|");
  const a = fnv1a(joined);
  const b = fnv1a(`${joined}:1`);
  const c = fnv1a(`${joined}:2`);
  const d = fnv1a(`${joined}:3`);
  return `${prefix}_${a}${b}${c}${d}`;
}

/** Deterministic UUID-v4-shaped string derived from a seed (synthetic only). */
export function syntheticUuid(seed: string): string {
  const h = `${fnv1a(seed)}${fnv1a(`${seed}:a`)}${fnv1a(`${seed}:b`)}${fnv1a(`${seed}:c`)}`;
  const hex = h.padEnd(32, "0").slice(0, 32);
  const v4 = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return v4;
}
