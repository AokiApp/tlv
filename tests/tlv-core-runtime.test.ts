// tests/coverage-combined.test.ts
import { describe, it } from "vitest";
import assert from "assert";
import {
  bufferToArrayBuffer,
  toHex as utilHex,
  toArrayBuffer,
  encodeUtf8,
  decodeUtf8,
  decodeAscii,
  decodeShiftJis,
  encodeInteger,
  decodeInteger,
  encodeOID,
  decodeOID,
  decodeBitStringHex,
  encodeBitString,
} from "../src/utils/codecs";
import {
  BasicTLVBuilder,
  SchemaBuilder,
  Schema as BSchema,
} from "../src/builder";
import { BasicTLVParser, SchemaParser, Schema as PSchema } from "../src/parser";
import { TagClass } from "../src/common/types";
import { fromHexString } from "./utils";

describe("utils/codecs: buffer and hex helpers", () => {
  it("bufferToArrayBuffer converts Buffer to ArrayBuffer", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02]);
    const ab = bufferToArrayBuffer(buf);
    const bytes = new Uint8Array(ab);
    assert.deepStrictEqual(Array.from(bytes), [0x00, 0x01, 0x02]);
  });

  it("toHex works with ArrayBuffer and Uint8Array", () => {
    const u8 = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const ab = toArrayBuffer(u8);
    assert.strictEqual(utilHex(ab), "deadbeef");
    assert.strictEqual(utilHex(u8), "deadbeef");
  });

  it("toArrayBuffer copies bytes", () => {
    const u8 = new Uint8Array([5, 6, 7]);
    const ab = toArrayBuffer(u8);
    assert.deepStrictEqual(Array.from(new Uint8Array(ab)), [5, 6, 7]);
  });
});

describe("utils/codecs: UTF-8, ASCII and Shift-JIS", () => {
  it("encodeUtf8/decodeUtf8 round-trip", () => {
    const s = "hello utf8";
    const ab = encodeUtf8(s);
    const dec = decodeUtf8(ab);
    assert.strictEqual(dec, s);
  });

  it("decodeAscii decodes ASCII bytes", () => {
    const bytes = new Uint8Array([0x41, 0x53, 0x43, 0x49, 0x49]); // 'ASCII'
    const ab = toArrayBuffer(bytes);
    assert.strictEqual(decodeAscii(ab), "ASCII");
  });

  it("decodeShiftJis decodes known Shift-JIS bytes", () => {
    // "日本語" in Shift-JIS: 0x93 0xFA 0x96 0x7B 0x8C 0xEA
    const bytes = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]);
    const ab = toArrayBuffer(bytes);
    const dec = decodeShiftJis(ab);
    assert.strictEqual(dec, "日本語");
  });
});

describe("utils/codecs: INTEGER encode/decode", () => {
  it("encodeInteger and decodeInteger basic cases", () => {
    let ab = encodeInteger(0);
    assert.deepStrictEqual(Array.from(new Uint8Array(ab)), [0x00]);
    assert.strictEqual(decodeInteger(ab), 0);

    ab = encodeInteger(127);
    assert.deepStrictEqual(Array.from(new Uint8Array(ab)), [0x7f]);
    assert.strictEqual(decodeInteger(ab), 127);

    ab = encodeInteger(128);
    assert.deepStrictEqual(Array.from(new Uint8Array(ab)), [0x00, 0x80]); // ensure positive sign
    assert.strictEqual(decodeInteger(ab), 128);

    ab = encodeInteger(65535);
    assert.strictEqual(decodeInteger(ab), 65535);

    assert.throws(() => encodeInteger(-1));
  });

  it("decodeInteger ignores leading zero", () => {
    const ab = new Uint8Array([0x00, 0x80]).buffer;
    assert.strictEqual(decodeInteger(ab), 128);
  });
});

describe("utils/codecs: OID encode/decode", () => {
  it("encodeOID and decodeOID round-trip common OID", () => {
    const oid = "1.2.840.113549";
    const ab = encodeOID(oid);
    const out = decodeOID(ab);
    assert.strictEqual(out, oid);
  });

  it("encodeOID edge arcs (2.x.y)", () => {
    const oid = "2.5.4.3";
    const ab = encodeOID(oid);
    const out = decodeOID(ab);
    assert.strictEqual(out, oid);
  });
});

describe("utils/codecs: BIT STRING encode/decode", () => {
  it("decodeBitStringHex interprets header and content hex", () => {
    const encoded = encodeBitString({
      unusedBits: 0,
      data: new Uint8Array([0xff, 0x00]),
    });
    const info = decodeBitStringHex(encoded);
    assert.strictEqual(info.unusedBits, 0);
    assert.strictEqual(info.hex, "ff00");
  });
});

describe("TLV long-form and high-tag-number coverage", () => {
  it("BasicTLVBuilder encodes long-form length (>=128) and parser reads it", () => {
    const value = new Uint8Array(130);
    for (let i = 0; i < value.length; i++) value[i] = i & 0xff;

    const tagHex = "c1";
    const lenHex = "8182";
    const valHex = Array.from(value)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const buf = fromHexString(tagHex + lenHex + valHex);

    const parsed = BasicTLVParser.parse(buf);
    assert.strictEqual(parsed.length, value.byteLength);
    assert.strictEqual(utilHex(parsed.value), utilHex(value));
  });

  it("BasicTLVParser throws on indefinite length (0x80)", () => {
    // Tag: Private class, primitive, tagNumber=0x01 => 0xC1
    const bad = new Uint8Array([0xc1, 0x80]).buffer;
    assert.throws(() => BasicTLVParser.parse(bad));
  });

  it("BasicTLVBuilder encodes high-tag-number and parser decodes it", () => {
    const buf = fromHexString("df81490100");
    const parsed = BasicTLVParser.parse(buf);
    assert.strictEqual(parsed.tag.tagNumber, 201);
    assert.strictEqual(parsed.tag.tagClass, TagClass.Private);
    assert.strictEqual(parsed.tag.constructed, false);
  });
});

describe("BasicTLVBuilder error branches", () => {
  it("throws when tagNumber is negative", () => {
    const badTLV = {
      tag: {
        tagClass: TagClass.Universal,
        constructed: false,
        tagNumber: -1 as any,
      },
      length: 0,
      value: new ArrayBuffer(0),
      endOffset: 0,
    };
    assert.throws(() => BasicTLVBuilder.build(badTLV));
  });

  it("throws when tagClass is invalid", () => {
    const badTLV = {
      tag: { tagClass: 99 as any, constructed: false, tagNumber: 1 },
      length: 0,
      value: new ArrayBuffer(0),
      endOffset: 0,
    };
    assert.throws(() => BasicTLVBuilder.build(badTLV));
  });
});

describe("SchemaBuilder with no encoder (ArrayBuffer/Uint8Array paths)", () => {
  it("accepts ArrayBuffer when no encoder is provided", () => {
    const rawSchema = BSchema.primitive("raw", undefined, {
      tagClass: TagClass.Universal,
      tagNumber: 5,
    });
    const builder = new SchemaBuilder(rawSchema);
    const data = new Uint8Array([0xaa, 0xbb]).buffer;
    const built = builder.build(data);

    const expectedHex = "0502aabb";
    assert.strictEqual(utilHex(built), expectedHex);
  });

  it("accepts Uint8Array and copies bytes when no encoder is provided", () => {
    const rawSchema = BSchema.primitive("raw", undefined, {
      tagClass: TagClass.Universal,
      tagNumber: 6,
    });
    const builder = new SchemaBuilder(rawSchema);
    const data = new Uint8Array([1, 2, 3]);
    const built = builder.build(data.buffer);

    const expectedHex = "0603010203";
    assert.strictEqual(utilHex(built), expectedHex);
  });
});

describe("SchemaBuilder encodeConstructed with nested constructed field", () => {
  it("encodes nested constructed inner container", () => {
    const schema = BSchema.constructed(
      "outer",
      [
        BSchema.constructed(
          "inner",
          [
            BSchema.primitive("x", (n: number) => new Uint8Array([n]).buffer, {
              tagClass: TagClass.Private,
              tagNumber: 0x11,
            }),
          ],
          { tagClass: TagClass.Private, tagNumber: 0x10 },
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x20 },
    );

    const builder = new SchemaBuilder(schema);
    const built = builder.build({ inner: { x: 5 } });

    const expectedHex = "ff2005f003d10105";
    assert.strictEqual(utilHex(built), expectedHex);
  });

  it("top-level repeated schema is not supported", () => {
    const rep = BSchema.repeated(
      "items",
      BSchema.primitive("n", (n: number) => new Uint8Array([n]).buffer, {
        tagClass: TagClass.Application,
        tagNumber: 0x42,
      }),
    );
    const builder = new SchemaBuilder(rep as any);
    assert.throws(() => builder.build([1, 2, 3] as any));
  });
});

describe("SchemaParser nested constructed and errors", () => {
  it("parses nested constructed inner container", () => {
    const parseSchema = PSchema.constructed(
      "outer",
      [
        PSchema.constructed(
          "inner",
          [
            PSchema.primitive(
              "x",
              (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
              { tagClass: TagClass.Private, tagNumber: 0x11 },
            ),
          ],
          { tagClass: TagClass.Private, tagNumber: 0x10 },
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x20 },
    );

    const outerTLV = fromHexString("ff2005f003d10105");

    const parsed = new SchemaParser(parseSchema).parse(outerTLV);
    assert.deepStrictEqual(parsed, { inner: { x: 5 } });
  });

  it("throws when primitive schema is missing tagNumber", () => {
    const prim = PSchema.primitive("raw", (buffer: ArrayBuffer) => buffer);
    const parser = new SchemaParser(prim);
    const tlv = fromHexString("0101aa");
    assert.throws(() => parser.parse(tlv));
  });

  it("throws when constructed schema (container) is missing tagNumber", () => {
    const constructed = PSchema.constructed("box", [
      PSchema.primitive(
        "x",
        (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
        { tagClass: TagClass.Private, tagNumber: 0x11 },
      ),
    ]);
    const parser = new SchemaParser(constructed);
    const container = fromHexString("f003d10101");
    assert.throws(() => parser.parse(container));
  });

  it("ContextSpecific mapping covered", () => {
    const tlv = fromHexString("8201aa");
    const parsed = BasicTLVParser.parse(tlv);
    assert.strictEqual(parsed.tag.tagClass, TagClass.ContextSpecific);
  });

  it("repeated constructed items produce array", () => {
    const schema = PSchema.constructed(
      "box",
      [
        PSchema.repeated(
          "items",
          PSchema.constructed(
            "item",
            [
              PSchema.primitive(
                "n",
                (ab: ArrayBuffer) => new DataView(ab).getUint8(0),
                { tagClass: TagClass.Private, tagNumber: 0x21 },
              ),
            ],
            { tagClass: TagClass.Private, tagNumber: 0x20 },
          ),
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x10 },
    );

    const makeItemHex = (n: number) => {
      // item ::= [PRIVATE CONSTRUCTED tag=0x20] length 0x04,
      //          child n ::= [PRIVATE PRIMITIVE tag=0x21] length 0x01, value
      const hexVal = n.toString(16).padStart(2, "0");
      return `ff2004df2101${hexVal}`;
    };

    const innerHex = makeItemHex(1) + makeItemHex(2);
    const container = fromHexString("f00e" + innerHex);

    const parsed = new SchemaParser(schema).parse(container);
    assert.deepStrictEqual(parsed, { items: [{ n: 1 }, { n: 2 }] });
  });

  it("strict unknown child throws", () => {
    const schema = PSchema.constructed(
      "rec",
      [
        PSchema.primitive(
          "id",
          (ab: ArrayBuffer) => new DataView(ab).getUint8(0),
          { tagClass: TagClass.Private, tagNumber: 0x11 },
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x10 },
    );

    const container = fromHexString("f004df6301ff");

    const parser = new SchemaParser(schema, { strict: true });
    assert.throws(() => parser.parse(container));
  });

  it("primitive strict mismatch on constructed tag throws", () => {
    const primSchema = PSchema.primitive(
      "n",
      (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
      { tagClass: TagClass.Private, tagNumber: 0x41 },
    );
    const constructedTLV = fromHexString("ff410109");
    const parser = new SchemaParser(primSchema, { strict: true });
    assert.throws(() => parser.parse(constructedTLV));
  });

  it("explicit decode-function path returns decoded value", () => {
    const primSchema = PSchema.primitive(
      "text",
      (buffer: ArrayBuffer) => new TextDecoder("utf-8").decode(buffer),
      { tagClass: TagClass.Application, tagNumber: 0x05 },
    );
    const tlv = fromHexString("45026f6b");
    const parsed = new SchemaParser(primSchema).parse(tlv);
    assert.strictEqual(parsed, "ok");
  });
});
