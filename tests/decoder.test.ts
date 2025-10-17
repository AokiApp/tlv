// tests/decoder.test.ts
import { describe, it } from "vitest";
import assert from "assert";
import { Schema as PSchema, SchemaParser } from "../src/parser";
import { TagClass } from "../src/common/types";
import { fromHexString } from "./utils";

describe("Decoder: SchemaParser.parse() parses hex to expected object and handles failures", () => {
  it("primitive: parse from hex string equals expected value", () => {
    // Private class (11xxxxxx), primitive, tagNumber=0x01 => first byte 0xc1
    // Hex layout: c1 02 01 02
    const hex = "c1020102";

    const flagSchema = PSchema.primitive(
      "flag",
      (buffer: ArrayBuffer) => new Uint8Array(buffer),
      { tagClass: TagClass.Private, tagNumber: 0x01 },
    );

    const parser = new SchemaParser(flagSchema, { strict: true });
    const parsed = parser.parse(fromHexString(hex));
    assert.deepStrictEqual(Array.from(parsed), [0x01, 0x02]);
  });

  it("constructed: parse from hex string equals expected object", () => {
    const personSchema = PSchema.constructed(
      "person",
      [
        PSchema.primitive(
          "id",
          (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
          { tagClass: TagClass.Private, tagNumber: 0x10 },
        ),
        PSchema.primitive(
          "name",
          (buffer: ArrayBuffer) => new TextDecoder("utf-8").decode(buffer),
          { tagClass: TagClass.Private, tagNumber: 0x11 },
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x20 },
    );

    // Parse from direct hex literal (Private constructed tag 0x20 with high-tag-number)
    const hex = "ff200ad00107d105616c696365";
    const parsed = new SchemaParser(personSchema).parse(fromHexString(hex));
    assert.deepStrictEqual(parsed, { id: 7, name: "alice" });
  });

  it("strict mode: tag mismatch throws on parse", () => {
    const boxSchema = PSchema.constructed(
      "box",
      [
        PSchema.primitive(
          "id",
          (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
          { tagClass: TagClass.Private, tagNumber: 0x31 },
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x30 },
    );

    const hex = "ff3203f10107";
    const parser = new SchemaParser(boxSchema, { strict: true });
    assert.throws(() => parser.parse(fromHexString(hex)));
  });

  it("strict mode: missing required child throws", () => {
    const recSchema = PSchema.constructed(
      "rec",
      [
        PSchema.primitive(
          "id",
          (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
          { tagClass: TagClass.Private, tagNumber: 0x10 },
        ),
        PSchema.primitive(
          "name",
          (buffer: ArrayBuffer) => new TextDecoder().decode(buffer),
          { tagClass: TagClass.Private, tagNumber: 0x11 },
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x20 },
    );

    // Only include id child; omit required 'name'
    const hex = "ff2003d00109";
    const parser = new SchemaParser(recSchema, { strict: true });
    assert.throws(() => parser.parse(fromHexString(hex)));
  });
});
