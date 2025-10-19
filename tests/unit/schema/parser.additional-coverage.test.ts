// tests/unit/schema/parser.additional-coverage.test.ts
import { describe, it, expect } from "vitest";
import assert from "assert";
import { Schema as PSchema, SchemaParser } from "../../../src/parser";
import { fromHexString } from "../../helpers/utils";

describe("SEQUENCE: tail optional skip when content ends", () => {
  it("skips trailing optional field at end-of-content", () => {
    const sch = PSchema.constructed(
      "seqTail",
      { tagNumber: 16 },
      [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
        PSchema.primitive("opt", { optional: true, tagNumber: 0x0c }, (ab: ArrayBuffer) => new TextDecoder().decode(ab)),
      ],
    );
    const parser = new SchemaParser(sch, { strict: true });
    const buf = fromHexString("3003020107"); // only id present; optional at tail should be skipped
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { id: 7 });
  });
});

describe("SEQUENCE: constructed child matching and parsing", () => {
  it("parses constructed child in sequence", () => {
    const child = PSchema.constructed(
      "box",
      { tagNumber: 16 },
      [PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0))],
    );
    const sch = PSchema.constructed(
      "seqC",
      { tagNumber: 16 },
      [child],
    );
    // outer SEQUENCE(30) length 05, inner SEQUENCE(30) length 03, INTEGER(02) length 01 value 07
    const buf = fromHexString("30053003020107");
    const val = new SchemaParser(sch).parse(buf) as any;
    assert.deepStrictEqual(val, { box: { n: 7 } });
  });
});

describe("SEQUENCE: required constructed mismatch throws", () => {
  it("throws when required constructed field does not match", () => {
    const child = PSchema.constructed(
      "box",
      { tagNumber: 16 },
      [PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0))],
    );
    const sch = PSchema.constructed(
      "seqCReq",
      { tagNumber: 16 },
      [child],
    );
    const buf = fromHexString("3003020107"); // INTEGER only; missing constructed child
    const parser = new SchemaParser(sch, { strict: true });
    assert.throws(() => parser.parse(buf));
  });
});

describe("SET: optional non-repeated field missing is allowed", () => {
  it("returns {} when only optional non-repeated field is declared", () => {
    const sch = PSchema.constructed(
      "setOptMissing",
      { tagNumber: 17 }, // UNIVERSAL SET
      [PSchema.primitive("opt", { optional: true, tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0))],
    );
    const parser = new SchemaParser(sch, { strict: true });
    const buf = fromHexString("3100"); // empty set
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, {});
  });
});

describe("Depth guard: throws when exceeding maxDepth", () => {
  it("throws at nested constructed child when maxDepth is exceeded", () => {
    const child = PSchema.constructed(
      "box",
      { tagNumber: 16 },
      [PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0))],
    );
    const sch = PSchema.constructed(
      "outer",
      { tagNumber: 16 },
      [child],
    );
    // same nested encoding as above: outer SEQUENCE containing inner SEQUENCE(INTEGER)
    const buf = fromHexString("30053003020107");
    const parser = new SchemaParser(sch, { strict: true, maxDepth: 1 });
    assert.throws(() => parser.parse(buf));
  });
});

describe("Default decode: primitive returns raw buffer when no decode provided", () => {
  it("primitive without decode returns ArrayBuffer", () => {
    const prim = PSchema.primitive("octets", { tagNumber: 0x04 });
    const buf = fromHexString("04024869"); // OCTET STRING 'Hi'
    const parsed = new SchemaParser(prim).parse(buf);
    assert(parsed instanceof ArrayBuffer, "Expected ArrayBuffer for default decode");
    const s = new TextDecoder("utf-8").decode(parsed as ArrayBuffer);
    assert.strictEqual(s, "Hi");
  });
});