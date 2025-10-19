// tests/unit/tlv/basic-tlv.test.ts
import { describe, it } from "vitest";
import assert from "assert";
import { BasicTLVParser } from "../../../src/parser";
import { TagClass } from "../../../src/common/types";
import { BasicTLVBuilder } from "../../../src/builder";
import { toHex } from "../../../src/common/codecs";
import { fromHexString } from "../../helpers/utils";

describe("BasicTLVParser: length and tag-number forms", () => {
  it("encodes long-form length (>=128) and parser reads it", () => {
    const value = new Uint8Array(130);
    for (let i = 0; i < value.length; i++) value[i] = i & 0xff;

    // Tag: Private class, primitive, tagNumber=0x01 => 0xC1
    // Length: long-form 0x8182 (length 0x82 = 130)
    const tagHex = "c1";
    const lenHex = "8182";
    const valHex = Array.from(value)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const buf = fromHexString(tagHex + lenHex + valHex);

    const parsed = BasicTLVParser.parse(buf);
    assert.strictEqual(parsed.length, value.byteLength);
    assert.strictEqual(toHex(parsed.value), toHex(value));
  });

  it("throws on indefinite length (0x80)", () => {
    // Tag: Private class, primitive, tagNumber=0x01 => 0xC1
    const bad = new Uint8Array([0xc1, 0x80]).buffer;
    assert.throws(() => BasicTLVParser.parse(bad));
  });

  it("parses high-tag-number form", () => {
    const buf = fromHexString("df81490100");
    const parsed = BasicTLVParser.parse(buf);
    assert.strictEqual(parsed.tag.tagNumber, 201);
    assert.strictEqual(parsed.tag.tagClass, TagClass.Private);
    assert.strictEqual(parsed.tag.constructed, false);
  });

  it("ContextSpecific tag class is recognized", () => {
    const tlv = fromHexString("8201aa");
    const parsed = BasicTLVParser.parse(tlv);
    assert.strictEqual(parsed.tag.tagClass, TagClass.ContextSpecific);
  });
});

describe("BasicTLVBuilder: validation and constraints", () => {
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