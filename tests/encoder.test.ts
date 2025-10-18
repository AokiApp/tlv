// tests/encoder.test.ts
import { describe, it } from "vitest";
import assert from "assert";
import { Schema as BSchema, SchemaBuilder } from "../src/builder";
import { TagClass } from "../src/common/types";

function toHex(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("hex");
}


describe("Encoder: SchemaBuilder.build() produces expected hex and handles failures", () => {
  it("primitive: build encodes to expected hex string", () => {
    const flagSchema = BSchema.primitive(
      "flag",
      { tagClass: TagClass.Private, tagNumber: 0x01 },
      (ab: ArrayBuffer) => ab,
    );
    const builder = new SchemaBuilder(flagSchema);
    const input = new Uint8Array([0x01, 0x02]).buffer;
    const built = builder.build(input);

    const expectedHex = "c1020102";
    assert.strictEqual(toHex(built), expectedHex);
  });

  it("constructed: build encodes object to expected hex string", () => {
    const personSchema = BSchema.constructed(
      "person",
      { tagClass: TagClass.Private, tagNumber: 0x20 },
      [
        BSchema.primitive("id", { tagClass: TagClass.Private, tagNumber: 0x10 }, (n: number) => new Uint8Array([n]).buffer),
        BSchema.primitive("name", { tagClass: TagClass.Private, tagNumber: 0x11 }, (s: string) => new TextEncoder().encode(s).buffer),
      ],
    );
    const builder = new SchemaBuilder(personSchema);
    const data = { id: 7, name: "alice" };
    const built = builder.build(data);

    const expectedHex = "ff200ad00107d105616c696365";
    assert.strictEqual(toHex(built), expectedHex);
  });

  it("strict mode: missing required property throws", () => {
    const recSchema = BSchema.constructed(
      "rec",
      { tagClass: TagClass.Application, tagNumber: 0x10 },
      [
        BSchema.primitive("id", { tagClass: TagClass.Application, tagNumber: 0x11 }, (n: number) => new Uint8Array([n]).buffer),
        BSchema.primitive("name", { tagClass: TagClass.Application, tagNumber: 0x12 }, (s: string) => new TextEncoder().encode(s).buffer),
      ],
    );
    const builder = new SchemaBuilder(recSchema, { strict: true });
    assert.throws(() => builder.build({ id: 1 } as any));
  });

  it("primitive without encode: wrong data type fails", () => {
    const rawSchema = BSchema.primitive("raw", { tagNumber: 0x01 }, undefined);
    const builder = new SchemaBuilder(rawSchema);
    assert.throws(() => builder.build(123 as any));
  });
});
describe("Builder SET ordering (strict gating)", () => {
  it("strict=false: preserves input order in SET (no canonical sort)", () => {
    const setSchema = BSchema.constructed(
      "setBox",
      { tagNumber: 17 }, // UNIVERSAL SET (inferred isSet=true)
      [
        // Intentionally place 'name' (UTF8String, 0x0C) before 'id' (INTEGER, 0x02)
        BSchema.primitive("name", { tagNumber: 0x0c }, (s: string) => new TextEncoder().encode(s).buffer),
        BSchema.primitive("id", { tagNumber: 0x02 }, (n: number) => new Uint8Array([n]).buffer),
      ],
    );

    const builder = new SchemaBuilder(setSchema, { strict: false });
    const built = builder.build({ id: 7, name: "a" });

    // SET tag=0x31, length=0x06, children in schema order: 0c0161 020107
    const expectedHex = "31060c0161020107";
    assert.strictEqual(toHex(built), expectedHex);
  });

  it("strict=true: sorts SET to DER canonical order", () => {
    const setSchema = BSchema.constructed(
      "setBox",
      { tagNumber: 17 }, // UNIVERSAL SET (inferred isSet=true)
      [
        // Same schema field order as above (name before id)
        BSchema.primitive("name", { tagNumber: 0x0c }, (s: string) => new TextEncoder().encode(s).buffer),
        BSchema.primitive("id", { tagNumber: 0x02 }, (n: number) => new Uint8Array([n]).buffer),
      ],
    );

    const builder = new SchemaBuilder(setSchema, { strict: true });
    const built = builder.build({ id: 7, name: "a" });

    // SET tag=0x31, length=0x06, children sorted lex by raw TLV: 020107 0c0161
    const expectedHex = "31060201070c0161";
    assert.strictEqual(toHex(built), expectedHex);
  });
});