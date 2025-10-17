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
 * PKIMessage ::= SEQUENCE {
 *   header PKIHeader ::= SEQUENCE {
 *     pvno INTEGER(1),
 *     sender [4] GeneralName ::= SEQUENCE (may be empty),
 *     recipient [4] GeneralName ::= SEQUENCE (may be empty)
 *   },
 *   body [0] PKIBody ::= SEQUENCE {
 *     certReq CertReqMessages ::= SEQUENCE OF CertReqMsg {
 *       certReq CertRequest ::= SEQUENCE {
 *         certReqId INTEGER,
 *         certTemplate CertTemplate ::= SEQUENCE {
 *           subject   [5] Name (RDNSequence),
 *           publicKey [6] SubjectPublicKeyInfo,
 *           extensions [9] Extensions
 *         }
 *       },
 *       pop [1] POPOSigningKey ::= SEQUENCE {
 *         algorithmIdentifier AlgorithmIdentifier,
 *         signature BIT STRING
 *       },
 *       regInfo SEQUENCE OF AttributeTypeAndValue {
 *         suspensionSecretCode (OID 1.2.392.100300.1.2.105) ::= SEQUENCE {
 *           type OBJECT IDENTIFIER,
 *           value SuspensionSecretCode ::= SEQUENCE {
 *             hashAlg AlgorithmIdentifier (SHA-256),
 *             hashedSecretCode OCTET STRING
 *           }
 *         },
 *         timeLimit (OID 1.2.392.100300.1.2.104) ::= SEQUENCE {
 *           type OBJECT IDENTIFIER,
 *           value TimeLimit ::= OCTET STRING (ASCII "MM")
 *         }
 *       }
 *     }
 *   }
 * }
 */

// Name (RDNSequence) with two RDN entries (organizationName and commonName) as observed
const AttributeTypeAndValue = Schema.constructed(
  "attribute",
  [
    Schema.primitive("type", decodeOID, { tagNumber: 6 }), // OBJECT IDENTIFIER
    Schema.primitive("value", decodeUtf8, { tagNumber: 12 }), // DirectoryString (UTF8String)
  ],
  { tagNumber: 16 }, // SEQUENCE
);

const RelativeDistinguishedName = Schema.repeated(
  "rdn",
  AttributeTypeAndValue,
  { tagNumber: 17 },
);

const NameSequence = Schema.repeated("name", RelativeDistinguishedName, {
  tagNumber: 16,
});

// GeneralName [4] containing Name (could be empty in header)
const GeneralNameEmpty = Schema.constructed(
  "name",
  [],
  { tagNumber: 16 }, // SEQUENCE with length 0 allowed
);

const HeaderSchema = Schema.constructed(
  "header",
  [
    Schema.primitive("pvno", decodeInteger, { tagNumber: 2 }), // INTEGER
    Schema.constructed("sender", [GeneralNameEmpty], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 4,
    }),
    Schema.constructed("recipient", [GeneralNameEmpty], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 4,
    }),
  ],
  { tagNumber: 16 }, // SEQUENCE
);

// AlgorithmIdentifier ::= SEQUENCE { algorithm OBJECT IDENTIFIER, parameters NULL OPTIONAL }
const AlgorithmIdentifier = Schema.constructed(
  "algorithmIdentifier",
  [
    Schema.primitive("algorithm", decodeOID, { tagNumber: 6 }),
    // parameters may be NULL (tag 5) or absent; observed as 05 00 in file
    Schema.primitive("parameters", () => null, { tagNumber: 5 }),
  ],
  { tagNumber: 16 }, // SEQUENCE
);

// SubjectPublicKeyInfo [6] ::= SEQUENCE { algorithm AlgorithmIdentifier, subjectPublicKey BIT STRING }
const SubjectPublicKeyInfo = Schema.constructed(
  "publicKey",
  [
    Schema.constructed(
      "algorithm",
      [
        Schema.primitive("algorithm", decodeOID, { tagNumber: 6 }),
        Schema.primitive("parameters", () => null, {
          tagNumber: 5,
        }),
      ],
      { tagNumber: 16 },
    ),
    Schema.primitive("subjectPublicKey", decodeBitStringHex, { tagNumber: 3 }),
  ],
  { tagClass: TagClass.ContextSpecific, tagNumber: 6 },
);

// Extensions [9] ::= SEQUENCE { registeredCorporationInfo Extension ::= SEQUENCE { extnId OID, extnValue OCTET STRING }}
const RegisteredCorporationInfoExtension = Schema.constructed(
  "registeredCorporationInfo",
  [
    Schema.primitive("extnId", decodeOID, { tagNumber: 6 }),
    Schema.primitive("extnValue", decodeRegisteredCorporationInfoExtension, {
      tagNumber: 4, // OCTET STRING containing DER of RegisteredCorporationInfoSyntax
    }),
  ],
  { tagNumber: 16 }, // Extension SEQUENCE
);

const Extensions = Schema.constructed(
  "extensions",
  [RegisteredCorporationInfoExtension],
  { tagClass: TagClass.ContextSpecific, tagNumber: 9 },
);

// CertTemplate ::= SEQUENCE { subject [5] Name, publicKey [6] SubjectPublicKeyInfo, extensions [9] Extensions }
const CertTemplate = Schema.constructed(
  "certTemplate",
  [
    Schema.constructed("subject", [NameSequence], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 5,
    }),
    SubjectPublicKeyInfo,
    Extensions,
  ],
  { tagNumber: 16 }, // SEQUENCE
);

// CertRequest ::= SEQUENCE { certReqId INTEGER, certTemplate CertTemplate }
const CertRequest = Schema.constructed(
  "certReq",
  [
    Schema.primitive("certReqId", decodeInteger, { tagNumber: 2 }), // INTEGER
    CertTemplate,
  ],
  { tagNumber: 16 },
);

// POPOSigningKey [1] ::= SEQUENCE { algorithmIdentifier AlgorithmIdentifier, signature BIT STRING }
const POPOSigningKey = Schema.constructed(
  "pop",
  [
    AlgorithmIdentifier,
    Schema.primitive("signature", decodeBitStringHex, { tagNumber: 3 }),
  ],
  { tagClass: TagClass.ContextSpecific, tagNumber: 1 },
);

// SuspensionSecretCode ::= SEQUENCE { hashAlg AlgorithmIdentifier (SHA-256), hashedSecretCode OCTET STRING }
const SuspensionSecretCode = Schema.constructed(
  "value",
  [
    AlgorithmIdentifier,
    Schema.primitive("hashedSecretCode", (buffer) => toHex(buffer), {
      tagNumber: 4,
    }),
  ],
  { tagNumber: 16 },
);

// AttributeTypeAndValue entries within regInfo
const RegInfoSuspension = Schema.constructed(
  "suspensionSecretCode",
  [Schema.primitive("type", decodeOID, { tagNumber: 6 }), SuspensionSecretCode],
  { tagNumber: 16 },
);

const RegInfoTimeLimit = Schema.constructed(
  "timeLimit",
  [
    Schema.primitive("type", decodeOID, { tagNumber: 6 }),
    Schema.primitive("value", decodeAscii, { tagNumber: 4 }), // OCTET STRING (ASCII, e.g., "27")
  ],
  { tagNumber: 16 },
);

const RegInfo = Schema.constructed(
  "regInfo",
  [RegInfoSuspension, RegInfoTimeLimit],
  { tagNumber: 16 }, // SEQUENCE (OF AttributeTypeAndValue)
);

// CertReqMsg ::= SEQUENCE { certReq CertRequest, pop [1] POPOSigningKey, regInfo SEQUENCE OF ... }
const CertReqMsg = Schema.constructed(
  "certReqMsg",
  [CertRequest, POPOSigningKey, RegInfo],
  { tagNumber: 16 },
);

// CertReqMessages ::= SEQUENCE OF CertReqMsg (observed single entry)
const CertReqMessages = Schema.repeated("certReq", CertReqMsg, {
  tagNumber: 16,
});

// PKIBody [0]
const BodySchema = Schema.constructed("body", [CertReqMessages], {
  tagClass: TagClass.ContextSpecific,
  tagNumber: 0,
});

// Top-level PKIMessage
const PKIMessageSchema = Schema.constructed(
  "PKIMessage",
  [HeaderSchema, BodySchema],
  { tagNumber: 16 }, // SEQUENCE
);

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
