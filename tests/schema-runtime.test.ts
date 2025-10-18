// tests/schema-runtime.test.ts
import { describe, it } from "vitest";
import assert from "assert";
import { Schema as BSchema, SchemaBuilder } from "../src/builder";
import { Schema as PSchema, SchemaParser } from "../src/parser";
import { TagClass } from "../src/common/types";
import { fromHexString } from "./utils";

function toHex(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("hex");
}

describe("Schema runtime behavior", () => {
  it("primitive: build encodes to expected hex", () => {
    const flagSchemaB = BSchema.primitive("flag", (ab: ArrayBuffer) => ab, {
      tagClass: TagClass.Private,
      tagNumber: 0x01,
    });

    const builder = new SchemaBuilder(flagSchemaB);
    const input = new Uint8Array([0x01, 0x02]).buffer;
    const built = builder.build(input);

    const expectedHex = "c1020102";
    assert.strictEqual(toHex(built), expectedHex);
  });

  it("primitive: parse decodes to expected typed value", () => {
    const flagSchemaP = PSchema.primitive(
      "flag",
      (buffer: ArrayBuffer) => new Uint8Array(buffer),
      { tagClass: TagClass.Private, tagNumber: 0x01 },
    );

    const input = fromHexString("c1020102");

    const parser = new SchemaParser(flagSchemaP);
    const parsed = parser.parse(input);
    assert.deepStrictEqual(Array.from(parsed as Uint8Array), [0x01, 0x02]);
  });

  it("constructed: build→parse round-trip preserves data shape", () => {
    const personSchemaB = BSchema.constructed(
      "person",
      [
        BSchema.primitive("id", (n: number) => new Uint8Array([n]).buffer, {
          tagClass: TagClass.Private,
          tagNumber: 0x10,
        }),
        BSchema.primitive(
          "name",
          (s: string) => new TextEncoder().encode(s).buffer,
          {
            tagClass: TagClass.Private,
            tagNumber: 0x11,
          },
        ),
        BSchema.repeated(
          "tags",
          BSchema.primitive("tag", (t: number) => new Uint8Array([t]).buffer, {
            tagClass: TagClass.Private,
            tagNumber: 0x12,
          }),
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x20 },
    );

    const data = { id: 7, name: "alice", tags: [1, 2] };
    const builder = new SchemaBuilder(personSchemaB);
    const buf = builder.build(data);

    const personSchemaP = PSchema.constructed(
      "person",
      [
        PSchema.primitive(
          "id",
          (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
          {
            tagClass: TagClass.Private,
            tagNumber: 0x10,
          },
        ),
        PSchema.primitive(
          "name",
          (buffer: ArrayBuffer) => new TextDecoder("utf-8").decode(buffer),
          {
            tagClass: TagClass.Private,
            tagNumber: 0x11,
          },
        ),
        PSchema.repeated(
          "tags",
          PSchema.primitive(
            "tag",
            (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
            {
              tagClass: TagClass.Private,
              tagNumber: 0x12,
            },
          ),
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x20 },
    );

    const parser = new SchemaParser(personSchemaP);
    const parsed = parser.parse(buf);
    assert.deepStrictEqual(parsed, data);
  });
  it("constructed: parse→build retains original TLV bytes", () => {
    const containerHex = "ff200ad00107d105616c696365";
    const container = fromHexString(containerHex);

    const parseSchema = PSchema.constructed(
      "person",
      [
        PSchema.primitive(
          "id",
          (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
          {
            tagClass: TagClass.Private,
            tagNumber: 0x10,
          },
        ),
        PSchema.primitive(
          "name",
          (buffer: ArrayBuffer) => new TextDecoder("utf-8").decode(buffer),
          {
            tagClass: TagClass.Private,
            tagNumber: 0x11,
          },
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x20 },
    );
    const parsedValue = new SchemaParser(parseSchema).parse(container);

    const buildSchema = BSchema.constructed(
      "person",
      [
        BSchema.primitive("id", (n: number) => new Uint8Array([n]).buffer, {
          tagClass: TagClass.Private,
          tagNumber: 0x10,
        }),
        BSchema.primitive(
          "name",
          (s: string) => new TextEncoder().encode(s).buffer,
          {
            tagClass: TagClass.Private,
            tagNumber: 0x11,
          },
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x20 },
    );
    const rebuilt = new SchemaBuilder(buildSchema).build(parsedValue);
    assert.strictEqual(toHex(rebuilt), containerHex);
  });

  it("builder strict mode: missing required property throws", () => {
    const schema = BSchema.constructed(
      "rec",
      [
        BSchema.primitive("id", (n: number) => new Uint8Array([n]).buffer, {
          tagClass: TagClass.Application,
          tagNumber: 0x11,
        }),
        BSchema.primitive(
          "name",
          (s: string) => new TextEncoder().encode(s).buffer,
          {
            tagClass: TagClass.Application,
            tagNumber: 0x12,
          },
        ),
      ],
      { tagClass: TagClass.Application, tagNumber: 0x10 },
    );

    const builder = new SchemaBuilder(schema, { strict: true });
    assert.throws(() => builder.build({ id: 1 } as any));
  });

  it("builder non-strict mode: extra property ignored (encodes only known fields)", () => {
    const schema = BSchema.constructed(
      "rec",
      [
        BSchema.primitive("id", (n: number) => new Uint8Array([n]).buffer, {
          tagClass: TagClass.Private,
          tagNumber: 0x01,
        }),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x00 },
    );

    const builder = new SchemaBuilder(schema, { strict: false });
    const built = builder.build({ id: 5, extra: 42 } as any);

    const expectedHex = "e003c10105";
    assert.strictEqual(toHex(built), expectedHex);
  });

  it("parser strict mode: container tag mismatch throws", () => {
    const schema = PSchema.constructed(
      "box",
      [
        PSchema.primitive(
          "id",
          (ab: ArrayBuffer) => new DataView(ab).getUint8(0),
          {
            tagClass: TagClass.Private,
            tagNumber: 0x31,
          },
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x30 },
    );

    const wrongContainerHex = "ff3203f10107";
    const parser = new SchemaParser(schema, { strict: true });
    assert.throws(() => parser.parse(fromHexString(wrongContainerHex)));
  });

  it("repeated primitive: empty and non-empty build→parse round-trip preserves shape", () => {
    const bSchema = BSchema.constructed(
      "flagsBox",
      [
        BSchema.repeated(
          "flags",
          BSchema.primitive(
            "flag",
            (b: boolean) => new Uint8Array([b ? 1 : 0]).buffer,
            {
              tagClass: TagClass.Application,
              tagNumber: 0x21,
            },
          ),
        ),
      ],
      { tagClass: TagClass.Application, tagNumber: 0x20 },
    );

    const pSchema = PSchema.constructed(
      "flagsBox",
      [
        PSchema.repeated(
          "flags",
          PSchema.primitive(
            "flag",
            (ab: ArrayBuffer) => new DataView(ab).getUint8(0) === 1,
            {
              tagClass: TagClass.Application,
              tagNumber: 0x21,
            },
          ),
        ),
      ],
      { tagClass: TagClass.Application, tagNumber: 0x20 },
    );

    const builtEmpty = new SchemaBuilder(bSchema).build({ flags: [] });
    const parsedEmpty = new SchemaParser(pSchema).parse(builtEmpty);
    assert.deepStrictEqual(parsedEmpty, { flags: [] });

    const builtMany = new SchemaBuilder(bSchema).build({
      flags: [true, false, true],
    });
    const parsedMany = new SchemaParser(pSchema).parse(builtMany);
    assert.deepStrictEqual(parsedMany, { flags: [true, false, true] });
  });
});
