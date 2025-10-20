/**
 * X.509 Certificate example:
 * - Parse DER certificate by Schema Parser into readable JSON
 * - Rebuild with Schema Builder and verify byte-for-byte equality
 *
 * Run:
 *   npx tsx examples/x509/parse-and-roundtrip.ts
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SchemaParser } from "../../src/parser/index.ts";
import { SchemaBuilder } from "../../src/builder/index.ts";
import { bufferToArrayBuffer, toHex } from "../../src/common/codecs.ts";

import { createParseSchema } from "./schemas/parser.ts";
import { createBuildSchema } from "./schemas/builder.ts";
import { parseExtnValues } from "./schemas/extn.ts";

function normalizeForDisplay(value: unknown): unknown {
  if (value instanceof ArrayBuffer) return toHex(value);
  if (value instanceof Uint8Array) return toHex(value);
  if (Array.isArray(value))
    return (value as unknown[]).map((v) => normalizeForDisplay(v));

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeForDisplay(v);
    }
    return out;
  }
  return value;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const derPath = path.resolve(__dirname, "cert.der");
  const derBuf = await readFile(derPath);
  const der = bufferToArrayBuffer(derBuf);

  // Parse
  const parseSchema = createParseSchema();
  const parser = new SchemaParser(parseSchema, { strict: true });
  const parsed = parser.parse(der);

  // Display a normalized JSON (with extnMeaning and summaries)
  let normalized = parseExtnValues(parsed);
  normalized = normalizeForDisplay(normalized);
  console.log("Parsed certificate (normalized + extn summaries):");
  console.log(JSON.stringify(normalized, null, 2));

  // Rebuild
  const buildSchema = createBuildSchema();
  const builder = new SchemaBuilder(buildSchema, { strict: true });
  const rebuilt = builder.build(parsed);

  // Verify byte-for-byte equality
  const rebuiltU8 = new Uint8Array(rebuilt);
  const originalU8 = new Uint8Array(der);

  const identical = equalBytes(rebuiltU8, originalU8);
  console.log(
    identical ? "OK: round-trip bytes are identical" : "NG: round-trip differs",
  );
  if (!identical) {
    console.log("Original (first 64 bytes):", toHex(originalU8.slice(0, 64)));
    console.log("Rebuilt  (first 64 bytes):", toHex(rebuiltU8.slice(0, 64)));

    // Find first difference and print a 32-byte window around it
    const len = Math.min(originalU8.length, rebuiltU8.length);
    let diffIndex = -1;
    for (let i = 0; i < len; i++) {
      if (originalU8[i] !== rebuiltU8[i]) {
        diffIndex = i;
        break;
      }
    }
    if (diffIndex === -1 && originalU8.length !== rebuiltU8.length) {
      diffIndex = len; // difference due to length
    }
    if (diffIndex !== -1) {
      const window = 32;
      const start = Math.max(0, diffIndex - window);
      const endOrig = Math.min(originalU8.length, diffIndex + window);
      const endReb = Math.min(rebuiltU8.length, diffIndex + window);
      const sliceOrig = originalU8.slice(start, endOrig);
      const sliceReb = rebuiltU8.slice(start, endReb);
      console.log(`First difference at index ${diffIndex}`);
      console.log(
        `Original [${start}:${endOrig}] (${endOrig - start} bytes):`,
        toHex(sliceOrig),
      );
      console.log(
        `Rebuilt  [${start}:${endReb}] (${endReb - start} bytes):`,
        toHex(sliceReb),
      );
    }
  }
}

main().catch((err) => {
  console.error("X.509 example failed:", err);
  process.exit(1);
});
