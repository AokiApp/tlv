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

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const out = new ArrayBuffer(buf.byteLength);
  new Uint8Array(out).set(
    new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
  );
  return out;
}

// -----------------------------
// Raw Parser Schemas (no decoders)
// -----------------------------

// AttributeTypeAndValue ::= SEQUENCE { type OID, value UTF8String }
const AttributeTypeAndValue_RAW = PSchema.constructed(
  "attribute",
  [
    PSchema.primitive("type", undefined, { tagNumber: 6 }),
    PSchema.primitive("value", undefined, { tagNumber: 12 }),
  ],
  { tagNumber: 16 },
);

// RelativeDistinguishedName ::= SET { AttributeTypeAndValue }
const RDN1_RAW = PSchema.constructed("rdn1", [AttributeTypeAndValue_RAW], {
  tagNumber: 17,
});
const RDN2_RAW = PSchema.constructed("rdn2", [AttributeTypeAndValue_RAW], {
  tagNumber: 17,
});

const Name_RAW = PSchema.constructed("name", [RDN1_RAW, RDN2_RAW], {
  tagNumber: 16,
});

const GeneralNameEmpty_RAW = PSchema.constructed("name", [], { tagNumber: 16 });

const Header_RAW = PSchema.constructed(
  "header",
  [
    PSchema.primitive("pvno", undefined, { tagNumber: 2 }),
    PSchema.constructed("sender", [GeneralNameEmpty_RAW], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 4,
    }),
    PSchema.constructed("recipient", [GeneralNameEmpty_RAW], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 4,
    }),
  ],
  { tagNumber: 16 },
);

const AlgorithmIdentifier_RAW = PSchema.constructed(
  "algorithmIdentifier",
  [
    PSchema.primitive("algorithm", undefined, { tagNumber: 6 }),
    PSchema.primitive("parameters", undefined, { tagNumber: 5 }),
  ],
  { tagNumber: 16 },
);

const SubjectPublicKeyInfo_RAW = PSchema.constructed(
  "publicKey",
  [
    PSchema.constructed(
      "algorithm",
      [
        PSchema.primitive("algorithm", undefined, { tagNumber: 6 }),
        PSchema.primitive("parameters", undefined, { tagNumber: 5 }),
      ],
      { tagNumber: 16 },
    ),
    PSchema.primitive("subjectPublicKey", undefined, { tagNumber: 3 }),
  ],
  { tagClass: TagClass.ContextSpecific, tagNumber: 6 },
);

const RegisteredCorporationInfoExtension_RAW = PSchema.constructed(
  "registeredCorporationInfo",
  [
    PSchema.primitive("extnId", undefined, { tagNumber: 6 }),
    // OCTET STRING containing inner DER
    PSchema.primitive("extnValue", undefined, { tagNumber: 4 }),
  ],
  { tagNumber: 16 },
);

const Extensions_RAW = PSchema.constructed(
  "extensions",
  [RegisteredCorporationInfoExtension_RAW],
  { tagClass: TagClass.ContextSpecific, tagNumber: 9 },
);

const CertTemplate_RAW = PSchema.constructed(
  "certTemplate",
  [
    PSchema.constructed("subject", [Name_RAW], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 5,
    }),
    SubjectPublicKeyInfo_RAW,
    Extensions_RAW,
  ],
  { tagNumber: 16 },
);

const CertRequest_RAW = PSchema.constructed(
  "certReq",
  [
    PSchema.primitive("certReqId", undefined, { tagNumber: 2 }),
    CertTemplate_RAW,
  ],
  { tagNumber: 16 },
);

const POPOSigningKey_RAW = PSchema.constructed(
  "pop",
  [
    AlgorithmIdentifier_RAW,
    PSchema.primitive("signature", undefined, { tagNumber: 3 }),
  ],
  { tagClass: TagClass.ContextSpecific, tagNumber: 1 },
);

const SuspensionSecretCode_RAW = PSchema.constructed(
  "value",
  [
    AlgorithmIdentifier_RAW,
    PSchema.primitive("hashedSecretCode", undefined, { tagNumber: 4 }),
  ],
  { tagNumber: 16 },
);

const RegInfoSuspension_RAW = PSchema.constructed(
  "suspensionSecretCode",
  [
    PSchema.primitive("type", undefined, { tagNumber: 6 }),
    SuspensionSecretCode_RAW,
  ],
  { tagNumber: 16 },
);

const RegInfoTimeLimit_RAW = PSchema.constructed(
  "timeLimit",
  [
    PSchema.primitive("type", undefined, { tagNumber: 6 }),
    PSchema.primitive("value", undefined, { tagNumber: 4 }),
  ],
  { tagNumber: 16 },
);

const RegInfo_RAW = PSchema.constructed(
  "regInfo",
  [RegInfoSuspension_RAW, RegInfoTimeLimit_RAW],
  { tagNumber: 16 },
);

const CertReqMsg_RAW = PSchema.constructed(
  "certReqMsg",
  [CertRequest_RAW, POPOSigningKey_RAW, RegInfo_RAW],
  { tagNumber: 16 },
);

// CertReqMessages (observed single entry) as plain SEQUENCE with one element
const CertReqMessages_RAW = PSchema.constructed("certReq", [CertReqMsg_RAW], {
  tagNumber: 16,
});

const Body_RAW = PSchema.constructed("body", [CertReqMessages_RAW], {
  tagClass: TagClass.ContextSpecific,
  tagNumber: 0,
});

const PKIMessage_RAW = PSchema.constructed(
  "PKIMessage",
  [Header_RAW, Body_RAW],
  { tagNumber: 16 },
);

// -----------------------------
// Builder Schemas (mirror of raw)
// -----------------------------

const AttributeTypeAndValue_BUILD = BSchema.constructed(
  "attribute",
  [
    BSchema.primitive("type", undefined, { tagNumber: 6 }),
    BSchema.primitive("value", undefined, { tagNumber: 12 }),
  ],
  { tagNumber: 16 },
);

const RDN1_BUILD = BSchema.constructed("rdn1", [AttributeTypeAndValue_BUILD], {
  tagNumber: 17,
});
const RDN2_BUILD = BSchema.constructed("rdn2", [AttributeTypeAndValue_BUILD], {
  tagNumber: 17,
});

const Name_BUILD = BSchema.constructed("name", [RDN1_BUILD, RDN2_BUILD], {
  tagNumber: 16,
});

const GeneralNameEmpty_BUILD = BSchema.constructed("name", [], {
  tagNumber: 16,
});

const Header_BUILD = BSchema.constructed(
  "header",
  [
    BSchema.primitive("pvno", undefined, { tagNumber: 2 }),
    BSchema.constructed("sender", [GeneralNameEmpty_BUILD], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 4,
    }),
    BSchema.constructed("recipient", [GeneralNameEmpty_BUILD], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 4,
    }),
  ],
  { tagNumber: 16 },
);

const AlgorithmIdentifier_BUILD = BSchema.constructed(
  "algorithmIdentifier",
  [
    BSchema.primitive("algorithm", undefined, { tagNumber: 6 }),
    BSchema.primitive("parameters", undefined, { tagNumber: 5 }),
  ],
  { tagNumber: 16 },
);

const SubjectPublicKeyInfo_BUILD = BSchema.constructed(
  "publicKey",
  [
    BSchema.constructed(
      "algorithm",
      [
        BSchema.primitive("algorithm", undefined, { tagNumber: 6 }),
        BSchema.primitive("parameters", undefined, { tagNumber: 5 }),
      ],
      { tagNumber: 16 },
    ),
    BSchema.primitive("subjectPublicKey", undefined, { tagNumber: 3 }),
  ],
  { tagClass: TagClass.ContextSpecific, tagNumber: 6 },
);

const RegisteredCorporationInfoExtension_BUILD = BSchema.constructed(
  "registeredCorporationInfo",
  [
    BSchema.primitive("extnId", undefined, { tagNumber: 6 }),
    BSchema.primitive("extnValue", undefined, { tagNumber: 4 }),
  ],
  { tagNumber: 16 },
);

const Extensions_BUILD = BSchema.constructed(
  "extensions",
  [RegisteredCorporationInfoExtension_BUILD],
  { tagClass: TagClass.ContextSpecific, tagNumber: 9 },
);

const CertTemplate_BUILD = BSchema.constructed(
  "certTemplate",
  [
    BSchema.constructed("subject", [Name_BUILD], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 5,
    }),
    SubjectPublicKeyInfo_BUILD,
    Extensions_BUILD,
  ],
  { tagNumber: 16 },
);

const CertRequest_BUILD = BSchema.constructed(
  "certReq",
  [
    BSchema.primitive("certReqId", undefined, { tagNumber: 2 }),
    CertTemplate_BUILD,
  ],
  { tagNumber: 16 },
);

const POPOSigningKey_BUILD = BSchema.constructed(
  "pop",
  [
    AlgorithmIdentifier_BUILD,
    BSchema.primitive("signature", undefined, { tagNumber: 3 }),
  ],
  { tagClass: TagClass.ContextSpecific, tagNumber: 1 },
);

const SuspensionSecretCode_BUILD = BSchema.constructed(
  "value",
  [
    AlgorithmIdentifier_BUILD,
    BSchema.primitive("hashedSecretCode", undefined, { tagNumber: 4 }),
  ],
  { tagNumber: 16 },
);

const RegInfoSuspension_BUILD = BSchema.constructed(
  "suspensionSecretCode",
  [
    BSchema.primitive("type", undefined, { tagNumber: 6 }),
    SuspensionSecretCode_BUILD,
  ],
  { tagNumber: 16 },
);

const RegInfoTimeLimit_BUILD = BSchema.constructed(
  "timeLimit",
  [
    BSchema.primitive("type", undefined, { tagNumber: 6 }),
    BSchema.primitive("value", undefined, { tagNumber: 4 }),
  ],
  { tagNumber: 16 },
);

const RegInfo_BUILD = BSchema.constructed(
  "regInfo",
  [RegInfoSuspension_BUILD, RegInfoTimeLimit_BUILD],
  { tagNumber: 16 },
);

const CertReqMsg_BUILD = BSchema.constructed(
  "certReqMsg",
  [CertRequest_BUILD, POPOSigningKey_BUILD, RegInfo_BUILD],
  { tagNumber: 16 },
);

const CertReqMessages_BUILD = BSchema.constructed(
  "certReq",
  [CertReqMsg_BUILD],
  { tagNumber: 16 },
);

const Body_BUILD = BSchema.constructed("body", [CertReqMessages_BUILD], {
  tagClass: TagClass.ContextSpecific,
  tagNumber: 0,
});

const PKIMessage_BUILD = BSchema.constructed(
  "PKIMessage",
  [Header_BUILD, Body_BUILD],
  { tagNumber: 16 },
);

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const derPath = path.resolve(__dirname, "SHINSEI.der");

  const derBuf = await readFile(derPath);
  const der = bufferToArrayBuffer(derBuf);

  // 1) Parse to raw primitives (ArrayBuffer) by schema
  const parser = new Parser(PKIMessage_RAW, { strict: true });
  const raw = parser.parseSync(der);

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
