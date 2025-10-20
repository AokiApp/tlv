import { Schema, TagClass } from "../../../src/builder/index.ts";
import {
  encodeOID,
  encodeInteger,
  encodeUtf8,
  encodeAscii,
  encodeBMPString,
  encodeBitStringFromHex,
  encodeBoolean,
  encodeNull,
  hexToBytes,
  toArrayBuffer,
} from "./common.ts";

function encodeExtnValue(value: { hex: string }): ArrayBuffer {
  return toArrayBuffer(hexToBytes(value.hex));
}

/**
 * X.509 Certificate build schema (ASN.1 DER)
 * - OIDs encoded from dotted strings
 * - Times encoded from ASCII strings (UTCTime/GeneralizedTime)
 * - BIT STRING/OCTET STRING encoded from structured hex
 * - DirectoryString alternatives provided as optional fields (only one should be present)
 *
 * No 'any' or 'as' used; the build data shape matches the parse schema's result.
 */
export function createBuildSchema() {
  return Schema.constructed("certificate", { tagNumber: 16 }, [
    // tbsCertificate
    Schema.constructed("tbsCertificate", { tagNumber: 16 }, [
      // version [0] EXPLICIT Version DEFAULT v1
      Schema.constructed(
        "version",
        { tagClass: TagClass.ContextSpecific, tagNumber: 0, optional: true },
        [
          Schema.primitive("value", { tagNumber: 2 }, (n: number) =>
            encodeInteger(n),
          ),
        ],
      ),

      // serialNumber INTEGER (accept hex string or number; prefer preserving original bytes)
      Schema.primitive(
        "serialNumber",
        { tagNumber: 2 },
        (v: string | number) =>
          typeof v === "string"
            ? toArrayBuffer(hexToBytes(v))
            : encodeInteger(v),
      ),

      // signature AlgorithmIdentifier
      Schema.constructed("signature", { tagNumber: 16 }, [
        Schema.primitive("algorithm", { tagNumber: 6 }, (oid: string) =>
          encodeOID(oid),
        ),
        // parameters may be NULL or OBJECT IDENTIFIER (e.g., namedCurve for EC)
        Schema.primitive(
          "parametersNull",
          { tagNumber: 5, optional: true },
          (_: null) => encodeNull(null),
        ),
        Schema.primitive(
          "parametersOID",
          { tagNumber: 6, optional: true },
          (oid: string) => encodeOID(oid),
        ),
      ]),

      // issuer Name ::= SEQUENCE OF RDN; RDN ::= SET OF AttributeTypeAndValue
      Schema.constructed("issuer", { tagNumber: 16 }, [
        Schema.repeated(
          "rdns",
          {},
          Schema.constructed("rdn", { tagNumber: 17, isSet: true }, [
            Schema.constructed("attribute", { tagNumber: 16 }, [
              Schema.primitive("type", { tagNumber: 6 }, (oid: string) =>
                encodeOID(oid),
              ),
              // DirectoryString alternatives (only one present)
              Schema.primitive(
                "valueUTF8",
                { tagNumber: 12, optional: true },
                (s: string) => encodeUtf8(s),
              ),
              Schema.primitive(
                "valuePrintable",
                { tagNumber: 19, optional: true },
                (s: string) => encodeAscii(s),
              ),
              Schema.primitive(
                "valueIA5",
                { tagNumber: 22, optional: true },
                (s: string) => encodeAscii(s),
              ),
              Schema.primitive(
                "valueBMP",
                { tagNumber: 30, optional: true },
                (s: string) => encodeBMPString(s),
              ),
            ]),
          ]),
        ),
      ]),

      // validity SEQUENCE { notBefore, notAfter } with CHOICE (UTC/generalized)
      Schema.constructed("validity", { tagNumber: 16 }, [
        Schema.primitive(
          "notBeforeUTC",
          { tagNumber: 23, optional: true },
          (s: string) => encodeAscii(s),
        ),
        Schema.primitive(
          "notBeforeGeneralized",
          { tagNumber: 24, optional: true },
          (s: string) => encodeAscii(s),
        ),
        Schema.primitive(
          "notAfterUTC",
          { tagNumber: 23, optional: true },
          (s: string) => encodeAscii(s),
        ),
        Schema.primitive(
          "notAfterGeneralized",
          { tagNumber: 24, optional: true },
          (s: string) => encodeAscii(s),
        ),
      ]),

      // subject Name
      Schema.constructed("subject", { tagNumber: 16 }, [
        Schema.repeated(
          "rdns",
          {},
          Schema.constructed("rdn", { tagNumber: 17, isSet: true }, [
            Schema.constructed("attribute", { tagNumber: 16 }, [
              Schema.primitive("type", { tagNumber: 6 }, (oid: string) =>
                encodeOID(oid),
              ),
              Schema.primitive(
                "valueUTF8",
                { tagNumber: 12, optional: true },
                (s: string) => encodeUtf8(s),
              ),
              Schema.primitive(
                "valuePrintable",
                { tagNumber: 19, optional: true },
                (s: string) => encodeAscii(s),
              ),
              Schema.primitive(
                "valueIA5",
                { tagNumber: 22, optional: true },
                (s: string) => encodeAscii(s),
              ),
              Schema.primitive(
                "valueBMP",
                { tagNumber: 30, optional: true },
                (s: string) => encodeBMPString(s),
              ),
            ]),
          ]),
        ),
      ]),

      // subjectPublicKeyInfo SEQUENCE
      Schema.constructed("subjectPublicKeyInfo", { tagNumber: 16 }, [
        Schema.constructed("algorithm", { tagNumber: 16 }, [
          Schema.primitive("algorithm", { tagNumber: 6 }, (oid: string) =>
            encodeOID(oid),
          ),
          // parameters may be NULL or OBJECT IDENTIFIER (e.g., namedCurve for EC)
          Schema.primitive(
            "parametersNull",
            { tagNumber: 5, optional: true },
            (_: null) => encodeNull(null),
          ),
          Schema.primitive(
            "parametersOID",
            { tagNumber: 6, optional: true },
            (oid: string) => encodeOID(oid),
          ),
        ]),
        Schema.primitive(
          "subjectPublicKey",
          { tagNumber: 3 },
          (bits: { unusedBits: number; hex: string }) =>
            encodeBitStringFromHex(bits),
        ),
      ]),

      // extensions [3] EXPLICIT Extensions OPTIONAL
      Schema.constructed(
        "extensions",
        { tagClass: TagClass.ContextSpecific, tagNumber: 3, optional: true },
        [
          // Extensions ::= SEQUENCE OF Extension
          Schema.constructed("list", { tagNumber: 16 }, [
            Schema.repeated(
              "items",
              {},
              Schema.constructed("extension", { tagNumber: 16 }, [
                Schema.primitive("extnID", { tagNumber: 6 }, (oid: string) =>
                  encodeOID(oid),
                ),
                Schema.primitive(
                  "critical",
                  { tagNumber: 1, optional: true },
                  (b: boolean) => encodeBoolean(b),
                ),
                // OCTET STRING from hex
                Schema.primitive(
                  "extnValue",
                  { tagNumber: 4 },
                  encodeExtnValue,
                ),
              ]),
            ),
          ]),
        ],
      ),
    ]),

    // signatureAlgorithm AlgorithmIdentifier
    Schema.constructed("signatureAlgorithm", { tagNumber: 16 }, [
      Schema.primitive("algorithm", { tagNumber: 6 }, (oid: string) =>
        encodeOID(oid),
      ),
      // parameters may be NULL or OBJECT IDENTIFIER
      Schema.primitive(
        "parametersNull",
        { tagNumber: 5, optional: true },
        (_: null) => encodeNull(null),
      ),
      Schema.primitive(
        "parametersOID",
        { tagNumber: 6, optional: true },
        (oid: string) => encodeOID(oid),
      ),
    ]),

    // signatureValue BIT STRING
    Schema.primitive(
      "signatureValue",
      { tagNumber: 3 },
      (bits: { unusedBits: number; hex: string }) =>
        encodeBitStringFromHex(bits),
    ),
  ]);
}
