// tests/extreme-cov-improve.test.ts
import { describe, it, expect } from "vitest";
import assert from "assert";
import { Schema as PSchema, SchemaParser } from "../src/parser";
import { Schema as BSchema, SchemaBuilder } from "../src/builder";
import { TagClass } from "../src/common/types";
import { fromHexString } from "./utils";

describe("SchemaParser SEQUENCE additional branches", () => {
  it("optional constructed field is skipped when not matching, then required parsed", () => {
    const sch = PSchema.constructed(
      "seqOptC",
      { tagNumber: 16 },
      [
        PSchema.constructed(
          "optC",
          { optional: true, tagNumber: 0x10 },
          [
            PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
          ],
        ),
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
      ],
    );
    const parser = new SchemaParser(sch);
    const buf = fromHexString("3003020107");
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { id: 7 });
  });

  it("throws on unexpected extra child after consuming schema fields", () => {
    const sch = PSchema.constructed(
      "seqExtra",
      { tagNumber: 16 },
      [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
      ],
    );
    const parser = new SchemaParser(sch);
    const buf = fromHexString("30060201070c0161");
    assert.throws(() => parser.parse(buf));
  });
});

describe("SchemaParser SET additional branches", () => {
  it("throws when required repeated field (SET OF) is missing", () => {
    const sch = PSchema.constructed(
      "setMissingRep",
      { tagNumber: 17 },
      [
        PSchema.repeated("items", {}, PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0))),
      ],
    );
    const parser = new SchemaParser(sch);
    const buf = fromHexString("3100");
    assert.throws(() => parser.parse(buf));
  });

  it("throws when required non-repeated field is missing", () => {
    const sch = PSchema.constructed(
      "setMissingNR",
      { tagNumber: 17 },
      [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) => new DataView(ab).getUint8(0)),
      ],
    );
    const parser = new SchemaParser(sch);
    const buf = fromHexString("3100");
    assert.throws(() => parser.parse(buf));
  });
});

describe("SchemaBuilder additional branches", () => {
  it("repeated field expects an array (throws otherwise)", () => {
    const sch = BSchema.constructed(
      "seqRep",
      { tagNumber: 16 },
      [
        BSchema.repeated("items", {}, BSchema.primitive("n", { tagNumber: 0x02 }, (n: number) => new Uint8Array([n]).buffer)),
      ],
    );
    const builder = new SchemaBuilder(sch);
    assert.throws(() => builder.build({ items: 123 } as any));
  });

  it("BSchema.primitive requires tagNumber", () => {
    assert.throws(() => BSchema.primitive("raw", {} as any));
  });

  it("BSchema.inferIsSetFromTag mirrors UNIVERSAL semantics", () => {
    expect(BSchema.inferIsSetFromTag(TagClass.Universal, 17)).toBe(true);
    expect(BSchema.inferIsSetFromTag(TagClass.Universal, 16)).toBe(false);
    expect(BSchema.inferIsSetFromTag(TagClass.Private, 17)).toBe(undefined);
  });
});