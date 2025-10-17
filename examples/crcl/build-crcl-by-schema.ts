/**
 * SHINSEI.der schema building example (round-trip identity)
 * Steps:
 * 1) Read DER file
 * 2) Parse by a "raw" schema (no decoding) to capture exact primitive bytes
 * 3) Rebuild by a mirror builder schema using those raw bytes
 * 4) Assert the rebuilt DER equals the original SHINSEI.der
 *
 * Run: npx tsx examples/crcl/build-crcl-by-schema.ts
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Use source modules directly for tsx runtime
import {
  SchemaParser as Parser,
  Schema as PSchema,
  TagClass,
} from "../../src/parser/index.ts";
import { SchemaBuilder, Schema as BSchema } from "../../src/builder/index.ts";
import { bufferToArrayBuffer } from "../../src/utils/codecs.ts";


async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const derPath = path.resolve(__dirname, "SHINSEI.der");

  const derBuf = await readFile(derPath);
  const der = bufferToArrayBuffer(derBuf);

  // 1) Parse to raw primitives (ArrayBuffer) by schema
  const parser = new Parser(PKIMessage_RAW, { strict: true });
  const raw = parser.parse(der);

  // 2) Build back using the mirror builder schema
  const builder = new SchemaBuilder(PKIMessage_BUILD, { strict: true });
  const rebuilt = builder.build(raw as any);

  // 3) Verify identity and write rebuilt file
  const rebuiltBytes = new Uint8Array(rebuilt);

  const identical =
    derBuf.byteLength === rebuiltBytes.byteLength &&
    (() => {
      const a = derBuf;
      const b = rebuiltBytes;
      for (let i = 0; i < a.byteLength; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    })();

  console.log(
    identical
      ? "OK: REBUILT-SHINSEI.der is byte-for-byte identical to SHINSEI.der"
      : "NG: rebuilt DER differs from SHINSEI.der",
  );
}

main().catch((err) => {
  console.error("Failed to rebuild SHINSEI.der:", err);
  process.exit(1);
});
