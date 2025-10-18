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
import {
  bufferToArrayBuffer,
  toHex,
  decodeUtf8,
  encodeUtf8,
  decodeAscii,
  decodeInteger,
  encodeInteger,
  decodeOID,
  encodeOID,
  decodeBitStringHex,
  encodeBitString,
} from "../../src/common/codecs.ts";

// Local helpers for codecs completeness
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) throw new Error("Invalid hex string length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
function encodeAscii(str: string): ArrayBuffer {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 0x7f) throw new Error("Non-ASCII character");
  }
  return new TextEncoder().encode(str).buffer;
}
function decodeNull(_buffer: ArrayBuffer): null {
  return null;
}
function encodeNull(_v: unknown): ArrayBuffer {
  return new Uint8Array(0).buffer;
}
// Ensure ArrayBuffer return type (not ArrayBufferLike) for builder encoders
function u8ToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.length);
  new Uint8Array(buf).set(u8);
  return buf;
}

function genParseSchema() {
  // Inline, no intermediate variables; return only the top-level schema
  return PSchema.constructed("PKIMessage", { tagNumber: 16 }, [
    // header
    PSchema.constructed("header", { tagNumber: 16 }, [
      PSchema.primitive("pvno", { tagNumber: 2 }, decodeInteger),
      PSchema.constructed(
        "sender",
        { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
        [PSchema.constructed("name", { tagNumber: 16 }, [])],
      ),
      PSchema.constructed(
        "recipient",
        { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
        [PSchema.constructed("name", { tagNumber: 16 }, [])],
      ),
    ]),

    // body [0]
    PSchema.constructed(
      "body",
      { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
      [
        // CertReqMessages
        PSchema.constructed("certReq", { tagNumber: 16 }, [
          PSchema.repeated(
            "items",
            {},
            // CertReqMsg
            PSchema.constructed("certReqMsg", { tagNumber: 16 }, [
              // CertRequest
              PSchema.constructed("certReq", { tagNumber: 16 }, [
                PSchema.primitive("certReqId", { tagNumber: 2 }, decodeInteger),

                // CertTemplate
                PSchema.constructed("certTemplate", { tagNumber: 16 }, [
                  // subject [5] Name (SEQUENCE OF RDN where RDN is SET OF AttributeTypeAndValue)
                  PSchema.constructed(
                    "subject",
                    {
                      tagClass: TagClass.ContextSpecific,
                      tagNumber: 5,
                      optional: true,
                    },
                    [
                      PSchema.constructed("name", { tagNumber: 16 }, [
                        PSchema.repeated(
                          "rdns",
                          {},
                          PSchema.constructed(
                            "rdn",
                            { tagNumber: 17, isSet: true },
                            [
                              PSchema.constructed(
                                "attribute",
                                { tagNumber: 16 },
                                [
                                  PSchema.primitive(
                                    "type",
                                    { tagNumber: 6 },
                                    decodeOID,
                                  ),
                                  PSchema.primitive(
                                    "value",
                                    { tagNumber: 12 },
                                    decodeUtf8,
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ]),
                    ],
                  ),

                  // publicKey [6] SubjectPublicKeyInfo
                  PSchema.constructed(
                    "publicKey",
                    { tagClass: TagClass.ContextSpecific, tagNumber: 6 },
                    [
                      PSchema.constructed(
                        "algorithmIdentifier",
                        { tagNumber: 16 },
                        [
                          PSchema.primitive(
                            "algorithm",
                            { tagNumber: 6 },
                            decodeOID,
                          ),
                          PSchema.primitive(
                            "parameters",
                            { tagNumber: 5, optional: true },
                            decodeNull,
                          ),
                        ],
                      ),
                      PSchema.primitive(
                        "subjectPublicKey",
                        { tagNumber: 3 },
                        decodeBitStringHex,
                      ),
                    ],
                  ),

                  // extensions [9]
                  PSchema.constructed(
                    "extensions",
                    { tagClass: TagClass.ContextSpecific, tagNumber: 9 },
                    [
                      PSchema.constructed(
                        "registeredCorporationInfo",
                        { tagNumber: 16 },
                        [
                          PSchema.primitive(
                            "extnId",
                            { tagNumber: 6 },
                            decodeOID,
                          ),
                          PSchema.primitive(
                            "extnValue",
                            { tagNumber: 4 },
                            toHex,
                          ),
                        ],
                      ),
                    ],
                  ),
                ]),
              ]),

              // pop [1] POPOSigningKey
              PSchema.constructed(
                "pop",
                { tagClass: TagClass.ContextSpecific, tagNumber: 1 },
                [
                  PSchema.constructed(
                    "algorithmIdentifier",
                    { tagNumber: 16 },
                    [
                      PSchema.primitive(
                        "algorithm",
                        { tagNumber: 6 },
                        decodeOID,
                      ),
                      PSchema.primitive(
                        "parameters",
                        { tagNumber: 5, optional: true },
                        decodeNull,
                      ),
                    ],
                  ),
                  PSchema.primitive(
                    "signature",
                    { tagNumber: 3 },
                    decodeBitStringHex,
                  ),
                ],
              ),

              // regInfo (optional)
              PSchema.constructed(
                "regInfo",
                { tagNumber: 16, optional: true },
                [
                  // suspensionSecretCode Attribute
                  PSchema.constructed(
                    "suspensionSecretCode",
                    { tagNumber: 16 },
                    [
                      PSchema.primitive("type", { tagNumber: 6 }, decodeOID),
                      // SuspensionSecretCode
                      PSchema.constructed("value", { tagNumber: 16 }, [
                        PSchema.constructed(
                          "hashAlg",
                          { tagNumber: 16, optional: true },
                          [
                            PSchema.primitive(
                              "algorithm",
                              { tagNumber: 6 },
                              decodeOID,
                            ),
                            PSchema.primitive(
                              "parameters",
                              { tagNumber: 5, optional: true },
                              decodeNull,
                            ),
                          ],
                        ),
                        PSchema.primitive(
                          "hashedSecretCode",
                          { tagNumber: 4 },
                          toHex,
                        ),
                      ]),
                    ],
                  ),
                  // timeLimit Attribute
                  PSchema.constructed("timeLimit", { tagNumber: 16 }, [
                    PSchema.primitive("type", { tagNumber: 6 }, decodeOID),
                    PSchema.primitive("value", { tagNumber: 4 }, decodeAscii),
                  ]),
                ],
              ),
            ]),
          ),
        ]),
      ],
    ),
  ]);
}

function genBuildSchema() {
  // Inline, no intermediate variables; return only the top-level schema
  return BSchema.constructed("PKIMessage", { tagNumber: 16 }, [
    // header
    BSchema.constructed("header", { tagNumber: 16 }, [
      BSchema.primitive("pvno", { tagNumber: 2 }, encodeInteger),
      BSchema.constructed(
        "sender",
        { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
        [BSchema.constructed("name", { tagNumber: 16 }, [])],
      ),
      BSchema.constructed(
        "recipient",
        { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
        [BSchema.constructed("name", { tagNumber: 16 }, [])],
      ),
    ]),

    // body [0]
    BSchema.constructed(
      "body",
      { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
      [
        // CertReqMessages
        BSchema.constructed("certReq", { tagNumber: 16 }, [
          BSchema.repeated(
            "items",
            {},
            // CertReqMsg
            BSchema.constructed("certReqMsg", { tagNumber: 16 }, [
              // CertRequest
              BSchema.constructed("certReq", { tagNumber: 16 }, [
                BSchema.primitive("certReqId", { tagNumber: 2 }, encodeInteger),

                // CertTemplate
                BSchema.constructed("certTemplate", { tagNumber: 16 }, [
                  // subject [5] Name (SEQUENCE OF RDN where RDN is SET OF AttributeTypeAndValue)
                  BSchema.constructed(
                    "subject",
                    {
                      tagClass: TagClass.ContextSpecific,
                      tagNumber: 5,
                      optional: true,
                    },
                    [
                      BSchema.constructed("name", { tagNumber: 16 }, [
                        BSchema.repeated(
                          "rdns",
                          {},
                          BSchema.constructed(
                            "rdn",
                            { tagNumber: 17, isSet: true },
                            [
                              BSchema.constructed(
                                "attribute",
                                { tagNumber: 16 },
                                [
                                  BSchema.primitive(
                                    "type",
                                    { tagNumber: 6 },
                                    encodeOID,
                                  ),
                                  BSchema.primitive(
                                    "value",
                                    { tagNumber: 12 },
                                    encodeUtf8,
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ]),
                    ],
                  ),

                  // publicKey [6] SubjectPublicKeyInfo
                  BSchema.constructed(
                    "publicKey",
                    { tagClass: TagClass.ContextSpecific, tagNumber: 6 },
                    [
                      BSchema.constructed(
                        "algorithmIdentifier",
                        { tagNumber: 16 },
                        [
                          BSchema.primitive(
                            "algorithm",
                            { tagNumber: 6 },
                            encodeOID,
                          ),
                          BSchema.primitive(
                            "parameters",
                            { tagNumber: 5, optional: true },
                            encodeNull,
                          ),
                        ],
                      ),
                      BSchema.primitive(
                        "subjectPublicKey",
                        { tagNumber: 3 },
                        (v: { unusedBits: number; hex: string }) =>
                          encodeBitString({
                            unusedBits: v.unusedBits,
                            data: hexToBytes(v.hex),
                          }),
                      ),
                    ],
                  ),

                  // extensions [9]
                  BSchema.constructed(
                    "extensions",
                    { tagClass: TagClass.ContextSpecific, tagNumber: 9 },
                    [
                      BSchema.constructed(
                        "registeredCorporationInfo",
                        { tagNumber: 16 },
                        [
                          BSchema.primitive(
                            "extnId",
                            { tagNumber: 6 },
                            encodeOID,
                          ),
                          BSchema.primitive(
                            "extnValue",
                            { tagNumber: 4 },
                            (hex: string) => u8ToArrayBuffer(hexToBytes(hex)),
                          ),
                        ],
                      ),
                    ],
                  ),
                ]),
              ]),

              // pop [1] POPOSigningKey
              BSchema.constructed(
                "pop",
                { tagClass: TagClass.ContextSpecific, tagNumber: 1 },
                [
                  BSchema.constructed(
                    "algorithmIdentifier",
                    { tagNumber: 16 },
                    [
                      BSchema.primitive(
                        "algorithm",
                        { tagNumber: 6 },
                        encodeOID,
                      ),
                      BSchema.primitive(
                        "parameters",
                        { tagNumber: 5, optional: true },
                        encodeNull,
                      ),
                    ],
                  ),
                  BSchema.primitive(
                    "signature",
                    { tagNumber: 3 },
                    (v: { unusedBits: number; hex: string }) =>
                      encodeBitString({
                        unusedBits: v.unusedBits,
                        data: hexToBytes(v.hex),
                      }),
                  ),
                ],
              ),

              // regInfo (optional)
              BSchema.constructed(
                "regInfo",
                { tagNumber: 16, optional: true },
                [
                  // suspensionSecretCode Attribute
                  BSchema.constructed(
                    "suspensionSecretCode",
                    { tagNumber: 16 },
                    [
                      BSchema.primitive("type", { tagNumber: 6 }, encodeOID),
                      // SuspensionSecretCode
                      BSchema.constructed("value", { tagNumber: 16 }, [
                        BSchema.constructed(
                          "hashAlg",
                          { tagNumber: 16, optional: true },
                          [
                            BSchema.primitive(
                              "algorithm",
                              { tagNumber: 6 },
                              encodeOID,
                            ),
                            BSchema.primitive(
                              "parameters",
                              { tagNumber: 5, optional: true },
                              encodeNull,
                            ),
                          ],
                        ),
                        BSchema.primitive(
                          "hashedSecretCode",
                          { tagNumber: 4 },
                          (hex: string) => u8ToArrayBuffer(hexToBytes(hex)),
                        ),
                      ]),
                    ],
                  ),
                  // timeLimit Attribute
                  BSchema.constructed("timeLimit", { tagNumber: 16 }, [
                    BSchema.primitive("type", { tagNumber: 6 }, encodeOID),
                    BSchema.primitive("value", { tagNumber: 4 }, encodeAscii),
                  ]),
                ],
              ),
            ]),
          ),
        ]),
      ],
    ),
  ]);
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const derPath = path.resolve(__dirname, "SHINSEI.der");

  const derBuf = await readFile(derPath);
  const der = bufferToArrayBuffer(derBuf);

  // Build layered schemas; return only top-level
  const parseTop = genParseSchema();
  const buildTop = genBuildSchema();

  // 1) Parse to raw primitives (ArrayBuffer) by schema
  const parser = new Parser(parseTop, { strict: true });
  const raw = parser.parse(der);

  // 2) Build back using the mirror builder schema
  const builder = new SchemaBuilder(buildTop, { strict: true });
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
