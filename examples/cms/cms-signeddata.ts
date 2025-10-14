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
  encodeUtf8,
  decodeUtf8,
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

const AttributeTypeAndValue_B = BuilderSchema.constructed(
  "attribute",
  [
    BuilderSchema.primitive("type", (oid: string) => encodeOID(oid), {
      tagClass: TagClass.Universal,
      tagNumber: 6,
    }),
    BuilderSchema.primitive("value", (text: string) => encodeUtf8(text), {
      tagClass: TagClass.Universal,
      tagNumber: 12,
    }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const RelativeDistinguishedName_B = BuilderSchema.repeated(
  "attributes",
  AttributeTypeAndValue_B,
  { tagClass: TagClass.Universal, tagNumber: 17 },
);

const Name_B = BuilderSchema.repeated(
  "issuer",
  RelativeDistinguishedName_B,
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

// -------------------- Builder Schemas --------------------

const AlgorithmIdentifier_B = BuilderSchema.constructed(
  "alg",
  [
    BuilderSchema.primitive("algorithm", (s: string) => encodeOID(s), {
      tagClass: TagClass.Universal,
      tagNumber: 6,
    }),
    // Include NULL parameters explicitly (commonly used for rsaEncryption)
    BuilderSchema.primitive(
      "paramsNull",
      (_: null) => new ArrayBuffer(0),
      {
        tagClass: TagClass.Universal,
        tagNumber: 5,
        optional: true,
      },
    ),
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
      { tagClass: TagClass.ContextSpecific, tagNumber: 0, optional: true },
    ),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const IssuerAndSerialNumber_B = BuilderSchema.constructed(
  "issuerAndSerialNumber",
  [
    Name_B,
    BuilderSchema.primitive("serialNumber", (n: number) => encodeInteger(n), {
      tagClass: TagClass.Universal,
      tagNumber: 2,
    }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const SubjectKeyIdentifier_B = BuilderSchema.primitive(
  "subjectKeyIdentifier",
  (id: Uint8Array) => toArrayBuffer(id),
  {
    tagClass: TagClass.ContextSpecific,
    tagNumber: 0,
  },
);

const SignerIdentifier_B = BuilderSchema.choice("sid", [
  {
    name: "issuerAndSerialNumber",
    schema: IssuerAndSerialNumber_B,
  },
  {
    name: "subjectKeyIdentifier",
    schema: SubjectKeyIdentifier_B,
  },
]);

const SignerInfo_B = BuilderSchema.constructed(
  "signer",
  [
    BuilderSchema.primitive("version", (n: number) => encodeInteger(n), {
      tagClass: TagClass.Universal,
      tagNumber: 2,
    }),
    SignerIdentifier_B,
    BuilderSchema.constructed(
      "digestAlgorithm",
      [
        BuilderSchema.primitive("algorithm", (s: string) => encodeOID(s), {
          tagClass: TagClass.Universal,
          tagNumber: 6,
        }),
        BuilderSchema.primitive(
          "paramsNull",
          (_: null) => new ArrayBuffer(0),
          {
            tagClass: TagClass.Universal,
            tagNumber: 5,
            optional: true,
          },
        ),
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
        BuilderSchema.primitive(
          "paramsNull",
          (_: null) => new ArrayBuffer(0),
          {
            tagClass: TagClass.Universal,
            tagNumber: 5,
            optional: true,
          },
        ),
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
    BuilderSchema.repeated("digestAlgorithms", AlgorithmIdentifier_B, {
      tagClass: TagClass.Universal,
      tagNumber: 17,
    }),
    EncapsulatedContentInfo_B,
    BuilderSchema.repeated("signerInfos", SignerInfo_B, {
      tagClass: TagClass.Universal,
      tagNumber: 17,
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

const AttributeTypeAndValue_P = ParserSchema.constructed(
  "attribute",
  [
    ParserSchema.primitive("type", decodeOID, {
      tagClass: TagClass.Universal,
      tagNumber: 6,
    }),
    ParserSchema.primitive("value", decodeUtf8, {
      tagClass: TagClass.Universal,
      tagNumber: 12,
    }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const RelativeDistinguishedName_P = ParserSchema.repeated(
  "attributes",
  AttributeTypeAndValue_P,
  { tagClass: TagClass.Universal, tagNumber: 17 },
);

const Name_P = ParserSchema.repeated(
  "issuer",
  RelativeDistinguishedName_P,
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

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
      optional: true,
      defaultValue: null,
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
      { tagClass: TagClass.ContextSpecific, tagNumber: 0, optional: true },
    ),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const IssuerAndSerialNumber_P = ParserSchema.constructed(
  "issuerAndSerialNumber",
  [
    Name_P,
    ParserSchema.primitive("serialNumber", decodeInteger, {
      tagClass: TagClass.Universal,
      tagNumber: 2,
    }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 16 },
);

const SubjectKeyIdentifier_P = ParserSchema.primitive(
  "subjectKeyIdentifier",
  (buf: ArrayBuffer) => new Uint8Array(buf),
  {
    tagClass: TagClass.ContextSpecific,
    tagNumber: 0,
  },
);

const SignerIdentifier_P = ParserSchema.choice("sid", [
  {
    name: "issuerAndSerialNumber",
    schema: IssuerAndSerialNumber_P,
  },
  {
    name: "subjectKeyIdentifier",
    schema: SubjectKeyIdentifier_P,
  },
]);

const SignerInfo_P = ParserSchema.constructed(
  "signer",
  [
    ParserSchema.primitive("version", decodeInteger, {
      tagClass: TagClass.Universal,
      tagNumber: 2,
    }),
    SignerIdentifier_P,
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
          optional: true,
          defaultValue: null,
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
          optional: true,
          defaultValue: null,
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
    ParserSchema.repeated("digestAlgorithms", AlgorithmIdentifier_P, {
      tagClass: TagClass.Universal,
      tagNumber: 17,
    }),
    EncapsulatedContentInfo_P,
    ParserSchema.repeated("signerInfos", SignerInfo_P, {
      tagClass: TagClass.Universal,
      tagNumber: 17,
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
  const subjectKeyId = new Uint8Array(20).fill(0xab);
  const contentBytes = new TextEncoder().encode("Hello CMS");
  const issuerRdns = [
    [
      {
        type: "2.5.4.3",
        value: "Demo CA",
      },
    ],
  ];

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
            sid: {
              type: "subjectKeyIdentifier",
              value: subjectKeyId,
            },
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
            version: 1,
            sid: {
              type: "issuerAndSerialNumber",
              value: {
                issuer: issuerRdns,
                serialNumber: 1,
              },
            },
            digestAlgorithm: {
              algorithm: ALGO_OIDS.sha256,
            },
            signatureAlgorithm: {
              algorithm: ALGO_OIDS.rsaEncryption,
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
        digestAlgorithms: { algorithm: string; paramsNull?: null }[];
        encapContentInfo: {
          eContentType: string;
          eContentWrap?: { eContent: Uint8Array };
        };
        signerInfos: {
          version: number;
          sid:
            | { type: "subjectKeyIdentifier"; value: Uint8Array }
            | {
                type: "issuerAndSerialNumber";
                value: {
                  issuer: Array<Array<{ type: string; value: string }>>;
                  serialNumber: number;
                };
              };
          digestAlgorithm: { algorithm: string; paramsNull?: null };
          signatureAlgorithm: { algorithm: string; paramsNull?: null };
          signature: Uint8Array;
        }[];
      };
    };
  };

  // Quick sanity extract
  const ct = parsed.contentType;
  const sd = parsed.content.signedData;
  const eContentType = sd.encapContentInfo.eContentType;
  const eContent = sd.encapContentInfo.eContentWrap?.eContent ?? null;
  const signers = sd.signerInfos;
  const algOids = sd.digestAlgorithms.map((a) => a.algorithm);
  const signerSummaries = signers.map((s) => {
    if (s.sid.type === "subjectKeyIdentifier") {
      return {
        type: s.sid.type,
        valueLength: s.sid.value.length,
      };
    }
    const issuerCommonNames = s.sid.value.issuer.flatMap((rdn) =>
      rdn
        .filter((attr) => attr.type === "2.5.4.3")
        .map((attr) => attr.value),
    );
    return {
      type: s.sid.type,
      serialNumber: s.sid.value.serialNumber,
      issuerCommonNames,
    };
  });
  return {
    contentTypeOID: ct,
    signedDataVersion: sd.version,
    digestAlgorithmOIDs: algOids,
    eContentTypeOID: eContentType,
    eContentBytes: eContent ? Array.from(eContent) : null,
    signerVersions: signers.map((s) => s.version),
    signerDetails: signerSummaries,
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
