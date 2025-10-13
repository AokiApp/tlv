// Minimal CMS (RFC 5652) SignedData example using @aokiapp/tlv
// Demonstrates: schema definition (SEQUENCE/SET/context-specific EXPLICIT/IMPLICIT),
// encoding (SchemaBuilder.build()), and decoding (SchemaParser.parse()).
//
// References from RFC 5652 (see examples/cms/rfc5652.txt):
// - ContentInfo ::= SEQUENCE { contentType OBJECT IDENTIFIER, content [0] EXPLICIT ANY DEFINED BY contentType }
// - SignedData ::= SEQUENCE { version CMSVersion, digestAlgorithms SET OF DigestAlgorithmIdentifier,
//     encapContentInfo EncapsulatedContentInfo, certificates [0] IMPLICIT CertificateSet OPTIONAL,
//     crls [1] IMPLICIT RevocationInfoChoices OPTIONAL, signerInfos SET OF SignerInfo }
// - EncapsulatedContentInfo ::= SEQUENCE { eContentType ContentType, eContent [0] EXPLICIT OCTET STRING OPTIONAL }
// - SignerInfo ::= SEQUENCE { version CMSVersion, sid SignerIdentifier,
//     digestAlgorithm DigestAlgorithmIdentifier, signedAttrs [0] IMPLICIT SignedAttributes OPTIONAL,
//     signatureAlgorithm SignatureAlgorithmIdentifier, signature SignatureValue,
//     unsignedAttrs [1] IMPLICIT UnsignedAttributes OPTIONAL }
//
// This example fixes the "contentType" to id-signedData, and demonstrates multiple signers in
// signerInfos (SET OF) with subjectKeyIdentifier ([0] IMPLICIT OCTET STRING) for sid, SHA-256
// digest algorithm, rsaEncryption signature algorithm, and includes EncapsulatedContentInfo with
// eContentType id-data and eContent present.
//
// Limitations: This example chooses concrete variants (e.g., subjectKeyIdentifier sid,
// includes AlgorithmIdentifier parameters as NULL) to avoid optional/ANY complexity,
// but the framework supports generalization by composing other schemas similarly.

import {
  Schema as BuilderSchema,
  SchemaBuilder,
  TagClass,
} from "../../src/builder";
import { Schema as ParserSchema, SchemaParser } from "../../src/parser";

// OID helpers (DER)
type OIDString = string;

function encodeOID(oid: OIDString): ArrayBuffer {
  const arcs = oid.split(".").map((s) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid OID arc: ${s}`);
    return Math.floor(n);
  });
  if (arcs.length < 2) throw new Error("OID must have at least two arcs");
  const first = arcs[0];
  const second = arcs[1];
  let firstByte = 0;
  if (first < 2) {
    firstByte = first * 40 + second;
  } else {
    firstByte = 80 + second;
  }
  const out: number[] = [firstByte];
  for (let i = 2; i < arcs.length; i++) {
    out.push(...encodeBase128(arcs[i]));
  }
  return new Uint8Array(out).buffer;
}

function decodeOID(buffer: ArrayBuffer): OIDString {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) throw new Error("Empty OID encoding");
  const firstByte = bytes[0];
  let first = Math.floor(firstByte / 40);
  let second = firstByte % 40;
  if (firstByte >= 80) {
    first = 2;
    second = firstByte - 80;
  }
  const arcs: number[] = [first, second];
  let i = 1;
  while (i < bytes.length) {
    let val = 0;
    let b: number;
    do {
      if (i >= bytes.length) throw new Error("Truncated OID");
      b = bytes[i++];
      val = (val << 7) | (b & 0x7f);
    } while (b & 0x80);
    arcs.push(val);
  }
  return arcs.join(".");
}

function encodeBase128(n: number): number[] {
  if (n === 0) return [0x00];
  const stack: number[] = [];
  while (n > 0) {
    stack.push(n & 0x7f);
    n = Math.floor(n / 128);
  }
  const out = stack.reverse();
  for (let i = 0; i < out.length - 1; i++) out[i] |= 0x80;
  return out;
}

// INTEGER (positive) helpers (DER minimal length)
function encodeInteger(n: number): ArrayBuffer {
  if (!Number.isFinite(n) || n < 0)
    throw new Error("Only non-negative INTEGER supported");
  if (n === 0) return new Uint8Array([0x00]).buffer;
  const out: number[] = [];
  let temp = n;
  while (temp > 0) {
    out.unshift(temp & 0xff);
    temp >>>= 8;
  }
  // Ensure the first bit is not interpreted as sign bit
  if (out[0] & 0x80) out.unshift(0x00);
  return new Uint8Array(out).buffer;
}

function decodeInteger(buffer: ArrayBuffer): number {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return 0;
  // Ignore potential leading 0x00 for positive sign
  let i = 0;
  if (bytes[0] === 0x00 && bytes.length > 1) i = 1;
  let n = 0;
  for (; i < bytes.length; i++) n = (n << 8) | bytes[i];
  return n;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

// Common CMS and Algorithm OIDs
const CMS_OIDS = {
  id_data: "1.2.840.113549.1.7.1",
  id_signedData: "1.2.840.113549.1.7.2",
};

const ALGO_OIDS = {
  sha256: "2.16.840.1.101.3.4.2.1",
  rsaEncryption: "1.2.840.113549.1.1.1",
};

// -------------------- Builder Schemas --------------------

const AlgorithmIdentifier_B = BuilderSchema.constructed(
  "alg",
  [
    BuilderSchema.primitive("algorithm", (s: string) => encodeOID(s), {
      tagClass: TagClass.Universal,
      tagNumber: 6,
    }),
    // Include NULL parameters explicitly (commonly used for rsaEncryption)
    BuilderSchema.primitive("paramsNull", (_: null) => new ArrayBuffer(0), {
      tagClass: TagClass.Universal,
      tagNumber: 5,
    }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const EncapsulatedContentInfo_B = BuilderSchema.constructed(
  "encapContentInfo",
  [
    BuilderSchema.primitive("eContentType", (s: string) => encodeOID(s), {
      tagClass: TagClass.Universal,
      tagNumber: 6,
    }),
    // eContent [0] EXPLICIT OCTET STRING OPTIONAL (we include it here)
    BuilderSchema.constructed(
      "eContentWrap",
      [
        BuilderSchema.primitive("eContent", (buf: ArrayBuffer) => buf, {
          tagClass: TagClass.Universal,
          tagNumber: 4,
        }),
      ],
      { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
    ),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const SignerInfo_B = BuilderSchema.constructed(
  "signer",
  [
    BuilderSchema.primitive("version", (n: number) => encodeInteger(n), {
      tagClass: TagClass.Universal,
      tagNumber: 2,
    }),
    // sid: subjectKeyIdentifier [0] IMPLICIT OCTET STRING
    BuilderSchema.primitive("sid", (id: Uint8Array) => toArrayBuffer(id), {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 0,
    }),
    BuilderSchema.constructed(
      "digestAlgorithm",
      [
        BuilderSchema.primitive("algorithm", (s: string) => encodeOID(s), {
          tagClass: TagClass.Universal,
          tagNumber: 6,
        }),
        BuilderSchema.primitive("paramsNull", (_: null) => new ArrayBuffer(0), {
          tagClass: TagClass.Universal,
          tagNumber: 5,
        }),
      ],
      { tagClass: TagClass.Universal, tagNumber: 16 },
    ),
    BuilderSchema.constructed(
      "signatureAlgorithm",
      [
        BuilderSchema.primitive("algorithm", (s: string) => encodeOID(s), {
          tagClass: TagClass.Universal,
          tagNumber: 6,
        }),
        BuilderSchema.primitive("paramsNull", (_: null) => new ArrayBuffer(0), {
          tagClass: TagClass.Universal,
          tagNumber: 5,
        }),
      ],
      { tagClass: TagClass.Universal, tagNumber: 16 },
    ),
    BuilderSchema.primitive(
      "signature",
      (sig: Uint8Array) => toArrayBuffer(sig),
      {
        tagClass: TagClass.Universal,
        tagNumber: 4,
      },
    ),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const SignedData_B = BuilderSchema.constructed(
  "signedData",
  [
    BuilderSchema.primitive("version", (n: number) => encodeInteger(n), {
      tagClass: TagClass.Universal,
      tagNumber: 2,
    }),
    // digestAlgorithms SEQUENCE OF AlgorithmIdentifier (demo-friendly; library also supports SET OF)
    BuilderSchema.sequenceOf("digestAlgorithms", AlgorithmIdentifier_B, {
      tagClass: TagClass.Universal,
      tagNumber: 16,
    }),
    EncapsulatedContentInfo_B,
    // signerInfos SEQUENCE OF SignerInfo (demo-friendly; library also supports SET OF)
    BuilderSchema.sequenceOf("signerInfos", SignerInfo_B, {
      tagClass: TagClass.Universal,
      tagNumber: 16,
    }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

// ContentInfo with content [0] EXPLICIT SignedData
const ContentInfo_SignedData_B = BuilderSchema.constructed(
  "contentInfo",
  [
    BuilderSchema.primitive("contentType", (s: string) => encodeOID(s), {
      tagClass: TagClass.Universal,
      tagNumber: 6,
    }),
    BuilderSchema.constructed("content", [SignedData_B], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 0,
    }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

// -------------------- Parser Schemas --------------------

const AlgorithmIdentifier_P = ParserSchema.constructed(
  "alg",
  [
    ParserSchema.primitive("algorithm", decodeOID, {
      tagClass: TagClass.Universal,
      tagNumber: 6,
    }),
    ParserSchema.primitive("paramsNull", (_: ArrayBuffer) => null, {
      tagClass: TagClass.Universal,
      tagNumber: 5,
    }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const EncapsulatedContentInfo_P = ParserSchema.constructed(
  "encapContentInfo",
  [
    ParserSchema.primitive("eContentType", decodeOID, {
      tagClass: TagClass.Universal,
      tagNumber: 6,
    }),
    ParserSchema.constructed(
      "eContentWrap",
      [
        ParserSchema.primitive(
          "eContent",
          (buf: ArrayBuffer) => new Uint8Array(buf),
          {
            tagClass: TagClass.Universal,
            tagNumber: 4,
          },
        ),
      ],
      { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
    ),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const SignerInfo_P = ParserSchema.constructed(
  "signer",
  [
    ParserSchema.primitive("version", decodeInteger, {
      tagClass: TagClass.Universal,
      tagNumber: 2,
    }),
    ParserSchema.primitive("sid", (buf: ArrayBuffer) => new Uint8Array(buf), {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 0,
    }),
    ParserSchema.constructed(
      "digestAlgorithm",
      [
        ParserSchema.primitive("algorithm", decodeOID, {
          tagClass: TagClass.Universal,
          tagNumber: 6,
        }),
        ParserSchema.primitive("paramsNull", (_: ArrayBuffer) => null, {
          tagClass: TagClass.Universal,
          tagNumber: 5,
        }),
      ],
      { tagClass: TagClass.Universal, tagNumber: 16 },
    ),
    ParserSchema.constructed(
      "signatureAlgorithm",
      [
        ParserSchema.primitive("algorithm", decodeOID, {
          tagClass: TagClass.Universal,
          tagNumber: 6,
        }),
        ParserSchema.primitive("paramsNull", (_: ArrayBuffer) => null, {
          tagClass: TagClass.Universal,
          tagNumber: 5,
        }),
      ],
      { tagClass: TagClass.Universal, tagNumber: 16 },
    ),
    ParserSchema.primitive(
      "signature",
      (buf: ArrayBuffer) => new Uint8Array(buf),
      {
        tagClass: TagClass.Universal,
        tagNumber: 4,
      },
    ),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const SignedData_P = ParserSchema.constructed(
  "signedData",
  [
    ParserSchema.primitive("version", decodeInteger, {
      tagClass: TagClass.Universal,
      tagNumber: 2,
    }),
    ParserSchema.sequenceOf("digestAlgorithms", AlgorithmIdentifier_P, {
      tagClass: TagClass.Universal,
      tagNumber: 16,
    }),
    EncapsulatedContentInfo_P,
    ParserSchema.sequenceOf("signerInfos", SignerInfo_P, {
      tagClass: TagClass.Universal,
      tagNumber: 16,
    }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const ContentInfo_SignedData_P = ParserSchema.constructed(
  "contentInfo",
  [
    ParserSchema.primitive("contentType", decodeOID, {
      tagClass: TagClass.Universal,
      tagNumber: 6,
    }),
    ParserSchema.constructed("content", [SignedData_P], {
      tagClass: TagClass.ContextSpecific,
      tagNumber: 0,
    }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

// -------------------- Demo build and parse --------------------

export function buildContentInfoSignedDataDemo(): ArrayBuffer {
  const sid = new Uint8Array(20).fill(0xab);
  const contentBytes = new TextEncoder().encode("Hello CMS");

  const builder = new SchemaBuilder(ContentInfo_SignedData_B);
  const encoded = builder.build({
    contentType: CMS_OIDS.id_signedData,
    content: {
      signedData: {
        // MUST be 3 because we use subjectKeyIdentifier in SignerInfo (RFC 5652 Section 5.1)
        version: 3,
        digestAlgorithms: [
          {
            algorithm: ALGO_OIDS.sha256,
            paramsNull: null,
          },
        ],
        encapContentInfo: {
          eContentType: CMS_OIDS.id_data,
          eContentWrap: {
            eContent: toArrayBuffer(contentBytes),
          },
        },
        signerInfos: [
          {
            version: 3,
            sid,
            digestAlgorithm: {
              algorithm: ALGO_OIDS.sha256,
              paramsNull: null,
            },
            signatureAlgorithm: {
              algorithm: ALGO_OIDS.rsaEncryption,
              paramsNull: null,
            },
            signature: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
          },
          {
            version: 3,
            sid: new Uint8Array(20).fill(0xcd),
            digestAlgorithm: {
              algorithm: ALGO_OIDS.sha256,
              paramsNull: null,
            },
            signatureAlgorithm: {
              algorithm: ALGO_OIDS.rsaEncryption,
              paramsNull: null,
            },
            signature: new Uint8Array([0xca, 0xfe, 0xba, 0xbe]),
          },
        ],
      },
    },
  });
  return encoded;
}

export function parseContentInfoSignedDataDemo(buffer: ArrayBuffer) {
  const parser = new SchemaParser(ContentInfo_SignedData_P);
  const parsed = parser.parse(buffer) as {
    contentType: string;
    content: {
      signedData: {
        version: number;
        digestAlgorithms: { algorithm: string; paramsNull: null }[];
        encapContentInfo: {
          eContentType: string;
          eContentWrap: { eContent: Uint8Array };
        };
        signerInfos: {
          version: number;
          sid: Uint8Array;
          digestAlgorithm: { algorithm: string; paramsNull: null };
          signatureAlgorithm: { algorithm: string; paramsNull: null };
          signature: Uint8Array;
        }[];
      };
    };
  };

  // Quick sanity extract
  const ct = parsed.contentType;
  const sd = parsed.content.signedData;
  const eContentType = sd.encapContentInfo.eContentType;
  const eContent = sd.encapContentInfo.eContentWrap.eContent;
  const signers = sd.signerInfos;
  const algOids = sd.digestAlgorithms.map((a) => a.algorithm);

  return {
    contentTypeOID: ct,
    signedDataVersion: sd.version,
    digestAlgorithmOIDs: algOids,
    eContentTypeOID: eContentType,
    eContentBytes: Array.from(eContent),
    signerVersions: signers.map((s) => s.version),
    sidLengths: signers.map((s) => s.sid.length),
    signatureAlgorithmOIDs: signers.map((s) => s.signatureAlgorithm.algorithm),
    signatureBytesList: signers.map((s) => Array.from(s.signature)),
  };
}

// If executed directly as a script (optional display)
(function runDemo() {
  try {
    const encoded = buildContentInfoSignedDataDemo();
    const summary = parseContentInfoSignedDataDemo(encoded);

    // Display concise results
    // eslint-disable-next-line no-console
    console.log("Encoded ContentInfo(SignedData) length:", encoded.byteLength);
    // eslint-disable-next-line no-console
    console.log("Summary:", summary);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("CMS demo error:", e);
  }
})();
