import { describe, expect, test } from "vitest";
import { SchemaBuilder, Schema, TagClass } from "../../src/builder";
import { Schema as ParserSchema, SchemaParser } from "../../src/parser";
import { Encoders } from "./test-helpers";

describe("Schema.sequenceOf() and Schema.setOf() - of-type encoding", () => {
  test("sequenceOf UTF8String roundtrip", () => {
    // Schema: SEQUENCE OF UTF8String
    const item = Schema.primitive<string, string>("item", Encoders.string, {
      tagClass: TagClass.Universal,
      tagNumber: 12, // UTF8String
    });
    const seqSchema = Schema.sequenceOf("items", item);

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
    const parseSeqSchema = ParserSchema.sequenceOf("items", parseItem);

    const sp = new SchemaParser(parseSeqSchema);
    const decoded = sp.parse(encoded);
    expect(decoded).toEqual(["alpha", "beta"]);
  });

  test("setOf UTF8String sorts elements by DER lexicographic order under strict mode", () => {
    // SET OF UTF8String
    const item = Schema.primitive<string, string>("item", Encoders.string, {
      tagClass: TagClass.Universal,
      tagNumber: 12, // UTF8String
    });
    const setSchema = Schema.setOf("items", item);

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
    const parseSetSchema = ParserSchema.setOf("items", parseItem);

    const sp = new SchemaParser(parseSetSchema, { strict: true });
    const decoded = sp.parse(encoded);

    // DER lexicographic order enforces ["beta","alpha"] (tag/length/value lexicographic on DER)
    expect(decoded).toEqual(["beta", "alpha"]);
  });
});
