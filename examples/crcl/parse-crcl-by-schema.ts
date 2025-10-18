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

// AlgorithmIdentifier ::= SEQUENCE { algorithm OBJECT IDENTIFIER, parameters NULL OPTIONAL }
const AlgorithmIdentifier = Schema.constructed(
  "algorithmIdentifier",
  [
    Schema.primitive("algorithm", decodeOID, { tagNumber: 6 }),
    Schema.primitive("parameters", undefined, { tagNumber: 5, optional: true }),
  ],
  { tagNumber: 16 },
);

// AttributeTypeAndValue ::= SEQUENCE { type OBJECT IDENTIFIER, value DirectoryString(UTF8String) }
// Used for RDN attributes in Name.subject (organizationName/commonName)
const AttributeTypeAndValue = Schema.constructed(
  "attribute",
  [
    Schema.primitive("type", decodeOID, { tagNumber: 6 }),
    Schema.primitive("value", decodeUtf8, { tagNumber: 12 }),
  ],
  { tagNumber: 16 },
);

// RelativeDistinguishedName ::= SET OF AttributeTypeAndValue
// The sample DER contains one Attribute per RDN; we still define it as a SET container.
const RelativeDistinguishedName = Schema.constructed(
  "rdn",
  [
    // One AttributeTypeAndValue entry
    AttributeTypeAndValue,
  ],
  { tagNumber: 17, isSet: true },
);

// Name ::= SEQUENCE OF RelativeDistinguishedName
const Name = Schema.constructed(
  "name",
  [Schema.repeated("rdns", RelativeDistinguishedName)],
  { tagNumber: 16 },
);

// --- Header ---

// PKIHeader ::= SEQUENCE { pvno INTEGER(1), sender [4] GeneralName, recipient [4] GeneralName }
const PKIHeader = Schema.constructed(
  "header",
  [
    Schema.primitive("pvno", decodeInteger, { tagNumber: 2 }),
    // GeneralName ([4]) -> Name (RDNSequence). Spec shows empty SEQUENCE in sample.
    Schema.constructed(
      "sender",
      [
        // inner Name SEQUENCE (can be empty per observed DER)
        Schema.constructed("name", [], { tagNumber: 16 }),
      ],
      { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
    ),
    Schema.constructed(
      "recipient",
      [Schema.constructed("name", [], { tagNumber: 16 })],
      { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
    ),
  ],
  { tagNumber: 16 },
);

// --- CertTemplate ---

// SubjectPublicKeyInfo ([6]) ::= SEQUENCE { algorithm AlgorithmIdentifier, subjectPublicKey BIT STRING }
const SubjectPublicKeyInfo = Schema.constructed(
  "publicKey",
  [
    AlgorithmIdentifier,
    Schema.primitive("subjectPublicKey", decodeBitStringHex, { tagNumber: 3 }),
  ],
  { tagClass: TagClass.ContextSpecific, tagNumber: 6 },
);

// Extensions ([9]) ::= SEQUENCE { registeredCorporationInfo Extension }
const RegisteredCorporationInfoExtension = Schema.constructed(
  "registeredCorporationInfo",
  [
    Schema.primitive("extnId", decodeOID, { tagNumber: 6 }),
    // OCTET STRING contents parsed by decodeRegisteredCorporationInfoExtension()
    Schema.primitive("extnValue", decodeRegisteredCorporationInfoExtension, {
      tagNumber: 4,
    }),
  ],
  { tagNumber: 16 },
);

const Extensions = Schema.constructed(
  "extensions",
  [RegisteredCorporationInfoExtension],
  { tagClass: TagClass.ContextSpecific, tagNumber: 9 },
);

// CertTemplate ::= SEQUENCE { subject [5] Name OPTIONAL, publicKey [6] SubjectPublicKeyInfo, extensions [9] Extensions }
const CertTemplate = Schema.constructed(
  "certTemplate",
  [
    Schema.constructed("subject", [Name], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 5,
      optional: true,
    }),
    SubjectPublicKeyInfo,
    Extensions,
  ],
  { tagNumber: 16 },
);

// --- CertReqMsg ---

// CertRequest ::= SEQUENCE { certReqId INTEGER(0), certTemplate CertTemplate }
const CertRequest = Schema.constructed(
  "certReq",
  [
    Schema.primitive("certReqId", decodeInteger, { tagNumber: 2 }),
    CertTemplate,
  ],
  { tagNumber: 16 },
);

// --- ProofOfPossession ([1] POPOSigningKey) ---

const POPOSigningKey = Schema.constructed(
  "pop",
  [
    Schema.constructed(
      "algorithmIdentifier",
      [
        Schema.primitive("algorithm", decodeOID, { tagNumber: 6 }),
        Schema.primitive("parameters", undefined, {
          tagNumber: 5,
          optional: true,
        }),
      ],
      { tagNumber: 16 },
    ),
    Schema.primitive("signature", decodeBitStringHex, { tagNumber: 3 }),
  ],
  { tagClass: TagClass.ContextSpecific, tagNumber: 1 },
);

// --- RegInfo (SEQUENCE OF AttributeTypeAndValue) ---

// SuspensionSecretCode ::= SEQUENCE {
//   hashAlg AlgorithmIdentifier OPTIONAL,
//   hashedSecretCode OCTET STRING
// }
const SuspensionSecretCode = Schema.constructed(
  "value",
  [
    Schema.constructed(
      "hashAlg",
      [
        Schema.primitive("algorithm", decodeOID, { tagNumber: 6 }),
        Schema.primitive("parameters", undefined, {
          tagNumber: 5,
          optional: true,
        }),
      ],
      { tagNumber: 16, optional: true },
    ),
    // Render hashedSecretCode as hex for readability
    Schema.primitive("hashedSecretCode", toHex, { tagNumber: 4 }),
  ],
  { tagNumber: 16 },
);

// Attribute: suspensionSecretCode (OID: 1.2.392.100300.1.2.105)
const SuspensionSecretCodeAttr = Schema.constructed(
  "suspensionSecretCode",
  [Schema.primitive("type", decodeOID, { tagNumber: 6 }), SuspensionSecretCode],
  { tagNumber: 16 },
);

// Attribute: timeLimit (OID: 1.2.392.100300.1.2.104), value OCTET STRING with ASCII digits
const TimeLimitAttr = Schema.constructed(
  "timeLimit",
  [
    Schema.primitive("type", decodeOID, { tagNumber: 6 }),
    Schema.primitive("value", decodeAscii, { tagNumber: 4 }),
  ],
  { tagNumber: 16 },
);

// RegInfo ::= SEQUENCE { suspensionSecretCode AttributeTypeAndValue, timeLimit AttributeTypeAndValue }
const RegInfo = Schema.constructed(
  "regInfo",
  [SuspensionSecretCodeAttr, TimeLimitAttr],
  { tagNumber: 16, optional: true },
);

/**
 * CertReqMsg ::= SEQUENCE {
 *   certReq  CertRequest,
 *   pop      [1] POPOSigningKey,
 *   regInfo  SEQUENCE OPTIONAL
 * }
 */
const CertReqMsg = Schema.constructed(
  "certReqMsg",
  [CertRequest, POPOSigningKey, RegInfo],
  { tagNumber: 16 },
);

// --- Body ([0]) ---

/**
 * CertReqMessages ::= SEQUENCE OF CertReqMsg
 * PKIBody ([0]) ::= SEQUENCE { certReq CertReqMessages }
 */
const CertReqMessages = Schema.constructed(
  "certReq",
  [Schema.repeated("items", CertReqMsg)],
  { tagNumber: 16 },
);

const PKIBody = Schema.constructed("body", [CertReqMessages], {
  tagClass: TagClass.ContextSpecific,
  tagNumber: 0,
});

// --- Top-level ---

const PKIMessageSchema = Schema.constructed(
  "PKIMessage",
  [PKIHeader, PKIBody],
  {
    tagNumber: 16,
  },
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
