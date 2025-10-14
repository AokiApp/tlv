import { describe, expect, test } from "vitest";

import { SchemaBuilder, Schema, TagClass } from "../../src/builder";
import {
  Schema as ParserSchema,
  SchemaParser,
  TagClass as ParserTagClass,
} from "../../src/parser";
import type { BuildData } from "../../src/builder/schema-builder";
import { Encoders, CommonTags, ExpectHelpers } from "./test-helpers";

describe("SchemaBuilder - Constructed schemas", () => {
  test("should build SEQUENCE with multiple primitive fields", () => {
    const nameSchema = Schema.primitive(
      "name",
      Encoders.string,
      CommonTags.UTF8_STRING,
    );
    const ageSchema = Schema.primitive(
      "age",
      Encoders.singleByte,
      CommonTags.INTEGER,
    );
    const personSchema = Schema.constructed(
      "person",
      [nameSchema, ageSchema],
      CommonTags.SEQUENCE,
    );

    const builder = new SchemaBuilder(personSchema);
    const result = builder.build({
      name: "Alice",
      age: 30,
    });

    // Verify ArrayBuffer output with nested structure
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);

    // Verify outer SEQUENCE is properly constructed
    ExpectHelpers.expectTagInfo(result, {
      ...CommonTags.SEQUENCE,
      constructed: true,
    });
    ExpectHelpers.expectValidDerEncoding(result);
  });

  test("should build nested SEQUENCE structures", () => {
    const addressSchema = Schema.constructed(
      "address",
      [
        Schema.primitive("street", Encoders.string, CommonTags.UTF8_STRING),
        Schema.primitive("city", Encoders.string, CommonTags.UTF8_STRING),
      ],
      CommonTags.SEQUENCE,
    );

    const personSchema = Schema.constructed(
      "person",
      [
        Schema.primitive("name", Encoders.string, CommonTags.UTF8_STRING),
        addressSchema,
      ],
      CommonTags.SEQUENCE,
    );

    const builder = new SchemaBuilder(personSchema);
    // 型安全なBuildData型で明示
    const result = builder.build({
      name: "Bob",
      address: {
        street: "123 Main St",
        city: "Anytown",
      },
    } as unknown as BuildData<typeof personSchema>);

    // Verify ArrayBuffer output
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);

    // Verify DER-encoded SEQUENCE structure
    ExpectHelpers.expectTagInfo(result, {
      ...CommonTags.SEQUENCE,
      constructed: true,
    });
    ExpectHelpers.expectValidDerEncoding(result);
  });

  test("should build SET with unordered fields", () => {
    const attributesSchema = Schema.constructed(
      "attributes",
      [
        Schema.primitive<string, string>(
          "role",
          Encoders.string,
          CommonTags.UTF8_STRING,
        ),
        Schema.primitive<string, string>(
          "department",
          Encoders.string,
          CommonTags.UTF8_STRING,
        ),
      ],
      CommonTags.SET,
    );

    const builder = new SchemaBuilder(attributesSchema);
    const result = builder.build({
      role: "admin",
      department: "IT",
    });

    // Verify ArrayBuffer output for SET
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);

    // Verify DER-encoded SET structure
    ExpectHelpers.expectTagInfo(result, {
      ...CommonTags.SET,
      constructed: true,
    });
    ExpectHelpers.expectValidDerEncoding(result);
  });

  test("should handle empty constructed structures", () => {
    const emptySchema = Schema.constructed("empty", [], CommonTags.SEQUENCE);
    const builder = new SchemaBuilder(emptySchema);

    const result = builder.build({});

    // Verify empty constructed structure produces minimal DER encoding
    expect(result).toBeInstanceOf(ArrayBuffer);

    // Empty SEQUENCE should be: 30 00 (tag + zero length)
    expect(result.byteLength).toBe(2);
    ExpectHelpers.expectTagInfo(result, {
      ...CommonTags.SEQUENCE,
      constructed: true,
    });
    ExpectHelpers.expectBufferBytes(result, [0x30, 0x00]);
  });

  test("should skip optional fields when data is not provided", () => {
    const nicknameSchema = Schema.primitive(
      "nickname",
      Encoders.string,
      { ...CommonTags.CONTEXT_SPECIFIC_0, optional: true },
    );
    const nameSchema = Schema.primitive(
      "name",
      Encoders.string,
      CommonTags.UTF8_STRING,
    );
    const ageSchema = Schema.primitive(
      "age",
      Encoders.singleByte,
      CommonTags.INTEGER,
    );
    const personSchema = Schema.constructed(
      "person",
      [nicknameSchema, nameSchema, ageSchema],
      CommonTags.SEQUENCE,
    );

    const builder = new SchemaBuilder(personSchema);
    const encoded = builder.build({
      name: "Alice",
      age: 30,
    });

    const decodeString = (buffer: ArrayBuffer) =>
      new TextDecoder().decode(buffer);
    const decodeAge = (buffer: ArrayBuffer) => new Uint8Array(buffer)[0];
    const parserSchema = ParserSchema.constructed(
      "person",
      [
        ParserSchema.primitive("nickname", decodeString, {
          tagClass: ParserTagClass.ContextSpecific,
          tagNumber: 0,
          optional: true,
        }),
        ParserSchema.primitive("name", decodeString, {
          tagClass: ParserTagClass.Universal,
          tagNumber: 12,
        }),
        ParserSchema.primitive("age", decodeAge, {
          tagClass: ParserTagClass.Universal,
          tagNumber: 2,
        }),
      ],
      {
        tagClass: ParserTagClass.Universal,
        tagNumber: 16,
      },
    );

    const parser = new SchemaParser(parserSchema);
    const parsed = parser.parse(encoded) as {
      nickname?: string;
      name: string;
      age: number;
    };

    expect(parsed.nickname).toBeUndefined();
    expect(parsed.name).toBe("Alice");
    expect(parsed.age).toBe(30);
  });

  test("should omit primitive field when value equals default", () => {
    const statusSchema = Schema.primitive(
      "status",
      Encoders.number,
      {
        tagClass: TagClass.ContextSpecific,
        tagNumber: 0,
        defaultValue: 0,
      },
    );
    const amountSchema = Schema.primitive(
      "amount",
      Encoders.number,
      CommonTags.INTEGER,
    );
    const paymentSchema = Schema.constructed(
      "payment",
      [statusSchema, amountSchema],
      CommonTags.SEQUENCE,
    );

    const builder = new SchemaBuilder(paymentSchema);
    const encoded = builder.build({
      amount: 5,
    } as BuildData<typeof paymentSchema>);

    const decodeInteger = (buffer: ArrayBuffer) => {
      const view = new Uint8Array(buffer);
      let value = 0;
      for (const byte of view) {
        value = (value << 8) | byte;
      }
      return value;
    };

    const parserSchema = ParserSchema.constructed(
      "payment",
      [
        ParserSchema.primitive("status", decodeInteger, {
          tagClass: ParserTagClass.ContextSpecific,
          tagNumber: 0,
          defaultValue: 0,
        }),
        ParserSchema.primitive("amount", decodeInteger, {
          tagClass: ParserTagClass.Universal,
          tagNumber: 2,
        }),
      ],
      {
        tagClass: ParserTagClass.Universal,
        tagNumber: 16,
      },
    );
    const parser = new SchemaParser(parserSchema);
    const parsed = parser.parse(encoded) as {
      status: number;
      amount: number;
    };

    expect(parsed.status).toBe(0);
    expect(parsed.amount).toBe(5);

    const encodedView = new Uint8Array(encoded);
    // Outer sequence tag (0x30) + length + inner INTEGER
    expect(encodedView[0]).toBe(0x30);
    // Should only contain one INTEGER child (amount)
    const childContentLength = encodedView[1];
    expect(childContentLength).toBe(encoded.byteLength - 2);
  });

  test("should build choice variant and roundtrip", () => {
    const contactChoice = Schema.choice("contact", [
      {
        name: "email",
        schema: Schema.primitive(
          "email",
          Encoders.string,
          CommonTags.UTF8_STRING,
        ),
      },
      {
        name: "phone",
        schema: Schema.primitive(
          "phone",
          Encoders.string,
          {
            tagClass: TagClass.ContextSpecific,
            tagNumber: 0,
          },
        ),
      },
    ]);
    const personSchema = Schema.constructed(
      "person",
      [contactChoice],
      CommonTags.SEQUENCE,
    );

    const builder = new SchemaBuilder(personSchema);
    const encoded = builder.build({
      contact: {
        type: "phone",
        value: "12345",
      },
    } as BuildData<typeof personSchema>);

    const parserChoice = ParserSchema.choice("contact", [
      {
        name: "email",
        schema: ParserSchema.primitive(
          "email",
          (buffer: ArrayBuffer) => new TextDecoder().decode(buffer),
          {
            tagClass: ParserTagClass.Universal,
            tagNumber: 12,
          },
        ),
      },
      {
        name: "phone",
        schema: ParserSchema.primitive(
          "phone",
          (buffer: ArrayBuffer) => new TextDecoder().decode(buffer),
          {
            tagClass: ParserTagClass.ContextSpecific,
            tagNumber: 0,
          },
        ),
      },
    ]);
    const parserSchema = ParserSchema.constructed(
      "person",
      [parserChoice],
      {
        tagClass: ParserTagClass.Universal,
        tagNumber: 16,
      },
    );

    const parser = new SchemaParser(parserSchema);
    const parsed = parser.parse(encoded) as {
      contact: { type: string; value: string };
    };

    expect(parsed.contact.type).toBe("phone");
    expect(parsed.contact.value).toBe("12345");
  });
});
