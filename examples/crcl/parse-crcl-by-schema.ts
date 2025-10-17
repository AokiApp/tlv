/**
 * SHINSEI.der schema parsing example
 *
 * Steps:
 * 1) Read DER file
 * 2) Define schema based on spec
 * 3) Parse by schema using SchemaParser
 * 4) Print a normalized result (ArrayBuffer/Uint8Array rendered as hex)
 *
 * References:
 * - README API for SchemaParser: SchemaParser.parse()
 * - Schema helpers: Schema.primitive(), Schema.constructed()
 * - Basic TLV: BasicTLVParser.parse()
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Use source modules directly for tsx runtime
import { SchemaParser, Schema, TagClass } from "../../src/parser/index.ts";
import {
  bufferToArrayBuffer,
  toHex,
  decodeUtf8,
  decodeShiftJis,
  decodeAscii,
  decodeInteger,
  decodeOID,
  decodeBitStringHex,
} from "../../src/utils/codecs.ts";

/**
 * Utility: convert Node.js Buffer to ArrayBuffer without extra copy
 */

/**
 * Utility: convert ArrayBuffer or Uint8Array to hex string
 */

/**
 * Decoders
 */

/**
 * BIT STRING decoder: return hex of content (skipping the first unused-bits byte)
 */

/**
 * Nested parse: RegisteredCorporationInfoSyntax inside extnValue (OCTET STRING)
 */
function decodeRegisteredCorporationInfoExtension(buffer: ArrayBuffer) {
  // RegisteredCorporationInfoSyntax ::= SEQUENCE {
  //   corporateName            [0] UTF8String,
  //   corporateAddress         [2] UTF8String,
  //   representativeDirectorName [3] UTF8String,
  //   representativeDirectorTitle [4] UTF8String
  // }
  const RegisteredCorporationInfoSyntax = Schema.constructed(
    "registeredCorporationInfo",
    [
      // EXPLICIT context-specific tags: constructed wrapper containing inner DirectoryString (UTF8String in DER, content encoded per spec)
      // Spec notes say these fields are recorded using Shift_JIS; decode here with Shift_JIS for proper display
      Schema.constructed(
        "corporateName",
        [Schema.primitive("value", decodeShiftJis, { tagNumber: 12 })],
        { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
      ),
      Schema.constructed(
        "corporateAddress",
        [Schema.primitive("value", decodeShiftJis, { tagNumber: 12 })],
        { tagClass: TagClass.ContextSpecific, tagNumber: 2 },
      ),
      Schema.constructed(
        "representativeDirectorName",
        [Schema.primitive("value", decodeShiftJis, { tagNumber: 12 })],
        { tagClass: TagClass.ContextSpecific, tagNumber: 3 },
      ),
      Schema.constructed(
        "representativeDirectorTitle",
        [Schema.primitive("value", decodeShiftJis, { tagNumber: 12 })],
        { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
      ),
    ],
    { tagNumber: 16 }, // SEQUENCE
  );

  const nested = new SchemaParser(RegisteredCorporationInfoSyntax);
  return nested.parse(buffer);
}

/**
 * Schema construction per spec and observed DER tags
 *
 * （スキーマ定義は削除されました）
 */


/**
 * Normalize result: convert ArrayBuffer or Uint8Array occurrences to hex
 */
function normalizeValue(value: unknown): unknown {
  if (value instanceof ArrayBuffer) return toHex(value);
  if (value instanceof Uint8Array) return toHex(value);

  if (Array.isArray(value)) {
    return (value as unknown[]).map((v) => normalizeValue(v));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeValue(v);
    }
    return out;
  }

  return value;
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const derPath = path.resolve(__dirname, "SHINSEI.der");

  const derFile = await readFile(derPath);
  const derBuffer = bufferToArrayBuffer(derFile);

  // strict=false to accept any SET order if encountered
  const parser = new SchemaParser(PKIMessageSchema, { strict: true });
  const parsed = parser.parse(derBuffer);

  const normalized = normalizeValue(parsed);
  console.log(JSON.stringify(normalized, null, 2));
}

main().catch((err) => {
  console.error("Failed to parse SHINSEI.der:", err);
  process.exit(1);
});
