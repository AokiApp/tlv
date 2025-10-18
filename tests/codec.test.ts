// tests/codec.test.ts
import { describe, it } from "vitest";
import assert from "assert";
import {
  encodeUtf8,
  decodeUtf8,
  decodeAscii,
  encodeOID,
  decodeOID,
  encodeBitString,
  decodeBitStringHex,
  toArrayBuffer,
  decodeInteger
} from "../src/common/codecs";

describe("Common codecs additional coverage", () => {
  it("decodeInteger returns 0 for empty buffer", () => {
    const ab = new ArrayBuffer(0);
    assert.strictEqual(decodeInteger(ab), 0);
  });

  it("encodeOID handles zero arc and round-trips '1.2.0'", () => {
    const oid = "1.2.0";
    const ab = encodeOID(oid);
    const out = decodeOID(ab);
    assert.strictEqual(out, oid);
  });

  it("decodeOID throws on empty buffer", () => {
    assert.throws(() => decodeOID(new ArrayBuffer(0)));
  });

  it("decodeOID throws on truncated base128 arc", () => {
    // 85 = 2*40 + 5 (first two arcs are 2 and 5)
    const truncated = new Uint8Array([85, 0x81]).buffer;
    assert.throws(() => decodeOID(truncated));
  });

  it("encodeBitString and decodeBitStringHex with non-zero unused bits", () => {
    const encoded = encodeBitString({
      unusedBits: 3,
      data: new Uint8Array([0xab, 0xcd]),
    });
    const info = decodeBitStringHex(encoded);
    assert.strictEqual(info.unusedBits, 3);
    assert.strictEqual(info.hex, "abcd");
  });

  it("encodeUtf8/decodeUtf8 round-trip with non-ASCII text", () => {
    const s = "こんにちは";
    const ab = encodeUtf8(s);
    const dec = decodeUtf8(ab);
    assert.strictEqual(dec, s);
  });

  it("decodeAscii decodes empty buffer to empty string", () => {
    const empty = toArrayBuffer(new Uint8Array([]));
    const decAsc = decodeAscii(empty);
    assert.strictEqual(decAsc, "");
  });
});

describe("Common codecs: drive remaining edge branches to 100% in codecs.ts", () => {
  it("encodeOID throws on invalid arc (non-numeric)", () => {
    // 'a' -> NaN should trigger invalid-arc guard
    assert.throws(() => encodeOID("1.a.3" as any));
  });

  it("encodeOID throws when fewer than two arcs are provided", () => {
    // Must have at least two arcs
    assert.throws(() => encodeOID("1"));
  });

  it("decodeBitStringHex handles empty buffer (unusedBits=0, hex='')", () => {
    const info = decodeBitStringHex(new ArrayBuffer(0));
    assert.strictEqual(info.unusedBits, 0);
    assert.strictEqual(info.hex, "");
  });
});