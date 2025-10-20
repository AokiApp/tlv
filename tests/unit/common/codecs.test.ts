// tests/unit/common/codecs.test.ts
import { describe, it } from "vitest";
import assert from "assert";
import {
  bufferToArrayBuffer,
  toHex,
  toArrayBuffer,
  encodeUtf8,
  decodeUtf8,
  decodeShiftJis,
  decodeAscii,
  encodeInteger,
  decodeInteger,
  encodeOID,
  decodeOID,
  decodeBitStringHex,
  encodeBitString,
} from "../../../src/common/codecs";

describe("codecs: buffer and hex helpers", () => {
  it("bufferToArrayBuffer converts Buffer to ArrayBuffer", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02]);
    const ab = bufferToArrayBuffer(buf);
    const bytes = new Uint8Array(ab);
    assert.deepStrictEqual(Array.from(bytes), [0x00, 0x01, 0x02]);
  });

  it("toHex works with ArrayBuffer and Uint8Array", () => {
    const u8 = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const ab = toArrayBuffer(u8);
    assert.strictEqual(toHex(ab), "deadbeef");
    assert.strictEqual(toHex(u8), "deadbeef");
  });

  it("toArrayBuffer copies bytes", () => {
    const u8 = new Uint8Array([5, 6, 7]);
    const ab = toArrayBuffer(u8);
    assert.deepStrictEqual(Array.from(new Uint8Array(ab)), [5, 6, 7]);
  });
});

describe("codecs: UTF-8, ASCII, Shift-JIS", () => {
  it("encodeUtf8/decodeUtf8 round-trip (ASCII)", () => {
    const s = "hello utf8";
    const ab = encodeUtf8(s);
    const dec = decodeUtf8(ab);
    assert.strictEqual(dec, s);
  });

  it("encodeUtf8/decodeUtf8 round-trip (non-ASCII)", () => {
    const s = "こんにちは";
    const ab = encodeUtf8(s);
    const dec = decodeUtf8(ab);
    assert.strictEqual(dec, s);
  });

  it("decodeAscii decodes ASCII bytes", () => {
    const bytes = new Uint8Array([0x41, 0x53, 0x43, 0x49, 0x49]); // 'ASCII'
    const ab = toArrayBuffer(bytes);
    assert.strictEqual(decodeAscii(ab), "ASCII");
  });

  it("decodeAscii decodes empty buffer to empty string", () => {
    const empty = toArrayBuffer(new Uint8Array([]));
    const decAsc = decodeAscii(empty);
    assert.strictEqual(decAsc, "");
  });

  it("decodeShiftJis decodes known Shift-JIS bytes", () => {
    // "日本語" in Shift-JIS: 0x93 0xFA 0x96 0x7B 0x8C 0xEA
    const bytes = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]);
    const ab = toArrayBuffer(bytes);
    const dec = decodeShiftJis(ab);
    assert.strictEqual(dec, "日本語");
  });
});

describe("codecs: INTEGER encode/decode", () => {
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

  it("decodeInteger returns 0 for empty buffer", () => {
    const ab = new ArrayBuffer(0);
    assert.strictEqual(decodeInteger(ab), 0);
  });
});

describe("codecs: OID encode/decode", () => {
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

  it("encodeOID handles zero arc and round-trips '1.2.0'", () => {
    const oid = "1.2.0";
    const ab = encodeOID(oid);
    const out = decodeOID(ab);
    assert.strictEqual(out, oid);
  });

  it("encodeOID throws on invalid arc (non-numeric)", () => {
    // 'a' -> NaN should trigger invalid-arc guard
    assert.throws(() => encodeOID("1.a.3" as any));
  });

  it("encodeOID throws when fewer than two arcs are provided", () => {
    // Must have at least two arcs
    assert.throws(() => encodeOID("1"));
  });

  it("decodeOID throws on empty buffer", () => {
    assert.throws(() => decodeOID(new ArrayBuffer(0)));
  });

  it("decodeOID throws on truncated base128 arc", () => {
    // 85 = 2*40 + 5 (first two arcs are 2 and 5), then continuation without termination
    const truncated = new Uint8Array([85, 0x81]).buffer;
    assert.throws(() => decodeOID(truncated));
  });
});

describe("codecs: BIT STRING encode/decode", () => {
  it("decodeBitStringHex interprets header and content hex", () => {
    const encoded = encodeBitString({
      unusedBits: 0,
      data: new Uint8Array([0xff, 0x00]),
    });
    const info = decodeBitStringHex(encoded);
    assert.strictEqual(info.unusedBits, 0);
    assert.strictEqual(info.hex, "ff00");
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

  it("decodeBitStringHex handles empty buffer (unusedBits=0, hex='')", () => {
    const info = decodeBitStringHex(new ArrayBuffer(0));
    assert.strictEqual(info.unusedBits, 0);
    assert.strictEqual(info.hex, "");
  });
});
