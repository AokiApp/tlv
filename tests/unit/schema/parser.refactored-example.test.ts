// tests/unit/schema/parser.refactored-example.test.ts
/**
 * This is an example refactored test file showing best practices
 * for organizing tests. This consolidates logic from:
 * - parser.additional-coverage.test.ts
 * - parser.sequence-set.test.ts (partial)
 * 
 * Key improvements demonstrated:
 * 1. Feature-based organization instead of coverage-based
 * 2. Parameterized tests to reduce duplication
 * 3. Clear test descriptions that explain intent
 * 4. Logical grouping of related test cases
 */

import { describe, it, expect } from "vitest";
import assert from "assert";
import {
  Schema as PSchema,
  SchemaParser,
  BasicTLVParser,
} from "../../../src/parser";
import { TagClass } from "../../../src/common/types";
import { fromHexString } from "../../helpers/utils";

describe("SchemaParser: Strict Mode Behavior", () => {
  describe("trailing bytes handling", () => {
    // Parameterized test to avoid duplication
    it.each([
      {
        schemaType: "primitive",
        schema: PSchema.primitive(
          "n",
          { tagNumber: 0x02 },
          (ab: ArrayBuffer) => new DataView(ab).getUint8(0),
        ),
        buffer: fromHexString("02010100"), // has trailing byte 0x00
        expectedValue: 1,
      },
      {
        schemaType: "constructed",
        schema: PSchema.constructed("box", {}, [
          PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
            new DataView(ab).getUint8(0),
          ),
        ]),
        buffer: fromHexString("300302010700"), // has trailing byte 0x00
        expectedValue: { id: 7 },
      },
    ])(
      "$schemaType: strict=true throws on trailing bytes, strict=false allows them",
      ({ schema, buffer, expectedValue }) => {
        // Strict mode should throw
        const strictParser = new SchemaParser(schema, { strict: true });
        assert.throws(
          () => strictParser.parse(buffer),
          /trailing bytes/i,
          "strict mode should reject trailing bytes",
        );

        // Non-strict mode should allow
        const lenientParser = new SchemaParser(schema, { strict: false });
        const result = lenientParser.parse(buffer);
        assert.deepStrictEqual(
          result,
          expectedValue,
          "non-strict mode should ignore trailing bytes",
        );
      },
    );
  });

  describe("depth limits", () => {
    it("throws when exceeding maxDepth during nested parsing", () => {
      const nestedSchema = PSchema.constructed("outer", { tagNumber: 16 }, [
        PSchema.constructed("inner", { tagNumber: 16 }, [
          PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
            new DataView(ab).getUint8(0),
          ),
        ]),
      ]);

      // Buffer: outer SEQUENCE containing inner SEQUENCE(INTEGER)
      const buffer = fromHexString("30053003020107");

      // maxDepth=1 means we can only go 1 level deep (outer only)
      const parser = new SchemaParser(nestedSchema, {
        strict: true,
        maxDepth: 1,
      });

      assert.throws(
        () => parser.parse(buffer),
        /depth|nested/i,
        "should throw when exceeding maxDepth",
      );
    });

    it("allows parsing within maxDepth limit", () => {
      const nestedSchema = PSchema.constructed("outer", { tagNumber: 16 }, [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ]);

      const buffer = fromHexString("3003020107");
      const parser = new SchemaParser(nestedSchema, { maxDepth: 2 });

      assert.doesNotThrow(() => {
        const result = parser.parse(buffer);
        assert.deepStrictEqual(result, { id: 7 });
      });
    });
  });
});

describe("SchemaParser: SEQUENCE Parsing", () => {
  describe("optional field handling", () => {
    it("skips optional field when not present and continues parsing", () => {
      const schema = PSchema.constructed("seq", { tagNumber: 16 }, [
        PSchema.primitive(
          "optionalName",
          { optional: true, tagNumber: 0x0c },
          (ab: ArrayBuffer) => new TextDecoder().decode(ab),
        ),
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ]);

      const buffer = fromHexString("3003020107"); // only id present
      const result = new SchemaParser(schema).parse(buffer);

      assert.deepStrictEqual(
        result,
        { id: 7 },
        "optional field should be omitted when not present",
      );
    });

    it("skips trailing optional field at end of content", () => {
      const schema = PSchema.constructed("seqTail", { tagNumber: 16 }, [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
        PSchema.primitive(
          "optionalEnd",
          { optional: true, tagNumber: 0x0c },
          (ab: ArrayBuffer) => new TextDecoder().decode(ab),
        ),
      ]);

      const buffer = fromHexString("3003020107"); // only id present
      const result = new SchemaParser(schema, { strict: true }).parse(buffer);

      assert.deepStrictEqual(
        result,
        { id: 7 },
        "trailing optional field should be skipped at end-of-content",
      );
    });

    it("skips optional constructed field when not matching", () => {
      const schema = PSchema.constructed("seqOptC", { tagNumber: 16 }, [
        PSchema.constructed("optionalBox", { optional: true, tagNumber: 0x10 }, [
          PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
            new DataView(ab).getUint8(0),
          ),
        ]),
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ]);

      const buffer = fromHexString("3003020107"); // only id present
      const result = new SchemaParser(schema).parse(buffer);

      assert.deepStrictEqual(
        result,
        { id: 7 },
        "optional constructed field should be skipped when not present",
      );
    });
  });

  describe("repeated field handling", () => {
    it("consumes repeated items then parses following field", () => {
      const schema = PSchema.constructed("seq", { tagNumber: 16 }, [
        PSchema.repeated(
          "items",
          {},
          PSchema.primitive("item", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
            new DataView(ab).getUint8(0),
          ),
        ),
        PSchema.primitive("tail", { tagNumber: 0x0c }, (ab: ArrayBuffer) =>
          new TextDecoder().decode(ab),
        ),
      ]);

      // Two INTEGERs followed by UTF8String
      const buffer = fromHexString("30090201010201020c0161");
      const result = new SchemaParser(schema).parse(buffer);

      assert.deepStrictEqual(
        result,
        { items: [1, 2], tail: "a" },
        "should collect repeated items then parse tail field",
      );
    });
  });

  describe("error cases", () => {
    it("throws on unexpected extra child after consuming schema fields", () => {
      const schema = PSchema.constructed("seqExtra", { tagNumber: 16 }, [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ]);

      // INTEGER followed by unexpected UTF8String
      const buffer = fromHexString("30060201070c0161");

      assert.throws(
        () => new SchemaParser(schema).parse(buffer),
        /unexpected|unknown/i,
        "should throw on extra unexpected child",
      );
    });

    it("throws when required field is missing", () => {
      const schema = PSchema.constructed("seqReq", { tagNumber: 16 }, [
        PSchema.primitive("requiredId", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ]);

      const emptyBuffer = fromHexString("3000"); // empty SEQUENCE

      assert.throws(
        () => new SchemaParser(schema).parse(emptyBuffer),
        /required|missing/i,
        "should throw when required field is missing",
      );
    });
  });
});

describe("SchemaParser: SET Parsing", () => {
  describe("canonical ordering (DER compliance)", () => {
    const setSchema = PSchema.constructed("set", { tagNumber: 17 }, [
      PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
        new DataView(ab).getUint8(0),
      ),
      PSchema.primitive("name", { tagNumber: 0x0c }, (ab: ArrayBuffer) =>
        new TextDecoder("utf-8").decode(ab),
      ),
    ]);

    it("strict=true: enforces DER canonical order (lower tag first)", () => {
      // name (0x0C) before id (0x02) - violates DER order
      const unorderedBuffer = fromHexString("31060c0161020107");
      const strictParser = new SchemaParser(setSchema, { strict: true });

      assert.throws(
        () => strictParser.parse(unorderedBuffer),
        /canonical|order/i,
        "strict mode should enforce canonical ordering",
      );
    });

    it("strict=false: allows any order", () => {
      // name (0x0C) before id (0x02) - out of order but allowed
      const unorderedBuffer = fromHexString("31060c0161020107");
      const lenientParser = new SchemaParser(setSchema, { strict: false });

      const result = lenientParser.parse(unorderedBuffer);
      assert.deepStrictEqual(
        result,
        { id: 7, name: "a" },
        "non-strict mode should allow any order",
      );
    });
  });

  describe("optional fields", () => {
    it("allows empty SET when all fields are optional", () => {
      const schema = PSchema.constructed("setOpt", { tagNumber: 17 }, [
        PSchema.primitive(
          "optionalId",
          { optional: true, tagNumber: 0x02 },
          (ab: ArrayBuffer) => new DataView(ab).getUint8(0),
        ),
      ]);

      const emptySet = fromHexString("3100");
      const result = new SchemaParser(schema, { strict: true }).parse(emptySet);

      assert.deepStrictEqual(
        result,
        {},
        "empty SET should be valid when all fields are optional",
      );
    });
  });

  describe("repeated fields (SET OF)", () => {
    it("parses SET OF as array of items", () => {
      const setOfSchema = PSchema.constructed("setOf", { tagNumber: 17 }, [
        PSchema.repeated(
          "numbers",
          {},
          PSchema.primitive("num", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
            new DataView(ab).getUint8(0),
          ),
        ),
      ]);

      const buffer = fromHexString("3106020101020102"); // two INTEGERs: 1, 2
      const result = new SchemaParser(setOfSchema, { strict: true }).parse(
        buffer,
      );

      assert.deepStrictEqual(
        result,
        { numbers: [1, 2] },
        "SET OF should collect items into array",
      );
    });

    it("throws when required SET OF is missing", () => {
      const schema = PSchema.constructed("setReq", { tagNumber: 17 }, [
        PSchema.repeated(
          "items",
          {},
          PSchema.primitive("item", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
            new DataView(ab).getUint8(0),
          ),
        ),
      ]);

      const emptySet = fromHexString("3100");

      assert.throws(
        () => new SchemaParser(schema).parse(emptySet),
        /required|missing/i,
        "should throw when required SET OF has no items",
      );
    });
  });

  describe("error cases", () => {
    it("throws on unknown child in SET", () => {
      const schema = PSchema.constructed("set", { tagNumber: 17 }, [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ]);

      // id + unexpected UTF8String
      const buffer = fromHexString("31060201070c0161");

      assert.throws(
        () => new SchemaParser(schema).parse(buffer),
        /unknown|unexpected/i,
        "should throw on unknown child in SET",
      );
    });

    it("throws on duplicate non-repeated field", () => {
      const schema = PSchema.constructed("setDup", { tagNumber: 17 }, [
        PSchema.primitive("id", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ]);

      // Two INTEGER children with same tag (duplicate)
      const buffer = fromHexString("3106020107020102");

      assert.throws(
        () => new SchemaParser(schema, { strict: false }).parse(buffer),
        /unexpected|extra/i,
        "should throw when non-repeated field appears twice",
      );
    });
  });
});

describe("SchemaParser: Edge Cases and Special Behaviors", () => {
  describe("empty constructed containers", () => {
    it("returns empty object for constructed with no fields", () => {
      const emptySchema = PSchema.constructed("empty", {}, []);
      const buffer = fromHexString("3000"); // empty SEQUENCE

      const result = new SchemaParser(emptySchema).parse(buffer);
      assert.deepStrictEqual(result, {});
    });
  });

  describe("nested constructed parsing", () => {
    it("parses nested constructed child correctly", () => {
      const innerBox = PSchema.constructed("box", { tagNumber: 16 }, [
        PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ]);
      const outerSchema = PSchema.constructed("outer", { tagNumber: 16 }, [
        innerBox,
      ]);

      // Outer SEQUENCE(30) len 5, inner SEQUENCE(30) len 3, INTEGER(02) len 1 val 7
      const buffer = fromHexString("30053003020107");
      const result = new SchemaParser(outerSchema).parse(buffer);

      assert.deepStrictEqual(
        result,
        { box: { n: 7 } },
        "should correctly parse nested constructed",
      );
    });

    it("throws when required constructed field does not match", () => {
      const innerBox = PSchema.constructed("box", { tagNumber: 16 }, [
        PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      ]);
      const schema = PSchema.constructed("outer", { tagNumber: 16 }, [innerBox]);

      // Just an INTEGER, missing the constructed child
      const buffer = fromHexString("3003020107");

      assert.throws(
        () => new SchemaParser(schema, { strict: true }).parse(buffer),
        /mismatch|required/i,
        "should throw when required constructed field is missing",
      );
    });
  });

  describe("default decode behavior", () => {
    it("returns raw ArrayBuffer when no decode function provided", () => {
      const primitiveSchema = PSchema.primitive("octets", { tagNumber: 0x04 });
      const buffer = fromHexString("04024869"); // OCTET STRING 'Hi'

      const result = new SchemaParser(primitiveSchema).parse(buffer);

      assert.ok(
        result instanceof ArrayBuffer,
        "should return ArrayBuffer when no decode function",
      );

      const text = new TextDecoder("utf-8").decode(result as ArrayBuffer);
      assert.strictEqual(text, "Hi");
    });
  });

  describe("top-level repeated schema guard", () => {
    it("throws for top-level repeated schema (must be wrapped)", () => {
      const repeatedSchema = PSchema.repeated(
        "items",
        {},
        PSchema.primitive("n", { tagNumber: 0x02 }, (ab: ArrayBuffer) =>
          new DataView(ab).getUint8(0),
        ),
      );

      const buffer = fromHexString("020101");

      assert.throws(
        () => new SchemaParser(repeatedSchema as any).parse(buffer),
        /top-level|repeated/i,
        "top-level repeated schema should be rejected",
      );
    });
  });
});
