import { describe, expect, test } from "vitest";
import { SchemaBuilder, Schema, TagClass } from "../../src/builder";
import { Schema as ParserSchema, SchemaParser } from "../../src/parser";
import { Encoders } from "./test-helpers";

describe("Schema.repeated() - SEQUENCE/SET semantics via tagNumber", () => {
  test("repeated UTF8String defaults to SEQUENCE OF semantics", () => {
    const item = Schema.primitive<string, string>("item", Encoders.string, {
      tagClass: TagClass.Universal,
      tagNumber: 12, // UTF8String
    });
    const seqSchema = Schema.repeated("items", item);

    const builder = new SchemaBuilder(seqSchema);
    const encoded = builder.build(["alpha", "beta"]);

    // Expect Universal constructed SEQUENCE tag (0x30)
    const bytes = new Uint8Array(encoded);
    expect(bytes[0]).toBe(0x30);

    // Parser roundtrip
    const parseItem = ParserSchema.primitive(
      "item",
      (buffer: ArrayBuffer) => new TextDecoder().decode(buffer),
      {
        tagClass: TagClass.Universal,
        tagNumber: 12,
      },
    );
    const parseSeqSchema = ParserSchema.repeated("items", parseItem);

    const sp = new SchemaParser(parseSeqSchema);
    const decoded = sp.parse(encoded);
    expect(decoded).toEqual(["alpha", "beta"]);
  });

  test("repeated UTF8String with tagNumber 17 enforces DER SET OF sorting under strict mode", () => {
    const item = Schema.primitive<string, string>("item", Encoders.string, {
      tagClass: TagClass.Universal,
      tagNumber: 12, // UTF8String
    });
    const setSchema = Schema.repeated("items", item, { tagNumber: 17 });

    const builder = new SchemaBuilder(setSchema, { strict: true });
    const encoded = builder.build(["beta", "alpha"]);

    // Expect Universal constructed SET tag (0x31)
    const bytes = new Uint8Array(encoded);
    expect(bytes[0]).toBe(0x31);

    // Parse with parser Schema
    const parseItem = ParserSchema.primitive(
      "item",
      (buffer: ArrayBuffer) => new TextDecoder().decode(buffer),
      {
        tagClass: TagClass.Universal,
        tagNumber: 12,
      },
    );
    const parseSetSchema = ParserSchema.repeated("items", parseItem, {
      tagNumber: 17,
    });

    const sp = new SchemaParser(parseSetSchema, { strict: true });
    const decoded = sp.parse(encoded);

    // DER lexicographic order enforces ["beta","alpha"] (tag/length/value lexicographic on DER)
    expect(decoded).toEqual(["beta", "alpha"]);
  });
});
