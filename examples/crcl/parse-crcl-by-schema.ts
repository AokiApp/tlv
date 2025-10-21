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
  identity,
} from "../../src/common/codecs.ts";

function decodeRegisteredCorporationInfoExtension(buffer: ArrayBuffer) {
  // RegisteredCorporationInfoSyntax ::= SEQUENCE {
  //   corporateName            [0] UTF8String,
  //   corporateAddress         [2] UTF8String,
  //   representativeDirectorName [3] UTF8String,
  //   representativeDirectorTitle [4] UTF8String
  // }
  const RegisteredCorporationInfoSyntax = Schema.constructed(
    "registeredCorporationInfo",
    { tagNumber: 16 }, // SEQUENCE
    [
      // EXPLICIT context-specific tags: constructed wrapper containing inner DirectoryString (UTF8String in DER, content encoded per spec)
      // Spec notes say these fields are recorded using Shift_JIS; decode here with Shift_JIS for proper display
      Schema.constructed(
        "corporateName",
        { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
        [Schema.primitive("value", { tagNumber: 12 }, decodeShiftJis)],
      ),
      Schema.constructed(
        "corporateAddress",
        { tagClass: TagClass.ContextSpecific, tagNumber: 2 },
        [Schema.primitive("value", { tagNumber: 12 }, decodeShiftJis)],
      ),
      Schema.constructed(
        "representativeDirectorName",
        { tagClass: TagClass.ContextSpecific, tagNumber: 3 },
        [Schema.primitive("value", { tagNumber: 12 }, decodeShiftJis)],
      ),
      Schema.constructed(
        "representativeDirectorTitle",
        { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
        [Schema.primitive("value", { tagNumber: 12 }, decodeShiftJis)],
      ),
    ],
  );

  const nested = new SchemaParser(RegisteredCorporationInfoSyntax);
  return nested.parse(buffer);
}

// AlgorithmIdentifier ::= SEQUENCE { algorithm OBJECT IDENTIFIER, parameters NULL OPTIONAL }
const AlgorithmIdentifier = Schema.constructed(
  "algorithmIdentifier",
  { tagNumber: 16 },
  [
    Schema.primitive("algorithm", { tagNumber: 6 }, decodeOID),
    Schema.primitive("parameters", { tagNumber: 5, optional: true }, identity),
  ],
);

// AttributeTypeAndValue ::= SEQUENCE { type OBJECT IDENTIFIER, value DirectoryString(UTF8String) }
// Used for RDN attributes in Name.subject (organizationName/commonName)
const AttributeTypeAndValue = Schema.constructed(
  "attribute",
  { tagNumber: 16 },
  [
    Schema.primitive("type", { tagNumber: 6 }, decodeOID),
    Schema.primitive("value", { tagNumber: 12 }, decodeUtf8),
  ],
);

// RelativeDistinguishedName ::= SET OF AttributeTypeAndValue
// The sample DER contains one Attribute per RDN; we still define it as a SET container.
const RelativeDistinguishedName = Schema.constructed(
  "rdn",
  { tagNumber: 17, isSet: true },
  [
    // One AttributeTypeAndValue entry
    AttributeTypeAndValue,
  ],
);

// Name ::= SEQUENCE OF RelativeDistinguishedName
const Name = Schema.constructed("name", { tagNumber: 16 }, [
  Schema.repeated("rdns", {}, RelativeDistinguishedName),
]);

// --- Header ---

// PKIHeader ::= SEQUENCE { pvno INTEGER(1), sender [4] GeneralName, recipient [4] GeneralName }
const PKIHeader = Schema.constructed("header", { tagNumber: 16 }, [
  Schema.primitive("pvno", { tagNumber: 2 }, decodeInteger),
  // GeneralName ([4]) -> Name (RDNSequence). Spec shows empty SEQUENCE in sample.
  Schema.constructed(
    "sender",
    { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
    [
      // inner Name SEQUENCE (can be empty per observed DER)
      Schema.constructed("name", { tagNumber: 16 }, []),
    ],
  ),
  Schema.constructed(
    "recipient",
    { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
    [Schema.constructed("name", { tagNumber: 16 }, [])],
  ),
]);

// --- CertTemplate ---

// SubjectPublicKeyInfo ([6]) ::= SEQUENCE { algorithm AlgorithmIdentifier, subjectPublicKey BIT STRING }
const SubjectPublicKeyInfo = Schema.constructed(
  "publicKey",
  { tagClass: TagClass.ContextSpecific, tagNumber: 6 },
  [
    AlgorithmIdentifier,
    Schema.primitive("subjectPublicKey", { tagNumber: 3 }, decodeBitStringHex),
  ],
);

// Extensions ([9]) ::= SEQUENCE { registeredCorporationInfo Extension }
const RegisteredCorporationInfoExtension = Schema.constructed(
  "registeredCorporationInfo",
  { tagNumber: 16 },
  [
    Schema.primitive("extnId", { tagNumber: 6 }, decodeOID),
    // OCTET STRING contents parsed by decodeRegisteredCorporationInfoExtension()
    Schema.primitive(
      "extnValue",
      { tagNumber: 4 },
      decodeRegisteredCorporationInfoExtension,
    ),
  ],
);

const Extensions = Schema.constructed(
  "extensions",
  { tagClass: TagClass.ContextSpecific, tagNumber: 9 },
  [RegisteredCorporationInfoExtension],
);

// CertTemplate ::= SEQUENCE { subject [5] Name OPTIONAL, publicKey [6] SubjectPublicKeyInfo, extensions [9] Extensions }
const CertTemplate = Schema.constructed("certTemplate", { tagNumber: 16 }, [
  Schema.constructed(
    "subject",
    { tagClass: TagClass.ContextSpecific, tagNumber: 5, optional: true },
    [Name],
  ),
  SubjectPublicKeyInfo,
  Extensions,
]);

// --- CertReqMsg ---

// CertRequest ::= SEQUENCE { certReqId INTEGER(0), certTemplate CertTemplate }
const CertRequest = Schema.constructed("certReq", { tagNumber: 16 }, [
  Schema.primitive("certReqId", { tagNumber: 2 }, decodeInteger),
  CertTemplate,
]);

// --- ProofOfPossession ([1] POPOSigningKey) ---

const POPOSigningKey = Schema.constructed(
  "pop",
  { tagClass: TagClass.ContextSpecific, tagNumber: 1 },
  [
    Schema.constructed("algorithmIdentifier", { tagNumber: 16 }, [
      Schema.primitive("algorithm", { tagNumber: 6 }, decodeOID),
      Schema.primitive(
        "parameters",
        { tagNumber: 5, optional: true },
        identity,
      ),
    ]),
    Schema.primitive("signature", { tagNumber: 3 }, decodeBitStringHex),
  ],
);

// --- RegInfo (SEQUENCE OF AttributeTypeAndValue) ---

// SuspensionSecretCode ::= SEQUENCE {
//   hashAlg AlgorithmIdentifier OPTIONAL,
//   hashedSecretCode OCTET STRING
// }
const SuspensionSecretCode = Schema.constructed("value", { tagNumber: 16 }, [
  Schema.constructed("hashAlg", { tagNumber: 16, optional: true }, [
    Schema.primitive("algorithm", { tagNumber: 6 }, decodeOID),
    Schema.primitive("parameters", { tagNumber: 5, optional: true }, identity),
  ]),
  // Render hashedSecretCode as hex for readability
  Schema.primitive("hashedSecretCode", { tagNumber: 4 }, toHex),
]);

// Attribute: suspensionSecretCode (OID: 1.2.392.100300.1.2.105)
const SuspensionSecretCodeAttr = Schema.constructed(
  "suspensionSecretCode",
  { tagNumber: 16 },
  [Schema.primitive("type", { tagNumber: 6 }, decodeOID), SuspensionSecretCode],
);

// Attribute: timeLimit (OID: 1.2.392.100300.1.2.104), value OCTET STRING with ASCII digits
const TimeLimitAttr = Schema.constructed("timeLimit", { tagNumber: 16 }, [
  Schema.primitive("type", { tagNumber: 6 }, decodeOID),
  Schema.primitive("value", { tagNumber: 4 }, decodeAscii),
]);

// RegInfo ::= SEQUENCE { suspensionSecretCode AttributeTypeAndValue, timeLimit AttributeTypeAndValue }
const RegInfo = Schema.constructed(
  "regInfo",
  { tagNumber: 16, optional: true },
  [SuspensionSecretCodeAttr, TimeLimitAttr],
);

/**
 * CertReqMsg ::= SEQUENCE {
 *   certReq  CertRequest,
 *   pop      [1] POPOSigningKey,
 *   regInfo  SEQUENCE OPTIONAL
 * }
 */
const CertReqMsg = Schema.constructed("certReqMsg", { tagNumber: 16 }, [
  CertRequest,
  POPOSigningKey,
  RegInfo,
]);

// --- Body ([0]) ---

/**
 * CertReqMessages ::= SEQUENCE OF CertReqMsg
 * PKIBody ([0]) ::= SEQUENCE { certReq CertReqMessages }
 */
const CertReqMessages = Schema.constructed("certReq", { tagNumber: 16 }, [
  Schema.repeated("items", {}, CertReqMsg),
]);

const PKIBody = Schema.constructed(
  "body",
  { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
  [CertReqMessages],
);

// --- Top-level ---

const PKIMessageSchema = Schema.constructed("PKIMessage", { tagNumber: 16 }, [
  PKIHeader,
  PKIBody,
]);

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
