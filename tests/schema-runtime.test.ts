// tests/schema-runtime.test.ts
import { describe, it } from "vitest";
import assert from "assert";
import { Schema as BSchema, SchemaBuilder, BasicTLVBuilder } from "../src/builder";
import { Schema as PSchema, SchemaParser } from "../src/parser";
import { TagClass } from "../src/common/types";

function toHex(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("hex");
}

function concatBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), off);
    off += b.byteLength;
  }
  return out.buffer;
}

describe("Schema runtime behavior", () => {
  it("primitive: build encodes to expected hex", () => {
    const flagSchemaB = BSchema.primitive(
      "flag",
      (ab: ArrayBuffer) => ab,
      { tagClass: TagClass.Private, tagNumber: 0x01 },
    );

    const builder = new SchemaBuilder(flagSchemaB);
    const input = new Uint8Array([0x01, 0x02]).buffer;
    const built = builder.build(input);

    const expected = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: false, tagNumber: 0x01 },
      length: 0,
      value: input,
      endOffset: 0,
    });

    assert.strictEqual(toHex(built), toHex(expected));
  });

  it("primitive: parse decodes to expected typed value", () => {
    const flagSchemaP = PSchema.primitive(
      "flag",
      (buffer: ArrayBuffer) => new Uint8Array(buffer),
      { tagClass: TagClass.Private, tagNumber: 0x01 },
    );

    const input = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: false, tagNumber: 0x01 },
      length: 0,
      value: new Uint8Array([0x01, 0x02]).buffer,
      endOffset: 0,
    });

    const parser = new SchemaParser(flagSchemaP);
    const parsed = parser.parse(input);
    assert.deepStrictEqual(Array.from(parsed as unknown as Uint8Array), [0x01, 0x02]);
  });

  it("constructed: build→parse round-trip preserves data shape", () => {
    const personSchemaB = BSchema.constructed(
      "person",
      [
        BSchema.primitive("id", (n: number) => new Uint8Array([n]).buffer, {
          tagClass: TagClass.Private, tagNumber: 0x10,
        }),
        BSchema.primitive("name", (s: string) => new TextEncoder().encode(s).buffer, {
          tagClass: TagClass.Private, tagNumber: 0x11,
        }),
        BSchema.repeated(
          "tags",
          BSchema.primitive("tag", (t: number) => new Uint8Array([t]).buffer, {
            tagClass: TagClass.Private, tagNumber: 0x12,
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
        PSchema.primitive("id", (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0), {
          tagClass: TagClass.Private, tagNumber: 0x10,
        }),
        PSchema.primitive("name", (buffer: ArrayBuffer) => new TextDecoder("utf-8").decode(buffer), {
          tagClass: TagClass.Private, tagNumber: 0x11,
        }),
        PSchema.repeated(
          "tags",
          PSchema.primitive("tag", (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0), {
            tagClass: TagClass.Private, tagNumber: 0x12,
          }),
        ),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x20 },
    );

    const parser = new SchemaParser(personSchemaP);
    const parsed = parser.parse(buf) as unknown as { id: number; name: string; tags: number[] };
    assert.deepStrictEqual(parsed, data);
  });

  it("constructed: parse→build retains original TLV bytes", () => {
    const idTLV = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: false, tagNumber: 0x10 },
      length: 0,
      value: new Uint8Array([0x07]).buffer,
      endOffset: 0,
    });
    const nameTLV = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: false, tagNumber: 0x11 },
      length: 0,
      value: new TextEncoder().encode("alice").buffer,
      endOffset: 0,
    });
    const inner = concatBuffers([idTLV, nameTLV]);
    const container = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: true, tagNumber: 0x20 },
      length: 0,
      value: inner,
      endOffset: 0,
    });

    const parseSchema = PSchema.constructed(
      "person",
      [
        PSchema.primitive("id", (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0), {
          tagClass: TagClass.Private, tagNumber: 0x10,
        }),
        PSchema.primitive("name", (buffer: ArrayBuffer) => new TextDecoder("utf-8").decode(buffer), {
          tagClass: TagClass.Private, tagNumber: 0x11,
        }),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x20 },
    );
    const parsedValue = new SchemaParser(parseSchema).parse(container);

    const buildSchema = BSchema.constructed(
      "person",
      [
        BSchema.primitive("id", (n: number) => new Uint8Array([n]).buffer, {
          tagClass: TagClass.Private, tagNumber: 0x10,
        }),
        BSchema.primitive("name", (s: string) => new TextEncoder().encode(s).buffer, {
          tagClass: TagClass.Private, tagNumber: 0x11,
        }),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x20 },
    );
    const rebuilt = new SchemaBuilder(buildSchema).build(parsedValue as unknown as { id: number; name: string });
    assert.strictEqual(toHex(rebuilt), toHex(container));
  });

  it("builder strict mode: missing required property throws", () => {
    const schema = BSchema.constructed(
      "rec",
      [
        BSchema.primitive("id", (n: number) => new Uint8Array([n]).buffer, {
          tagClass: TagClass.Application, tagNumber: 0x11,
        }),
        BSchema.primitive("name", (s: string) => new TextEncoder().encode(s).buffer, {
          tagClass: TagClass.Application, tagNumber: 0x12,
        }),
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
          tagClass: TagClass.Private, tagNumber: 0x01,
        }),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x00 },
    );

    const builder = new SchemaBuilder(schema, { strict: false });
    const built = builder.build({ id: 5, extra: 42 } as any);

    const idTLV = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: false, tagNumber: 0x01 },
      length: 0,
      value: new Uint8Array([5]).buffer,
      endOffset: 0,
    });
    const expected = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: true, tagNumber: 0x00 },
      length: 0,
      value: idTLV,
      endOffset: 0,
    });
    assert.strictEqual(toHex(built), toHex(expected));
  });

  it("parser strict mode: container tag mismatch throws", () => {
    const schema = PSchema.constructed(
      "box",
      [
        PSchema.primitive("id", (ab: ArrayBuffer) => new DataView(ab).getUint8(0), {
          tagClass: TagClass.Private, tagNumber: 0x31,
        }),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x30 },
    );

    const idTLV = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: false, tagNumber: 0x31 },
      length: 0,
      value: new Uint8Array([7]).buffer,
      endOffset: 0,
    });
    const wrongContainer = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: true, tagNumber: 0x32 },
      length: 0,
      value: idTLV,
      endOffset: 0,
    });

    const parser = new SchemaParser(schema, { strict: true });
    assert.throws(() => parser.parse(wrongContainer));
  });

  it("parser non-strict mode: unknown child ignored; child order independence", () => {
    const schema = PSchema.constructed(
      "rec",
      [
        PSchema.primitive("id", (ab: ArrayBuffer) => new DataView(ab).getUint8(0), {
          tagClass: TagClass.Private, tagNumber: 0x11,
        }),
        PSchema.primitive("name", (ab: ArrayBuffer) => new TextDecoder().decode(ab), {
          tagClass: TagClass.Private, tagNumber: 0x12,
        }),
      ],
      { tagClass: TagClass.Private, tagNumber: 0x10 },
    );

    const unknownTLV = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: false, tagNumber: 0x13 },
      length: 0,
      value: new Uint8Array([0xaa, 0xbb]).buffer,
      endOffset: 0,
    });
    const nameTLV = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: false, tagNumber: 0x12 },
      length: 0,
      value: new TextEncoder().encode("neo").buffer,
      endOffset: 0,
    });
    const idTLV = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: false, tagNumber: 0x11 },
      length: 0,
      value: new Uint8Array([9]).buffer,
      endOffset: 0,
    });
    const inner = concatBuffers([unknownTLV, nameTLV, idTLV]);
    const container = BasicTLVBuilder.build({
      tag: { tagClass: TagClass.Private, constructed: true, tagNumber: 0x10 },
      length: 0,
      value: inner,
      endOffset: 0,
    });

    const parsed = new SchemaParser(schema, { strict: false }).parse(container) as unknown as {
      id: number; name: string;
    };
    assert.deepStrictEqual(parsed, { id: 9, name: "neo" });
  });

  it("repeated primitive: empty and non-empty build→parse round-trip preserves shape", () => {
    const bSchema = BSchema.constructed(
      "flagsBox",
      [
        BSchema.repeated(
          "flags",
          BSchema.primitive("flag", (b: boolean) => new Uint8Array([b ? 1 : 0]).buffer, {
            tagClass: TagClass.Application, tagNumber: 0x21,
          }),
        ),
      ],
      { tagClass: TagClass.Application, tagNumber: 0x20 },
    );

    const pSchema = PSchema.constructed(
      "flagsBox",
      [
        PSchema.repeated(
          "flags",
          PSchema.primitive("flag", (ab: ArrayBuffer) => new DataView(ab).getUint8(0) === 1, {
            tagClass: TagClass.Application, tagNumber: 0x21,
          }),
        ),
      ],
      { tagClass: TagClass.Application, tagNumber: 0x20 },
    );

    const builtEmpty = new SchemaBuilder(bSchema).build({ flags: [] });
    const parsedEmpty = new SchemaParser(pSchema).parse(builtEmpty) as unknown as { flags: boolean[] };
    assert.deepStrictEqual(parsedEmpty, { flags: [] });

    const builtMany = new SchemaBuilder(bSchema).build({ flags: [true, false, true] });
    const parsedMany = new SchemaParser(pSchema).parse(builtMany) as unknown as { flags: boolean[] };
    assert.deepStrictEqual(parsedMany, { flags: [true, false, true] });
  });
});