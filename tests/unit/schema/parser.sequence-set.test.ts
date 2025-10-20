// tests/unit/schema/parser.sequence-set.test.ts
import { describe, it, expect } from "vitest";
import assert from "assert";
import {
  Schema as PSchema,
  SchemaParser,
  BasicTLVParser,
} from "../../../src/parser";
import { TagClass } from "../../../src/common/types";
import { fromHexString } from "../../helpers/utils";

describe("SchemaParser primitive: trailing bytes strict gating", () => {
  it("strict=true: throws on trailing bytes", () => {
    const prim = PSchema.primitive(
      "n",
      { tagNumber: 0x02 },
      (ab: ArrayBuffer) => new DataView(ab).getUint8(0),
    );
    const parser = new SchemaParser(prim, { strict: true });
    const buf = fromHexString("02010100");
    assert.throws(() => parser.parse(buf));
  });

  it("strict=false: allows trailing bytes and returns decoded value", () => {
    const prim = PSchema.primitive(
      "n",
      { tagNumber: 0x02 },
      (ab: ArrayBuffer) => new DataView(ab).getUint8(0),
    );
    const parser = new SchemaParser(prim, { strict: false });
    const buf = fromHexString("02010100");
    const val = parser.parse(buf);
    assert.strictEqual(val, 1);
  });
});

describe("SchemaParser constructed: trailing bytes strict gating", () => {
  it("strict=true: throws on trailing bytes", () => {
    const sch = PSchema.constructed("box", {}, [
      PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
        new DataView(ab).getUint8(0),
      ),
    ]);
    const parser = new SchemaParser(sch, { strict: true });
    const buf = fromHexString("300302010700");
    assert.throws(() => parser.parse(buf));
  });

  it("strict=false: allows trailing bytes", () => {
    const sch = PSchema.constructed("box", {}, [
      PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
        new DataView(ab).getUint8(0),
      ),
    ]);
    const parser = new SchemaParser(sch, { strict: false });
    const buf = fromHexString("300302010700");
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { id: 7 });
  });
});

describe("Constructed with no fields yields empty object", () => {
  it("returns {}", () => {
    const sch = PSchema.constructed("empty", {}, []);
    const parser = new SchemaParser(sch);
    const buf = fromHexString("3000");
    const val = parser.parse(buf);
    assert.deepStrictEqual(val, {});
  });
});

describe("SET parsing: unknown child, canonical order, SET OF, duplicates", () => {
  it("unknown child in SET throws", () => {
    const setSch = PSchema.constructed(
      "set1",
      { tagNumber: 17 }, // UNIVERSAL SET
      [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ],
    );
    const parser = new SchemaParser(setSch);
    const buf = fromHexString("31060201070c0161"); // id + unexpected UTF8String
    assert.throws(() => parser.parse(buf));
  });

  it("canonical order violation throws when strict=true", () => {
    const setSch = PSchema.constructed("set2", { tagNumber: 17 }, [
      PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
        new DataView(ab).getUint8(0),
      ),
      PSchema.primitive("name", { tagNumber: 0x0c }, (ab: ArrayBuffer) =>
        new TextDecoder("utf-8").decode(ab),
      ),
    ]);
    const parser = new SchemaParser(setSch, { strict: true });
    const buf = fromHexString("31060c0161020107"); // name then id (violates DER order)
    assert.throws(() => parser.parse(buf));
  });

  it("canonical order ignored when strict=false", () => {
    const setSch = PSchema.constructed("set3", { tagNumber: 17 }, [
      PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
        new DataView(ab).getUint8(0),
      ),
      PSchema.primitive("name", { tagNumber: 0x0c }, (ab: ArrayBuffer) =>
        new TextDecoder("utf-8").decode(ab),
      ),
    ]);
    const parser = new SchemaParser(setSch, { strict: false });
    const buf = fromHexString("31060c0161020107");
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { id: 7, name: "a" });
  });

  it("SET OF repeated items parses into array", () => {
    const setOf = PSchema.constructed("setOf", { tagNumber: 17 }, [
      PSchema.repeated(
        "items",
        {},
        PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ),
    ]);
    const parser = new SchemaParser(setOf, { strict: true });
    const buf = fromHexString("3106020101020102"); // two INTEGERs
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { items: [1, 2] });
  });

  it("duplicate non-repeated field in SET triggers leftover child error", () => {
    const setSch = PSchema.constructed("setDup", { tagNumber: 17 }, [
      PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
        new DataView(ab).getUint8(0),
      ),
    ]);
    const parser = new SchemaParser(setSch, { strict: false });
    const buf = fromHexString("3106020107020102"); // two INTEGER children with same tag
    assert.throws(() => parser.parse(buf));
  });

  it("throws when required repeated field (SET OF) is missing", () => {
    const sch = PSchema.constructed("setMissingRep", { tagNumber: 17 }, [
      PSchema.repeated(
        "items",
        {},
        PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ),
    ]);
    const parser = new SchemaParser(sch);
    const buf = fromHexString("3100");
    assert.throws(() => parser.parse(buf));
  });

  it("throws when required non-repeated field is missing", () => {
    const sch = PSchema.constructed("setMissingNR", { tagNumber: 17 }, [
      PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
        new DataView(ab).getUint8(0),
      ),
    ]);
    const parser = new SchemaParser(sch);
    const buf = fromHexString("3100");
    assert.throws(() => parser.parse(buf));
  });
});

describe("SEQUENCE parsing: optional skip, repeated consumption, extra child errors", () => {
  it("skips optional when tag does not match and continues", () => {
    const sch = PSchema.constructed("seq1", { tagNumber: 16 }, [
      PSchema.primitive(
        "opt",
        { optional: true, tagNumber: 0x0c },
        (ab: ArrayBuffer) => new TextDecoder().decode(ab),
      ),
      PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
        new DataView(ab).getUint8(0),
      ),
    ]);
    const parser = new SchemaParser(sch);
    const buf = fromHexString("3003020107"); // only id present
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { id: 7 });
  });

  it("repeated items consumed then tail field parsed", () => {
    const sch = PSchema.constructed("seq2", { tagNumber: 16 }, [
      PSchema.repeated(
        "items",
        {},
        PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ),
      PSchema.primitive("tail", { tagNumber: 0x0c }, (ab: ArrayBuffer) =>
        new TextDecoder().decode(ab),
      ),
    ]);
    const parser = new SchemaParser(sch);
    const buf = fromHexString("30090201010201020c0161");
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { items: [1, 2], tail: "a" });
  });

  it("optional constructed field is skipped when not matching, then required parsed", () => {
    const sch = PSchema.constructed("seqOptC", { tagNumber: 16 }, [
      PSchema.constructed("optC", { optional: true, tagNumber: 0x10 }, [
        PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ]),
      PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
        new DataView(ab).getUint8(0),
      ),
    ]);
    const parser = new SchemaParser(sch);
    const buf = fromHexString("3003020107");
    const val = parser.parse(buf) as any;
    assert.deepStrictEqual(val, { id: 7 });
  });

  it("throws on unexpected extra child after consuming schema fields", () => {
    const sch = PSchema.constructed("seqExtra", { tagNumber: 16 }, [
      PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
        new DataView(ab).getUint8(0),
      ),
    ]);
    const parser = new SchemaParser(sch);
    const buf = fromHexString("30060201070c0161");
    assert.throws(() => parser.parse(buf));
  });
});

describe("Top-level repeated schema guard", () => {
  it("throws for top-level repeated", () => {
    const rep = PSchema.repeated(
      "items",
      {},
      PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
        new DataView(ab).getUint8(0),
      ),
    );
    const parser = new SchemaParser(rep as any);
    const buf = fromHexString("020101");
    assert.throws(() => parser.parse(buf));
  });
});

describe("Schema.inferIsSetFromTag coverage", () => {
  it("returns expected values for Universal class (16->false, 17->true) and undefined otherwise", () => {
    expect(PSchema.inferIsSetFromTag(TagClass.Universal, 17)).toBe(true);
    expect(PSchema.inferIsSetFromTag(TagClass.Universal, 16)).toBe(false);
    expect(PSchema.inferIsSetFromTag(TagClass.Private, 17)).toBe(undefined);
  });
});

describe("Decoder: SchemaParser.parse() parses hex to expected object and handles failures", () => {
  it("primitive: parse from hex string equals expected value", () => {
    const hex = "c1020102";
    const flagSchema = PSchema.primitive(
      "flag",
      { tagClass: TagClass.Private, tagNumber: 0x01 },
      (buffer: ArrayBuffer) => new Uint8Array(buffer),
    );
    const parser = new SchemaParser(flagSchema, { strict: true });
    const parsed = parser.parse(fromHexString(hex));
    assert.deepStrictEqual(Array.from(parsed as Uint8Array), [0x01, 0x02]);
  });

  it("constructed: parse from hex string equals expected object", () => {
    const personSchema = PSchema.constructed(
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
    const hex = "ff200ad00107d105616c696365";
    const parsed = new SchemaParser(personSchema).parse(fromHexString(hex));
    assert.deepStrictEqual(parsed, { id: 7, name: "alice" });
  });

  it("strict mode: tag mismatch throws on parse", () => {
    const boxSchema = PSchema.constructed(
      "box",
      { tagClass: TagClass.Private, tagNumber: 0x30 },
      [
        PSchema.primitive(
          "id",
          { tagClass: TagClass.Private, tagNumber: 0x31 },
          (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
        ),
      ],
    );
    const hex = "ff3203f10107";
    const parser = new SchemaParser(boxSchema, { strict: true });
    assert.throws(() => parser.parse(fromHexString(hex)));
  });

  it("strict mode: missing required child throws", () => {
    const recSchema = PSchema.constructed(
      "rec",
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
          (buffer: ArrayBuffer) => new TextDecoder().decode(buffer),
        ),
      ],
    );
    const hex = "ff2003d00109";
    const parser = new SchemaParser(recSchema, { strict: true });
    assert.throws(() => parser.parse(fromHexString(hex)));
  });
});

describe("Parser errors and miscellaneous behaviors", () => {
  it("strict unknown child throws", () => {
    const schema = PSchema.constructed(
      "rec",
      { tagClass: TagClass.Private, tagNumber: 0x10 },
      [
        PSchema.primitive(
          "id",
          { tagClass: TagClass.Private, tagNumber: 0x11 },
          (ab: ArrayBuffer) => new DataView(ab).getUint8(0),
        ),
      ],
    );
    const container = fromHexString("f004df6301ff");
    const parser = new SchemaParser(schema, { strict: true });
    assert.throws(() => parser.parse(container));
  });

  it("primitive strict mismatch on constructed tag throws", () => {
    const primSchema = PSchema.primitive(
      "n",
      { tagClass: TagClass.Private, tagNumber: 0x41 },
      (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
    );
    const constructedTLV = fromHexString("ff410109");
    const parser = new SchemaParser(primSchema, { strict: true });
    assert.throws(() => parser.parse(constructedTLV));
  });

  it("explicit decode-function path returns decoded value", () => {
    const primSchema = PSchema.primitive(
      "text",
      { tagClass: TagClass.Application, tagNumber: 0x05 },
      (buffer: ArrayBuffer) => new TextDecoder("utf-8").decode(buffer),
    );
    const tlv = fromHexString("45026f6b");
    const parsed = new SchemaParser(primSchema).parse(tlv);
    assert.strictEqual(parsed, "ok");
  });
});

describe("Async decode: using Promise in decode callbacks with SchemaParser.parse()", () => {
  it("primitive decode returns Promise<string> and can be awaited", async () => {
    const textSchema = PSchema.primitive(
      "text",
      { tagClass: TagClass.Private, tagNumber: 0x01 },
      async (buffer: ArrayBuffer) => {
        await Promise.resolve();
        return new TextDecoder("utf-8").decode(buffer);
      },
    );
    const tlv = fromHexString("c10568656c6c6f");
    const parser = new SchemaParser(textSchema);
    const parsed = parser.parse(tlv);
    assert(parsed instanceof Promise, "Parsed result should be a Promise");
    const resolved = await (parsed as Promise<string>);
    assert.strictEqual(resolved, "hello");
  });

  it("constructed decode produces object containing Promise field(s), which can be resolved", async () => {
    const recSchema = PSchema.constructed(
      "rec",
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
          async (buffer: ArrayBuffer) => {
            await Promise.resolve();
            return new TextDecoder("utf-8").decode(buffer);
          },
        ),
      ],
    );
    const container = fromHexString("ff200ad00107d105616c696365");
    const parsed = new SchemaParser(recSchema).parse(container) as any;
    assert.strictEqual(parsed.id, 7);
    assert(parsed.name instanceof Promise, "name should be a Promise");
    const resolvedName = await parsed.name;
    assert.strictEqual(resolvedName, "alice");
  });

  it("repeated items with async decode return array of Promises that can be awaited", async () => {
    const listSchema = PSchema.constructed(
      "list",
      { tagClass: TagClass.Private, tagNumber: 0x30 },
      [
        PSchema.repeated(
          "items",
          {},
          PSchema.primitive(
            "item",
            { tagClass: TagClass.Private, tagNumber: 0x31 },
            async (buffer: ArrayBuffer) => {
              await Promise.resolve();
              return new DataView(buffer).getUint8(0);
            },
          ),
        ),
      ],
    );

    const makeItemHex = (n: number) => {
      const hexVal = n.toString(16).padStart(2, "0");
      // Private primitive high-tag-number: tag 0x31 => df 31, length 01, value
      return `df3101${hexVal}`;
    };

    // Private constructed high-tag-number: tag 0x30 => ff 30, length = 3 items * 4 bytes each = 0x0c
    const container = fromHexString(
      "ff300c" + makeItemHex(1) + makeItemHex(2) + makeItemHex(3),
    );

    const parsed = new SchemaParser(listSchema).parse(container) as any;

    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items.every((p: unknown) => p instanceof Promise)).toBe(true);

    const values = await Promise.all(parsed.items);
    assert.deepStrictEqual(values, [1, 2, 3]);
  });
});
