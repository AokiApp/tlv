// tests/integration/schema/roundtrip.test.ts
import { describe, it } from "vitest";
import assert from "assert";
import { Schema as BSchema, SchemaBuilder } from "../../../src/builder";
import { Schema as PSchema, SchemaParser } from "../../../src/parser";
import { TagClass } from "../../../src/common/types";
import { toHex } from "../../../src/common/codecs";
import { fromHexString } from "../../helpers/utils";

describe("Integration: constructed build→parse round-trip preserves data shape", () => {
  it("person schema with repeated tags", () => {
    const personSchemaB = BSchema.constructed(
      "person",
      { tagClass: TagClass.Private, tagNumber: 0x20 },
      [
        BSchema.primitive(
          "id",
          { tagClass: TagClass.Private, tagNumber: 0x10 },
          (n: number) => new Uint8Array([n]).buffer,
        ),
        BSchema.primitive(
          "name",
          { tagClass: TagClass.Private, tagNumber: 0x11 },
          (s: string) => new TextEncoder().encode(s).buffer,
        ),
        BSchema.repeated(
          "tags",
          {},
          BSchema.primitive(
            "tag",
            { tagClass: TagClass.Private, tagNumber: 0x12 },
            (t: number) => new Uint8Array([t]).buffer,
          ),
        ),
      ],
    );

    const data = { id: 7, name: "alice", tags: [1, 2] };
    const builder = new SchemaBuilder(personSchemaB);
    const buf = builder.build(data);

    const personSchemaP = PSchema.constructed(
      "person",
      { tagClass: TagClass.Private, tagNumber: 0x20 },
      [
        PSchema.primitive(
          "id",
          { tagClass: TagClass.Private, tagNumber: 0x10 },
          (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
        ),
        PSchema.primitive(
          "name",
          { tagClass: TagClass.Private, tagNumber: 0x11 },
          (buffer: ArrayBuffer) => new TextDecoder("utf-8").decode(buffer),
        ),
        PSchema.repeated(
          "tags",
          {},
          PSchema.primitive(
            "tag",
            { tagClass: TagClass.Private, tagNumber: 0x12 },
            (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
          ),
        ),
      ],
    );

    const parser = new SchemaParser(personSchemaP);
    const parsed = parser.parse(buf);
    assert.deepStrictEqual(parsed, data);
  });
});

describe("Integration: constructed parse→build retains original TLV bytes", () => {
  it("person container", () => {
    const containerHex = "ff200ad00107d105616c696365";
    const container = fromHexString(containerHex);

    const parseSchema = PSchema.constructed(
      "person",
      { tagClass: TagClass.Private, tagNumber: 0x20 },
      [
        PSchema.primitive(
          "id",
          { tagClass: TagClass.Private, tagNumber: 0x10 },
          (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
        ),
        PSchema.primitive(
          "name",
          { tagClass: TagClass.Private, tagNumber: 0x11 },
          (buffer: ArrayBuffer) => new TextDecoder("utf-8").decode(buffer),
        ),
      ],
    );
    const parsedValue = new SchemaParser(parseSchema).parse(container);

    const buildSchema = BSchema.constructed(
      "person",
      { tagClass: TagClass.Private, tagNumber: 0x20 },
      [
        BSchema.primitive(
          "id",
          { tagClass: TagClass.Private, tagNumber: 0x10 },
          (n: number) => new Uint8Array([n]).buffer,
        ),
        BSchema.primitive(
          "name",
          { tagClass: TagClass.Private, tagNumber: 0x11 },
          (s: string) => new TextEncoder().encode(s).buffer,
        ),
      ],
    );
    const rebuilt = new SchemaBuilder(buildSchema).build(parsedValue as any);
    assert.strictEqual(toHex(rebuilt), containerHex);
  });
});

describe("Integration: repeated primitive build→parse round-trip preserves shape", () => {
  it("flags: empty and non-empty", () => {
    const bSchema = BSchema.constructed(
      "flagsBox",
      { tagClass: TagClass.Application, tagNumber: 0x20 },
      [
        BSchema.repeated(
          "flags",
          {},
          BSchema.primitive(
            "flag",
            { tagClass: TagClass.Application, tagNumber: 0x21 },
            (b: boolean) => new Uint8Array([b ? 1 : 0]).buffer,
          ),
        ),
      ],
    );

    const pSchema = PSchema.constructed(
      "flagsBox",
      { tagClass: TagClass.Application, tagNumber: 0x20 },
      [
        PSchema.repeated(
          "flags",
          {},
          PSchema.primitive(
            "flag",
            { tagClass: TagClass.Application, tagNumber: 0x21 },
            (ab: ArrayBuffer) => new DataView(ab).getUint8(0) === 1,
          ),
        ),
      ],
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
