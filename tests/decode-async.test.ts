 // tests/decode-async.test.ts
import { describe, it, expect } from "vitest";
import assert from "assert";
import { Schema as PSchema, SchemaParser } from "../src/parser";
import { TagClass } from "../src/common/types";
import { fromHexString } from "./utils";

describe("Async decode: using Promise in decode callbacks with SchemaParser.parse()", () => {
  it("primitive decode returns Promise<string> and can be awaited", async () => {
    const textSchema = PSchema.primitive(
      "text",
      { tagClass: TagClass.Private, tagNumber: 0x01 },
      async (buffer: ArrayBuffer) => {
        // simulate async side effect
        await Promise.resolve();
        return new TextDecoder("utf-8").decode(buffer);
      },
    );
    const tlv = fromHexString("c10568656c6c6f");

    const parser = new SchemaParser(textSchema);
    const parsed = parser.parse(tlv);
    assert(parsed instanceof Promise, "Parsed result should be a Promise");
    const resolved = await parsed;
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

    const parsed = new SchemaParser(recSchema).parse(container);

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

    const parsed = new SchemaParser(listSchema).parse(container);

    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items.every((p) => p instanceof Promise)).toBe(true);

    const values = await Promise.all(parsed.items);
    assert.deepStrictEqual(values, [1, 2, 3]);
  });
});
