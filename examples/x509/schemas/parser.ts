import { Schema, TagClass } from "../../../src/parser/index.ts";
import {
  decodeOID,
  decodeInteger,
  decodeUtf8,
  decodeAscii,
  decodeBitStringHex,
  decodeBMPString,
  decodeBoolean,
  decodeNull,
  toHex,
} from "./common.ts";

function decodeExtnValue(buffer: ArrayBuffer) {
  return {
    hex: toHex(buffer),
  };
}

/**
 * X.509 Certificate parse schema (ASN.1 DER)
 * - OIDs decoded to dotted strings
 * - Times decoded to ASCII strings
 * - BIT STRING/OCTET STRING decoded to structured hex
 * - DirectoryString handled via optional alternatives (UTF8/Printable/IA5/BMP)
 *
 * No 'any' or 'as' used; the parsed object shape is compatible with the builder's BuildData.
 */
export function createParseSchema() {
  // Return top-level Certificate schema
  return Schema.constructed("certificate", { tagNumber: 16 }, [
    // tbsCertificate
    Schema.constructed("tbsCertificate", { tagNumber: 16 }, [
      // version [0] EXPLICIT Version DEFAULT v1
      Schema.constructed(
        "version",
        { tagClass: TagClass.ContextSpecific, tagNumber: 0, optional: true },
        [Schema.primitive("value", { tagNumber: 2 }, decodeInteger)],
      ),

      // serialNumber INTEGER (preserve raw bytes → hex for round-trip equality)
      Schema.primitive("serialNumber", { tagNumber: 2 }, toHex),

      // signature AlgorithmIdentifier
      Schema.constructed("signature", { tagNumber: 16 }, [
        Schema.primitive("algorithm", { tagNumber: 6 }, decodeOID),
        // parameters may be NULL or OBJECT IDENTIFIER (e.g., namedCurve for EC)
        Schema.primitive(
          "parametersNull",
          { tagNumber: 5, optional: true },
          decodeNull,
        ),
        Schema.primitive(
          "parametersOID",
          { tagNumber: 6, optional: true },
          decodeOID,
        ),
      ]),

      // issuer Name ::= SEQUENCE OF RDN; RDN ::= SET OF AttributeTypeAndValue
      Schema.constructed("issuer", { tagNumber: 16 }, [
        Schema.repeated(
          "rdns",
          {},
          Schema.constructed("rdn", { tagNumber: 17, isSet: true }, [
            Schema.constructed("attribute", { tagNumber: 16 }, [
              Schema.primitive("type", { tagNumber: 6 }, decodeOID),
              // DirectoryString alternatives (only one present)
              Schema.primitive(
                "valueUTF8",
                { tagNumber: 12, optional: true },
                decodeUtf8,
              ),
              Schema.primitive(
                "valuePrintable",
                { tagNumber: 19, optional: true },
                decodeAscii,
              ),
              Schema.primitive(
                "valueIA5",
                { tagNumber: 22, optional: true },
                decodeAscii,
              ),
              Schema.primitive(
                "valueBMP",
                { tagNumber: 30, optional: true },
                decodeBMPString,
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
          decodeAscii,
        ),
        Schema.primitive(
          "notBeforeGeneralized",
          { tagNumber: 24, optional: true },
          decodeAscii,
        ),
        Schema.primitive(
          "notAfterUTC",
          { tagNumber: 23, optional: true },
          decodeAscii,
        ),
        Schema.primitive(
          "notAfterGeneralized",
          { tagNumber: 24, optional: true },
          decodeAscii,
        ),
      ]),

      // subject Name
      Schema.constructed("subject", { tagNumber: 16 }, [
        Schema.repeated(
          "rdns",
          {},
          Schema.constructed("rdn", { tagNumber: 17, isSet: true }, [
            Schema.constructed("attribute", { tagNumber: 16 }, [
              Schema.primitive("type", { tagNumber: 6 }, decodeOID),
              Schema.primitive(
                "valueUTF8",
                { tagNumber: 12, optional: true },
                decodeUtf8,
              ),
              Schema.primitive(
                "valuePrintable",
                { tagNumber: 19, optional: true },
                decodeAscii,
              ),
              Schema.primitive(
                "valueIA5",
                { tagNumber: 22, optional: true },
                decodeAscii,
              ),
              Schema.primitive(
                "valueBMP",
                { tagNumber: 30, optional: true },
                decodeBMPString,
              ),
            ]),
          ]),
        ),
      ]),

      // subjectPublicKeyInfo SEQUENCE
      Schema.constructed("subjectPublicKeyInfo", { tagNumber: 16 }, [
        Schema.constructed("algorithm", { tagNumber: 16 }, [
          Schema.primitive("algorithm", { tagNumber: 6 }, decodeOID),
          // parameters may be NULL or OBJECT IDENTIFIER (e.g., namedCurve for EC)
          Schema.primitive(
            "parametersNull",
            { tagNumber: 5, optional: true },
            decodeNull,
          ),
          Schema.primitive(
            "parametersOID",
            { tagNumber: 6, optional: true },
            decodeOID,
          ),
        ]),
        Schema.primitive(
          "subjectPublicKey",
          { tagNumber: 3 },
          decodeBitStringHex,
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
                Schema.primitive("extnID", { tagNumber: 6 }, decodeOID),
                Schema.primitive(
                  "critical",
                  { tagNumber: 1, optional: true },
                  decodeBoolean,
                ),
                // OCTET STRING rendered to hex for readability
                Schema.primitive(
                  "extnValue",
                  { tagNumber: 4 },
                  decodeExtnValue,
                ),
              ]),
            ),
          ]),
        ],
      ),
    ]),

    // signatureAlgorithm AlgorithmIdentifier
    Schema.constructed("signatureAlgorithm", { tagNumber: 16 }, [
      Schema.primitive("algorithm", { tagNumber: 6 }, decodeOID),
      // parameters may be NULL or OBJECT IDENTIFIER
      Schema.primitive(
        "parametersNull",
        { tagNumber: 5, optional: true },
        decodeNull,
      ),
      Schema.primitive(
        "parametersOID",
        { tagNumber: 6, optional: true },
        decodeOID,
      ),
    ]),

    // signatureValue BIT STRING
    Schema.primitive("signatureValue", { tagNumber: 3 }, decodeBitStringHex),
  ]);
}
