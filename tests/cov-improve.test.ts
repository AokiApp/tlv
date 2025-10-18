// tests/cov-improve.test.ts
import { describe, it, expect } from "vitest";
import assert from "assert";
import { Schema as PSchema, SchemaParser } from "../src/parser";
import { TagClass } from "../src/common/types";
import { fromHexString } from "./utils";

describe("SchemaParser primitive: trailing bytes strict gating", () => {
  it("strict=true: throws on trailing bytes", () => {
    const prim = PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0));
    const parser = new SchemaParser(prim, { strict: true });
    const buf = fromHexString("02010100");
    assert.throws(() => parser.parse(buf));
  });

  it("strict=false: allows trailing bytes and returns decoded value", () => {
    const prim = PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0));
    const parser = new SchemaParser(prim, { strict: false });
    const buf = fromHexString("02010100");
    const val = parser.parse(buf);
    assert.strictEqual(val, 1);
  });
});

describe("SchemaParser constructed: trailing bytes strict gating", () => {
  it("strict=true: throws on trailing bytes", () => {
    const sch = PSchema.constructed(
      "box",
      {},
      [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
      ],
    );
    const parser = new SchemaParser(sch, { strict: true });
    const buf = fromHexString("300302010700");
    assert.throws(() => parser.parse(buf));
  });

  it("strict=false: allows trailing bytes", () => {
    const sch = PSchema.constructed(
      "box",
      {},
      [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
      ],
    );
    const parser = new SchemaParser(sch, { strict: false });
    const buf = fromHexString("300302010700");
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { id: 7 });
  });
});

describe("Constructed with no fields yields empty object", () => {
  it("returns {}", () => {
    const sch = PSchema.constructed("empty", {}, []);
    const parser = new SchemaParser(sch);
    const buf = fromHexString("3000");
    const val = parser.parse(buf);
    assert.deepStrictEqual(val, {});
  });
});

describe("SET parsing: unknown child, canonical order, SET OF", () => {
  it("unknown child in SET throws", () => {
    const setSch = PSchema.constructed(
      "set1",
      { tagNumber: 17 }, // UNIVERSAL SET
      [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
      ],
    );
    const parser = new SchemaParser(setSch);
    const buf = fromHexString("31060201070c0161"); // id + unexpected UTF8String
    assert.throws(() => parser.parse(buf));
  });

  it("canonical order violation throws when strict=true", () => {
    const setSch = PSchema.constructed(
      "set2",
      { tagNumber: 17 },
      [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
        PSchema.primitive("name", { tagNumber: 0x0c }, (ab: ArrayBuffer) => new TextDecoder("utf-8").decode(ab)),
      ],
    );
    const parser = new SchemaParser(setSch, { strict: true });
    const buf = fromHexString("31060c0161020107"); // name then id (violates DER order)
    assert.throws(() => parser.parse(buf));
  });

  it("canonical order ignored when strict=false", () => {
    const setSch = PSchema.constructed(
      "set3",
      { tagNumber: 17 },
      [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
        PSchema.primitive("name", { tagNumber: 0x0c }, (ab: ArrayBuffer) => new TextDecoder("utf-8").decode(ab)),
      ],
    );
    const parser = new SchemaParser(setSch, { strict: false });
    const buf = fromHexString("31060c0161020107");
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { id: 7, name: "a" });
  });

  it("SET OF repeated items parses into array", () => {
    const setOf = PSchema.constructed(
      "setOf",
      { tagNumber: 17 },
      [
        PSchema.repeated("items", {}, PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0))),
      ],
    );
    const parser = new SchemaParser(setOf, { strict: true });
    const buf = fromHexString("3106020101020102"); // two INTEGERs
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { items: [1, 2] });
  });

  it("duplicate non-repeated field in SET triggers leftover child error", () => {
    const setSch = PSchema.constructed(
      "setDup",
      { tagNumber: 17 },
      [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
      ],
    );
    const parser = new SchemaParser(setSch, { strict: false });
    const buf = fromHexString("3106020107020102"); // two INTEGER children with same tag
    assert.throws(() => parser.parse(buf));
  });
});

describe("SEQUENCE parsing: optional skip and repeated consumption", () => {
  it("skips optional when tag does not match and continues", () => {
    const sch = PSchema.constructed(
      "seq1",
      { tagNumber: 16 },
      [
        PSchema.primitive("opt", { optional: true, tagNumber: 0x0c }, (ab: ArrayBuffer) => new TextDecoder().decode(ab)),
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
      ],
    );
    const parser = new SchemaParser(sch);
    const buf = fromHexString("3003020107"); // only id present
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { id: 7 });
  });

  it("repeated items consumed then tail field parsed", () => {
    const sch = PSchema.constructed(
      "seq2",
      { tagNumber: 16 },
      [
        PSchema.repeated("items", {}, PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0))),
        PSchema.primitive("tail", { tagNumber: 0x0c }, (ab: ArrayBuffer) => new TextDecoder().decode(ab)),
      ],
    );
    const parser = new SchemaParser(sch);
    const buf = fromHexString("30090201010201020c0161");
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { items: [1, 2], tail: "a" });
  });
});

describe("Top-level repeated schema guard", () => {
  it("throws for top-level repeated", () => {
    const rep = PSchema.repeated("items", {}, PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)));
    const parser = new SchemaParser(rep as any);
    const buf = fromHexString("020101");
    assert.throws(() => parser.parse(buf));
  });
});

describe("Schema.inferIsSetFromTag coverage", () => {
  it("returns expected values for Universal class (16->false, 17->true) and undefined otherwise", () => {
    expect(PSchema.inferIsSetFromTag(TagClass.Universal, 17)).toBe(true);
    expect(PSchema.inferIsSetFromTag(TagClass.Universal, 16)).toBe(false);
    expect(PSchema.inferIsSetFromTag(TagClass.Private, 17)).toBe(undefined);
  });
});