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
} from "../../src/common/codecs";

// Common CMS and Algorithm OIDs
const CMS_OIDS = {
  id_data: "1.2.840.113549.1.7.1",
  id_signedData: "1.2.840.113549.1.7.2",
};

const ALGO_OIDS = {
  sha256: "2.16.840.1.101.3.4.2.1",
  rsaEncryption: "1.2.840.113549.1.1.1",
};

function builderSchemas() {
  // AlgorithmIdentifier ::= SEQUENCE { algorithm OBJECT IDENTIFIER, parameters ANY (NULL here) }
  const AlgorithmIdentifier = BuilderSchema.constructed("alg", {}, [
    BuilderSchema.primitive("algorithm", { tagNumber: 6 }, (s: string) =>
      encodeOID(s),
    ),
    BuilderSchema.primitive(
      "paramsNull",
      { tagNumber: 5 },
      (_: null) => new ArrayBuffer(0),
    ),
  ]);

  // DigestAlgorithmIdentifiers ::= SET OF DigestAlgorithmIdentifier
  const DigestAlgorithmIdentifiers = BuilderSchema.constructed(
    "digestAlgorithms",
    { isSet: true },
    [BuilderSchema.repeated("item", {}, AlgorithmIdentifier)],
  );

  // EncapsulatedContentInfo ::= SEQUENCE { eContentType ContentType, eContent [0] EXPLICIT OCTET STRING OPTIONAL }
  const EncapsulatedContentInfo = BuilderSchema.constructed(
    "encapContentInfo",
    {},
    [
      BuilderSchema.primitive("eContentType", { tagNumber: 6 }, (s: string) =>
        encodeOID(s),
      ),
      BuilderSchema.constructed(
        "eContentWrap",
        { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
        [
          BuilderSchema.primitive(
            "eContent",
            { tagNumber: 4 },
            (buf: ArrayBuffer) => buf,
          ),
        ],
      ),
    ],
  );

  // SignerInfo with sid = subjectKeyIdentifier [0] IMPLICIT OCTET STRING
  const SignerInfo = BuilderSchema.constructed("signer", {}, [
    BuilderSchema.primitive("version", { tagNumber: 2 }, (n: number) =>
      encodeInteger(n),
    ),
    BuilderSchema.primitive(
      "sid",
      { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
      (id: Uint8Array) => toArrayBuffer(id),
    ),
    BuilderSchema.constructed("digestAlgorithm", {}, [
      BuilderSchema.primitive("algorithm", { tagNumber: 6 }, (s: string) =>
        encodeOID(s),
      ),
      BuilderSchema.primitive(
        "paramsNull",
        { tagNumber: 5 },
        (_: null) => new ArrayBuffer(0),
      ),
    ]),
    BuilderSchema.constructed("signatureAlgorithm", {}, [
      BuilderSchema.primitive("algorithm", { tagNumber: 6 }, (s: string) =>
        encodeOID(s),
      ),
      BuilderSchema.primitive(
        "paramsNull",
        { tagNumber: 5 },
        (_: null) => new ArrayBuffer(0),
      ),
    ]),
    BuilderSchema.primitive("signature", { tagNumber: 4 }, (sig: Uint8Array) =>
      toArrayBuffer(sig),
    ),
  ]);

  // SignerInfos ::= SET OF SignerInfo
  const SignerInfos = BuilderSchema.constructed(
    "signerInfos",
    { isSet: true },
    [BuilderSchema.repeated("item", {}, SignerInfo)],
  );

  // SignedData ::= SEQUENCE { version, digestAlgorithms, encapContentInfo, signerInfos }
  const SignedData = BuilderSchema.constructed("signedData", {}, [
    BuilderSchema.primitive("version", { tagNumber: 2 }, (n: number) =>
      encodeInteger(n),
    ),
    DigestAlgorithmIdentifiers,
    EncapsulatedContentInfo,
    // certificates [0] IMPLICIT CertificateSet OPTIONAL (omitted)
    // crls [1] IMPLICIT RevocationInfoChoices OPTIONAL (omitted)
    SignerInfos,
  ]);

  // ContentInfo ::= SEQUENCE { contentType OBJECT IDENTIFIER, content [0] EXPLICIT SignedData }
  const ContentInfo_SignedData = BuilderSchema.constructed("contentInfo", {}, [
    BuilderSchema.primitive("contentType", { tagNumber: 6 }, (s: string) =>
      encodeOID(s),
    ),
    BuilderSchema.constructed(
      "content",
      { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
      [SignedData],
    ),
  ]);

  return {
    AlgorithmIdentifier,
    DigestAlgorithmIdentifiers,
    EncapsulatedContentInfo,
    SignerInfo,
    SignerInfos,
    SignedData,
    ContentInfo_SignedData,
  };
}

function parserSchemas() {
  const AlgorithmIdentifier = ParserSchema.constructed("alg", {}, [
    ParserSchema.primitive("algorithm", { tagNumber: 6 }, decodeOID),
    ParserSchema.primitive(
      "paramsNull",
      { tagNumber: 5 },
      (_: ArrayBuffer) => null,
    ),
  ]);

  const DigestAlgorithmIdentifiers = ParserSchema.constructed(
    "digestAlgorithms",
    { isSet: true },
    [ParserSchema.repeated("item", {}, AlgorithmIdentifier)],
  );

  const EncapsulatedContentInfo = ParserSchema.constructed(
    "encapContentInfo",
    {},
    [
      ParserSchema.primitive("eContentType", { tagNumber: 6 }, decodeOID),
      ParserSchema.constructed(
        "eContentWrap",
        { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
        [
          ParserSchema.primitive(
            "eContent",
            { tagNumber: 4 },
            (buf: ArrayBuffer) => new Uint8Array(buf),
          ),
        ],
      ),
    ],
  );

  const SignerInfo = ParserSchema.constructed("signer", {}, [
    ParserSchema.primitive("version", { tagNumber: 2 }, decodeInteger),
    ParserSchema.primitive(
      "sid",
      { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
      (buf: ArrayBuffer) => new Uint8Array(buf),
    ),
    ParserSchema.constructed("digestAlgorithm", {}, [
      ParserSchema.primitive("algorithm", { tagNumber: 6 }, decodeOID),
      ParserSchema.primitive(
        "paramsNull",
        { tagNumber: 5 },
        (_: ArrayBuffer) => null,
      ),
    ]),
    ParserSchema.constructed("signatureAlgorithm", {}, [
      ParserSchema.primitive("algorithm", { tagNumber: 6 }, decodeOID),
      ParserSchema.primitive(
        "paramsNull",
        { tagNumber: 5 },
        (_: ArrayBuffer) => null,
      ),
    ]),
    ParserSchema.primitive(
      "signature",
      { tagNumber: 4 },
      (buf: ArrayBuffer) => new Uint8Array(buf),
    ),
  ]);

  const SignerInfos = ParserSchema.constructed("signerInfos", { isSet: true }, [
    ParserSchema.repeated("item", {}, SignerInfo),
  ]);

  const SignedData = ParserSchema.constructed("signedData", {}, [
    ParserSchema.primitive("version", { tagNumber: 2 }, decodeInteger),
    DigestAlgorithmIdentifiers,
    EncapsulatedContentInfo,
    SignerInfos,
  ]);

  const ContentInfo_SignedData = ParserSchema.constructed("contentInfo", {}, [
    ParserSchema.primitive("contentType", { tagNumber: 6 }, decodeOID),
    ParserSchema.constructed(
      "content",
      { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
      [SignedData],
    ),
  ]);

  return {
    AlgorithmIdentifier,
    DigestAlgorithmIdentifiers,
    EncapsulatedContentInfo,
    SignerInfo,
    SignerInfos,
    SignedData,
    ContentInfo_SignedData,
  };
}

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
      digestAlgorithm: {
        algorithm: ALGO_OIDS.sha256,
        paramsNull: null as null,
      },
      signatureAlgorithm: {
        algorithm: ALGO_OIDS.rsaEncryption,
        paramsNull: null as null,
      },
      signature: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    },
    {
      version: 3,
      sid: new Uint8Array(20).fill(0xcd),
      digestAlgorithm: {
        algorithm: ALGO_OIDS.sha256,
        paramsNull: null as null,
      },
      signatureAlgorithm: {
        algorithm: ALGO_OIDS.rsaEncryption,
        paramsNull: null as null,
      },
      signature: new Uint8Array([0xca, 0xfe, 0xba, 0xbe]),
    },
  ];

  const B = builderSchemas();
  const builder = new SchemaBuilder(B.ContentInfo_SignedData);
  const encoded = builder.build({
    contentType: CMS_OIDS.id_signedData,
    content: {
      signedData: {
        // MUST be 3 because we use subjectKeyIdentifier in SignerInfo (RFC 5652 Section 5.1)
        version: 3,
        digestAlgorithms: { item: digestAlgorithmsData },
        encapContentInfo: {
          eContentType: CMS_OIDS.id_data,
          eContentWrap: {
            eContent: toArrayBuffer(contentBytes),
          },
        },
        signerInfos: { item: signerInfosData },
      },
    },
  });
  return encoded;
}

export function parseContentInfoSignedDataDemo(buffer: ArrayBuffer) {
  const P = parserSchemas();
  const parser = new SchemaParser(P.ContentInfo_SignedData);
  const parsed = parser.parse(buffer) as {
    contentType: string;
    content: {
      signedData: {
        version: number;
        digestAlgorithms: { item: { algorithm: string; paramsNull: null }[] };
        encapContentInfo: {
          eContentType: string;
          eContentWrap: { eContent: Uint8Array };
        };
        signerInfos: {
          item: {
            version: number;
            sid: Uint8Array;
            digestAlgorithm: { algorithm: string; paramsNull: null };
            signatureAlgorithm: { algorithm: string; paramsNull: null };
            signature: Uint8Array;
          }[];
        };
      };
    };
  };

  // Quick sanity extract
  const ct = parsed.contentType;
  const sd = parsed.content.signedData;
  const eContentType = sd.encapContentInfo.eContentType;
  const eContent = sd.encapContentInfo.eContentWrap.eContent;
  const signers = sd.signerInfos.item;
  const algOids = sd.digestAlgorithms.item.map((a) => a.algorithm);

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
