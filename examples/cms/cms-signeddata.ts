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
import {
  encodeOID,
  decodeOID,
  encodeInteger,
  decodeInteger,
  toArrayBuffer,
} from "../../src/utils/codecs";

// OID helpers (DER)

// INTEGER (positive) helpers (DER minimal length)

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
  { tagClass: TagClass.Universal, tagNumber: 16 },
  [
    BuilderSchema.primitive("algorithm", { tagClass: TagClass.Universal, tagNumber: 6 }, (s: string) => encodeOID(s)),
    // Include NULL parameters explicitly (commonly used for rsaEncryption)
    BuilderSchema.primitive("paramsNull", { tagClass: TagClass.Universal, tagNumber: 5 }, (_: null) => new ArrayBuffer(0)),
  ],
);

const EncapsulatedContentInfo_B = BuilderSchema.constructed(
  "encapContentInfo",
  { tagClass: TagClass.Universal, tagNumber: 16 },
  [
    BuilderSchema.primitive("eContentType", { tagClass: TagClass.Universal, tagNumber: 6 }, (s: string) => encodeOID(s)),
    // eContent [0] EXPLICIT OCTET STRING OPTIONAL (we include it here)
    BuilderSchema.constructed(
      "eContentWrap",
      { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
      [
        BuilderSchema.primitive("eContent", { tagClass: TagClass.Universal, tagNumber: 4 }, (buf: ArrayBuffer) => buf),
      ],
    ),
  ],
);

const SignerInfo_B = BuilderSchema.constructed(
  "signer",
  { tagClass: TagClass.Universal, tagNumber: 16 },
  [
    BuilderSchema.primitive("version", { tagClass: TagClass.Universal, tagNumber: 2 }, (n: number) => encodeInteger(n)),
    // sid: subjectKeyIdentifier [0] IMPLICIT OCTET STRING
    BuilderSchema.primitive("sid", { tagClass: TagClass.ContextSpecific, tagNumber: 0 }, (id: Uint8Array) => toArrayBuffer(id)),
    BuilderSchema.constructed(
      "digestAlgorithm",
      { tagClass: TagClass.Universal, tagNumber: 16 },
      [
        BuilderSchema.primitive("algorithm", { tagClass: TagClass.Universal, tagNumber: 6 }, (s: string) => encodeOID(s)),
        BuilderSchema.primitive("paramsNull", { tagClass: TagClass.Universal, tagNumber: 5 }, (_: null) => new ArrayBuffer(0)),
      ],
    ),
    BuilderSchema.constructed(
      "signatureAlgorithm",
      { tagClass: TagClass.Universal, tagNumber: 16 },
      [
        BuilderSchema.primitive("algorithm", { tagClass: TagClass.Universal, tagNumber: 6 }, (s: string) => encodeOID(s)),
        BuilderSchema.primitive("paramsNull", { tagClass: TagClass.Universal, tagNumber: 5 }, (_: null) => new ArrayBuffer(0)),
      ],
    ),
    BuilderSchema.primitive("signature", { tagClass: TagClass.Universal, tagNumber: 4 }, (sig: Uint8Array) => toArrayBuffer(sig)),
  ],
);

const SignedData_B = BuilderSchema.constructed(
  "signedData",
  { tagClass: TagClass.Universal, tagNumber: 16 },
  [
    BuilderSchema.primitive("version", { tagClass: TagClass.Universal, tagNumber: 2 }, (n: number) => encodeInteger(n)),
    // digestAlgorithms SEQUENCE OF AlgorithmIdentifier (demo-friendly; library also supports SET OF)
    BuilderSchema.repeated("digestAlgorithms", { tagClass: TagClass.Universal, tagNumber: 17 }, AlgorithmIdentifier_B),
    EncapsulatedContentInfo_B,
    // signerInfos SEQUENCE OF SignerInfo (demo-friendly; library also supports SET OF)
    BuilderSchema.repeated("signerInfos", { tagClass: TagClass.Universal, tagNumber: 17 }, SignerInfo_B),
  ],
);

// ContentInfo with content [0] EXPLICIT SignedData
const ContentInfo_SignedData_B = BuilderSchema.constructed(
  "contentInfo",
  { tagClass: TagClass.Universal, tagNumber: 16 },
  [
    BuilderSchema.primitive("contentType", { tagClass: TagClass.Universal, tagNumber: 6 }, (s: string) => encodeOID(s)),
    BuilderSchema.constructed("content", { tagClass: TagClass.ContextSpecific, tagNumber: 0 }, [SignedData_B]),
  ],
);

// -------------------- Parser Schemas --------------------

const AlgorithmIdentifier_P = ParserSchema.constructed(
  "alg",
  { tagClass: TagClass.Universal, tagNumber: 16 },
  [
    ParserSchema.primitive("algorithm", { tagClass: TagClass.Universal, tagNumber: 6 }, decodeOID),
    ParserSchema.primitive("paramsNull", { tagClass: TagClass.Universal, tagNumber: 5 }, (_: ArrayBuffer) => null),
  ],
);

const EncapsulatedContentInfo_P = ParserSchema.constructed(
  "encapContentInfo",
  { tagClass: TagClass.Universal, tagNumber: 16 },
  [
    ParserSchema.primitive("eContentType", { tagClass: TagClass.Universal, tagNumber: 6 }, decodeOID),
    ParserSchema.constructed(
      "eContentWrap",
      { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
      [
        ParserSchema.primitive("eContent", { tagClass: TagClass.Universal, tagNumber: 4 }, (buf: ArrayBuffer) => new Uint8Array(buf)),
      ],
    ),
  ],
);

const SignerInfo_P = ParserSchema.constructed(
  "signer",
  { tagClass: TagClass.Universal, tagNumber: 16 },
  [
    ParserSchema.primitive("version", { tagClass: TagClass.Universal, tagNumber: 2 }, decodeInteger),
    ParserSchema.primitive("sid", { tagClass: TagClass.ContextSpecific, tagNumber: 0 }, (buf: ArrayBuffer) => new Uint8Array(buf)),
    ParserSchema.constructed(
      "digestAlgorithm",
      { tagClass: TagClass.Universal, tagNumber: 16 },
      [
        ParserSchema.primitive("algorithm", { tagClass: TagClass.Universal, tagNumber: 6 }, decodeOID),
        ParserSchema.primitive("paramsNull", { tagClass: TagClass.Universal, tagNumber: 5 }, (_: ArrayBuffer) => null),
      ],
    ),
    ParserSchema.constructed(
      "signatureAlgorithm",
      { tagClass: TagClass.Universal, tagNumber: 16 },
      [
        ParserSchema.primitive("algorithm", { tagClass: TagClass.Universal, tagNumber: 6 }, decodeOID),
        ParserSchema.primitive("paramsNull", { tagClass: TagClass.Universal, tagNumber: 5 }, (_: ArrayBuffer) => null),
      ],
    ),
    ParserSchema.primitive("signature", { tagClass: TagClass.Universal, tagNumber: 4 }, (buf: ArrayBuffer) => new Uint8Array(buf)),
  ],
);

const SignedData_P = ParserSchema.constructed(
  "signedData",
  { tagClass: TagClass.Universal, tagNumber: 16 },
  [
    ParserSchema.primitive("version", { tagClass: TagClass.Universal, tagNumber: 2 }, decodeInteger),
    ParserSchema.repeated("digestAlgorithms", { tagClass: TagClass.Universal, tagNumber: 17 }, AlgorithmIdentifier_P),
    EncapsulatedContentInfo_P,
    ParserSchema.repeated("signerInfos", { tagClass: TagClass.Universal, tagNumber: 17 }, SignerInfo_P),
  ],
);

const ContentInfo_SignedData_P = ParserSchema.constructed(
  "contentInfo",
  { tagClass: TagClass.Universal, tagNumber: 16 },
  [
    ParserSchema.primitive("contentType", { tagClass: TagClass.Universal, tagNumber: 6 }, decodeOID),
    ParserSchema.constructed("content", { tagClass: TagClass.ContextSpecific, tagNumber: 0 }, [SignedData_P]),
  ],
);

// -------------------- Demo build and parse --------------------

export function buildContentInfoSignedDataDemo(): ArrayBuffer {
  const sid = new Uint8Array(20).fill(0xab);
  const contentBytes = new TextEncoder().encode("Hello CMS");

  // Data for SET OF DigestAlgorithmIdentifiers and SET OF SignerInfos
  const digestAlgorithmsData = [
    { algorithm: ALGO_OIDS.sha256, paramsNull: null as null },
  ];

  const signerInfosData = [
    {
      version: 3,
      sid,
      digestAlgorithm: { algorithm: ALGO_OIDS.sha256, paramsNull: null as null },
      signatureAlgorithm: { algorithm: ALGO_OIDS.rsaEncryption, paramsNull: null as null },
      signature: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    },
    {
      version: 3,
      sid: new Uint8Array(20).fill(0xcd),
      digestAlgorithm: { algorithm: ALGO_OIDS.sha256, paramsNull: null as null },
      signatureAlgorithm: { algorithm: ALGO_OIDS.rsaEncryption, paramsNull: null as null },
      signature: new Uint8Array([0xca, 0xfe, 0xba, 0xbe]),
    },
  ];

  // Canonical DER sorting for SET OF containers (RFC 5652 / DER)
  const algoBuilder = new SchemaBuilder(AlgorithmIdentifier_B);
  const signerInfoBuilder = new SchemaBuilder(SignerInfo_B);

  const compareDER = (a: Uint8Array, b: Uint8Array) => {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  };

  const digestAlgorithmsSorted = digestAlgorithmsData
    .map((d) => ({ d, der: new Uint8Array(algoBuilder.build(d)) }))
    .sort((x, y) => compareDER(x.der, y.der))
    .map((x) => x.d);

  const signerInfosSorted = signerInfosData
    .map((s) => ({ s, der: new Uint8Array(signerInfoBuilder.build(s)) }))
    .sort((x, y) => compareDER(x.der, y.der))
    .map((x) => x.s);

  const builder = new SchemaBuilder(ContentInfo_SignedData_B);
  const encoded = builder.build({
    contentType: CMS_OIDS.id_signedData,
    content: {
      signedData: {
        // MUST be 3 because we use subjectKeyIdentifier in SignerInfo (RFC 5652 Section 5.1)
        version: 3,
        digestAlgorithms: digestAlgorithmsSorted,
        encapContentInfo: {
          eContentType: CMS_OIDS.id_data,
          eContentWrap: {
            eContent: toArrayBuffer(contentBytes),
          },
        },
        signerInfos: signerInfosSorted,
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
