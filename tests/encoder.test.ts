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