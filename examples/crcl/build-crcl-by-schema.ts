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
} from "../../src/utils/codecs.ts";

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
  return PSchema.constructed(
    "PKIMessage",
    [
      // header
      PSchema.constructed(
        "header",
        [
          PSchema.primitive("pvno", decodeInteger, { tagNumber: 2 }),
          PSchema.constructed(
            "sender",
            [PSchema.constructed("name", [], { tagNumber: 16 })],
            { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
          ),
          PSchema.constructed(
            "recipient",
            [PSchema.constructed("name", [], { tagNumber: 16 })],
            { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
          ),
        ],
        { tagNumber: 16 },
      ),

      // body [0]
      PSchema.constructed(
        "body",
        [
          // CertReqMessages
          PSchema.constructed(
            "certReq",
            [
              PSchema.repeated(
                "items",
                // CertReqMsg
                PSchema.constructed(
                  "certReqMsg",
                  [
                    // CertRequest
                    PSchema.constructed(
                      "certReq",
                      [
                        PSchema.primitive("certReqId", decodeInteger, { tagNumber: 2 }),

                        // CertTemplate
                        PSchema.constructed(
                          "certTemplate",
                          [
                            // subject [5] Name (SEQUENCE OF RDN where RDN is SET OF AttributeTypeAndValue)
                            PSchema.constructed(
                              "subject",
                              [
                                PSchema.constructed(
                                  "name",
                                  [
                                    PSchema.repeated(
                                      "rdns",
                                      PSchema.constructed(
                                        "rdn",
                                        [
                                          PSchema.constructed(
                                            "attribute",
                                            [
                                              PSchema.primitive("type", decodeOID, {
                                                tagNumber: 6,
                                              }),
                                              PSchema.primitive("value", decodeUtf8, {
                                                tagNumber: 12,
                                              }),
                                            ],
                                            { tagNumber: 16 },
                                          ),
                                        ],
                                        { tagNumber: 17, isSet: true },
                                      ),
                                    ),
                                  ],
                                  { tagNumber: 16 },
                                ),
                              ],
                              {
                                tagClass: TagClass.ContextSpecific,
                                tagNumber: 5,
                                optional: true,
                              },
                            ),

                            // publicKey [6] SubjectPublicKeyInfo
                            PSchema.constructed(
                              "publicKey",
                              [
                                PSchema.constructed(
                                  "algorithmIdentifier",
                                  [
                                    PSchema.primitive("algorithm", decodeOID, {
                                      tagNumber: 6,
                                    }),
                                    PSchema.primitive("parameters", decodeNull, {
                                      tagNumber: 5,
                                      optional: true,
                                    }),
                                  ],
                                  { tagNumber: 16 },
                                ),
                                PSchema.primitive("subjectPublicKey", decodeBitStringHex, {
                                  tagNumber: 3,
                                }),
                              ],
                              { tagClass: TagClass.ContextSpecific, tagNumber: 6 },
                            ),

                            // extensions [9]
                            PSchema.constructed(
                              "extensions",
                              [
                                PSchema.constructed(
                                  "registeredCorporationInfo",
                                  [
                                    PSchema.primitive("extnId", decodeOID, {
                                      tagNumber: 6,
                                    }),
                                    PSchema.primitive("extnValue", toHex, {
                                      tagNumber: 4,
                                    }),
                                  ],
                                  { tagNumber: 16 },
                                ),
                              ],
                              { tagClass: TagClass.ContextSpecific, tagNumber: 9 },
                            ),
                          ],
                          { tagNumber: 16 },
                        ),
                      ],
                      { tagNumber: 16 },
                    ),

                    // pop [1] POPOSigningKey
                    PSchema.constructed(
                      "pop",
                      [
                        PSchema.constructed(
                          "algorithmIdentifier",
                          [
                            PSchema.primitive("algorithm", decodeOID, {
                              tagNumber: 6,
                            }),
                            PSchema.primitive("parameters", decodeNull, {
                              tagNumber: 5,
                              optional: true,
                            }),
                          ],
                          { tagNumber: 16 },
                        ),
                        PSchema.primitive("signature", decodeBitStringHex, { tagNumber: 3 }),
                      ],
                      { tagClass: TagClass.ContextSpecific, tagNumber: 1 },
                    ),

                    // regInfo (optional)
                    PSchema.constructed(
                      "regInfo",
                      [
                        // suspensionSecretCode Attribute
                        PSchema.constructed(
                          "suspensionSecretCode",
                          [
                            PSchema.primitive("type", decodeOID, { tagNumber: 6 }),
                            // SuspensionSecretCode
                            PSchema.constructed(
                              "value",
                              [
                                PSchema.constructed(
                                  "hashAlg",
                                  [
                                    PSchema.primitive("algorithm", decodeOID, {
                                      tagNumber: 6,
                                    }),
                                    PSchema.primitive("parameters", decodeNull, {
                                      tagNumber: 5,
                                      optional: true,
                                    }),
                                  ],
                                  { tagNumber: 16, optional: true },
                                ),
                                PSchema.primitive("hashedSecretCode", toHex, {
                                  tagNumber: 4,
                                }),
                              ],
                              { tagNumber: 16 },
                            ),
                          ],
                          { tagNumber: 16 },
                        ),
                        // timeLimit Attribute
                        PSchema.constructed(
                          "timeLimit",
                          [
                            PSchema.primitive("type", decodeOID, { tagNumber: 6 }),
                            PSchema.primitive("value", decodeAscii, { tagNumber: 4 }),
                          ],
                          { tagNumber: 16 },
                        ),
                      ],
                      { tagNumber: 16, optional: true },
                    ),
                  ],
                  { tagNumber: 16 },
                ),
              ),
            ],
            { tagNumber: 16 },
          ),
        ],
        { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
      ),
    ],
    { tagNumber: 16 },
  );
}

function genBuildSchema() {
  // Inline, no intermediate variables; return only the top-level schema
  return BSchema.constructed(
    "PKIMessage",
    [
      // header
      BSchema.constructed(
        "header",
        [
          BSchema.primitive("pvno", encodeInteger, { tagNumber: 2 }),
          BSchema.constructed(
            "sender",
            [BSchema.constructed("name", [], { tagNumber: 16 })],
            { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
          ),
          BSchema.constructed(
            "recipient",
            [BSchema.constructed("name", [], { tagNumber: 16 })],
            { tagClass: TagClass.ContextSpecific, tagNumber: 4 },
          ),
        ],
        { tagNumber: 16 },
      ),

      // body [0]
      BSchema.constructed(
        "body",
        [
          // CertReqMessages
          BSchema.constructed(
            "certReq",
            [
              BSchema.repeated(
                "items",
                // CertReqMsg
                BSchema.constructed(
                  "certReqMsg",
                  [
                    // CertRequest
                    BSchema.constructed(
                      "certReq",
                      [
                        BSchema.primitive("certReqId", encodeInteger, { tagNumber: 2 }),

                        // CertTemplate
                        BSchema.constructed(
                          "certTemplate",
                          [
                            // subject [5] Name (SEQUENCE OF RDN where RDN is SET OF AttributeTypeAndValue)
                            BSchema.constructed(
                              "subject",
                              [
                                BSchema.constructed(
                                  "name",
                                  [
                                    BSchema.repeated(
                                      "rdns",
                                      BSchema.constructed(
                                        "rdn",
                                        [
                                          BSchema.constructed(
                                            "attribute",
                                            [
                                              BSchema.primitive("type", encodeOID, {
                                                tagNumber: 6,
                                              }),
                                              BSchema.primitive("value", encodeUtf8, {
                                                tagNumber: 12,
                                              }),
                                            ],
                                            { tagNumber: 16 },
                                          ),
                                        ],
                                        { tagNumber: 17, isSet: true },
                                      ),
                                    ),
                                  ],
                                  { tagNumber: 16 },
                                ),
                              ],
                              {
                                tagClass: TagClass.ContextSpecific,
                                tagNumber: 5,
                                optional: true,
                              },
                            ),

                            // publicKey [6] SubjectPublicKeyInfo
                            BSchema.constructed(
                              "publicKey",
                              [
                                BSchema.constructed(
                                  "algorithmIdentifier",
                                  [
                                    BSchema.primitive("algorithm", encodeOID, {
                                      tagNumber: 6,
                                    }),
                                    BSchema.primitive("parameters", encodeNull, {
                                      tagNumber: 5,
                                      optional: true,
                                    }),
                                  ],
                                  { tagNumber: 16 },
                                ),
                                BSchema.primitive(
                                  "subjectPublicKey",
                                  (v: { unusedBits: number; hex: string }) =>
                                    encodeBitString({
                                      unusedBits: v.unusedBits,
                                      data: hexToBytes(v.hex),
                                    }),
                                  { tagNumber: 3 },
                                ),
                              ],
                              { tagClass: TagClass.ContextSpecific, tagNumber: 6 },
                            ),

                            // extensions [9]
                            BSchema.constructed(
                              "extensions",
                              [
                                BSchema.constructed(
                                  "registeredCorporationInfo",
                                  [
                                    BSchema.primitive("extnId", encodeOID, {
                                      tagNumber: 6,
                                    }),
                                    BSchema.primitive(
                                      "extnValue",
                                      (hex: string) => u8ToArrayBuffer(hexToBytes(hex)),
                                      { tagNumber: 4 },
                                    ),
                                  ],
                                  { tagNumber: 16 },
                                ),
                              ],
                              { tagClass: TagClass.ContextSpecific, tagNumber: 9 },
                            ),
                          ],
                          { tagNumber: 16 },
                        ),
                      ],
                      { tagNumber: 16 },
                    ),

                    // pop [1] POPOSigningKey
                    BSchema.constructed(
                      "pop",
                      [
                        BSchema.constructed(
                          "algorithmIdentifier",
                          [
                            BSchema.primitive("algorithm", encodeOID, {
                              tagNumber: 6,
                            }),
                            BSchema.primitive("parameters", encodeNull, {
                              tagNumber: 5,
                              optional: true,
                            }),
                          ],
                          { tagNumber: 16 },
                        ),
                        BSchema.primitive(
                          "signature",
                          (v: { unusedBits: number; hex: string }) =>
                            encodeBitString({
                              unusedBits: v.unusedBits,
                              data: hexToBytes(v.hex),
                            }),
                          { tagNumber: 3 },
                        ),
                      ],
                      { tagClass: TagClass.ContextSpecific, tagNumber: 1 },
                    ),

                    // regInfo (optional)
                    BSchema.constructed(
                      "regInfo",
                      [
                        // suspensionSecretCode Attribute
                        BSchema.constructed(
                          "suspensionSecretCode",
                          [
                            BSchema.primitive("type", encodeOID, { tagNumber: 6 }),
                            // SuspensionSecretCode
                            BSchema.constructed(
                              "value",
                              [
                                BSchema.constructed(
                                  "hashAlg",
                                  [
                                    BSchema.primitive("algorithm", encodeOID, {
                                      tagNumber: 6,
                                    }),
                                    BSchema.primitive("parameters", encodeNull, {
                                      tagNumber: 5,
                                      optional: true,
                                    }),
                                  ],
                                  { tagNumber: 16, optional: true },
                                ),
                                BSchema.primitive(
                                  "hashedSecretCode",
                                  (hex: string) => u8ToArrayBuffer(hexToBytes(hex)),
                                  { tagNumber: 4 },
                                ),
                              ],
                              { tagNumber: 16 },
                            ),
                          ],
                          { tagNumber: 16 },
                        ),
                        // timeLimit Attribute
                        BSchema.constructed(
                          "timeLimit",
                          [
                            BSchema.primitive("type", encodeOID, { tagNumber: 6 }),
                            BSchema.primitive("value", encodeAscii, { tagNumber: 4 }),
                          ],
                          { tagNumber: 16 },
                        ),
                      ],
                      { tagNumber: 16, optional: true },
                    ),
                  ],
                  { tagNumber: 16 },
                ),
              ),
            ],
            { tagNumber: 16 },
          ),
        ],
        { tagClass: TagClass.ContextSpecific, tagNumber: 0 },
      ),
    ],
    { tagNumber: 16 },
  );
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