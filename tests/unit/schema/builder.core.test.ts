// tests/unit/schema/builder.core.test.ts
import { describe, it } from "vitest";
import assert from "assert";
import {
  Schema as BSchema,
  SchemaBuilder,
  BasicTLVBuilder,
} from "../../../src/builder";
import { TagClass } from "../../../src/common/types";
import { toHex } from "../../../src/common/codecs";

function toHexBuf(buf: ArrayBuffer): string {
  return toHex(new Uint8Array(buf));
}

describe("Builder core: primitive and constructed encoding", () => {
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
    assert.strictEqual(toHexBuf(built), expectedHex);
  });

  it("constructed: build encodes object to expected hex string", () => {
    const personSchema = BSchema.constructed(
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
    const builder = new SchemaBuilder(personSchema);
    const data = { id: 7, name: "alice" };
    const built = builder.build(data);
    const expectedHex = "ff200ad00107d105616c696365";
    assert.strictEqual(toHexBuf(built), expectedHex);
  });

  it("strict mode: missing required property throws", () => {
    const recSchema = BSchema.constructed(
      "rec",
      { tagClass: TagClass.Application, tagNumber: 0x10 },
      [
        BSchema.primitive(
          "id",
          { tagClass: TagClass.Application, tagNumber: 0x11 },
          (n: number) => new Uint8Array([n]).buffer,
        ),
        BSchema.primitive(
          "name",
          { tagClass: TagClass.Application, tagNumber: 0x12 },
          (s: string) => new TextEncoder().encode(s).buffer,
        ),
      ],
    );
    const builder = new SchemaBuilder(recSchema, { strict: true });
    assert.throws(() => builder.build({ id: 1 } as any));
  });

  it("primitive without encode: wrong data type fails", () => {
    const rawSchema = BSchema.primitive(
      "raw",
      { tagNumber: 0x01 },
      undefined as any,
    );
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
        BSchema.primitive(
          "name",
          { tagNumber: 0x0c },
          (s: string) => new TextEncoder().encode(s).buffer,
        ),
        BSchema.primitive(
          "id",
          { tagNumber: 0x02 },
          (n: number) => new Uint8Array([n]).buffer,
        ),
      ],
    );
    const builder = new SchemaBuilder(setSchema, { strict: false });
    const built = builder.build({ id: 7, name: "a" });
    const expectedHex = "31060c0161020107";
    assert.strictEqual(toHexBuf(built), expectedHex);
  });

  it("strict=true: sorts SET to DER canonical order", () => {
    const setSchema = BSchema.constructed(
      "setBox",
      { tagNumber: 17 }, // UNIVERSAL SET (inferred isSet=true)
      [
        // Same schema field order as above (name before id)
        BSchema.primitive(
          "name",
          { tagNumber: 0x0c },
          (s: string) => new TextEncoder().encode(s).buffer,
        ),
        BSchema.primitive(
          "id",
          { tagNumber: 0x02 },
          (n: number) => new Uint8Array([n]).buffer,
        ),
      ],
    );
    const builder = new SchemaBuilder(setSchema, { strict: true });
    const built = builder.build({ id: 7, name: "a" });
    const expectedHex = "31060201070c0161";
    assert.strictEqual(toHexBuf(built), expectedHex);
  });
});

describe("Builder raw encode paths (no encoder provided)", () => {
  it("accepts ArrayBuffer when no encoder is provided", () => {
    const rawSchema = BSchema.primitive("raw", {
      tagClass: TagClass.Universal,
      tagNumber: 5,
    });
    const builder = new SchemaBuilder(rawSchema);
    const data = new Uint8Array([0xaa, 0xbb]).buffer;
    const built = builder.build(data);
    const expectedHex = "0502aabb";
    assert.strictEqual(toHexBuf(built), expectedHex);
  });

  it("accepts Uint8Array and copies bytes when no encoder is provided", () => {
    const rawSchema = BSchema.primitive("raw", {
      tagClass: TagClass.Universal,
      tagNumber: 6,
    });
    const builder = new SchemaBuilder(rawSchema);
    const data = new Uint8Array([1, 2, 3]);
    const built = builder.build(data.buffer);
    const expectedHex = "0603010203";
    assert.strictEqual(toHexBuf(built), expectedHex);
  });
});

describe("Builder nested constructed and errors", () => {
  it("encodes nested constructed inner container", () => {
    const schema = BSchema.constructed(
      "outer",
      { tagClass: TagClass.Private, tagNumber: 0x20 },
      [
        BSchema.constructed(
          "inner",
          { tagClass: TagClass.Private, tagNumber: 0x10 },
          [
            BSchema.primitive(
              "x",
              { tagClass: TagClass.Private, tagNumber: 0x11 },
              (n: number) => new Uint8Array([n]).buffer,
            ),
          ],
        ),
      ],
    );
    const builder = new SchemaBuilder(schema);
    const built = builder.build({ inner: { x: 5 } });
    const expectedHex = "ff2005f003d10105";
    assert.strictEqual(toHexBuf(built), expectedHex);
  });

  it("top-level repeated schema is not supported", () => {
    const rep = BSchema.repeated(
      "items",
      {},
      BSchema.primitive(
        "n",
        { tagClass: TagClass.Application, tagNumber: 0x42 },
        (n: number) => new Uint8Array([n]).buffer,
      ),
    );
    const builder = new SchemaBuilder(rep as any);
    assert.throws(() => builder.build([1, 2, 3] as any));
  });

  it("repeated field expects an array (throws otherwise)", () => {
    const sch = BSchema.constructed("seqRep", { tagNumber: 16 }, [
      BSchema.repeated(
        "items",
        {},
        BSchema.primitive(
          "n",
          { tagNumber: 0x02 },
          (n: number) => new Uint8Array([n]).buffer,
        ),
      ),
    ]);
    const builder = new SchemaBuilder(sch);
    assert.throws(() => builder.build({ items: 123 } as any));
  });

  it("BSchema.primitive requires tagNumber", () => {
    assert.throws(() => BSchema.primitive("raw", {} as any));
  });
});

describe("BasicTLVBuilder: constraints echoed via builder outputs", () => {
  it("throws when building invalid TLV with bad tagNumber through BasicTLVBuilder", () => {
    const badTLV = {
      tag: {
        tagClass: TagClass.Universal,
        constructed: false,
        tagNumber: -1 as any,
      },
      length: 0,
      value: new ArrayBuffer(0),
      endOffset: 0,
    };
    assert.throws(() => BasicTLVBuilder.build(badTLV));
  });

  it("throws when building invalid TLV with bad tagClass through BasicTLVBuilder", () => {
    const badTLV = {
      tag: { tagClass: 99 as any, constructed: false, tagNumber: 1 },
      length: 0,
      value: new ArrayBuffer(0),
      endOffset: 0,
    };
    assert.throws(() => BasicTLVBuilder.build(badTLV));
  });
});
