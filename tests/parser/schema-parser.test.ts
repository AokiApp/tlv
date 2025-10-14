import { describe, expect, test } from "vitest";
import { SchemaParser, Schema, TagClass } from "../../src/parser";
import { TestData, Decoders, CommonTags, ExpectHelpers } from "./test-helpers";

describe("SchemaParser - Schema-based parsing functionality", () => {
  describe("Primitive schema parsing", () => {
    test("should parse primitive field with default decoding", () => {
      // Given: A primitive schema without custom decoder
      const schema = Schema.primitive(
        "data",
        undefined,
        CommonTags.OCTET_STRING,
      );
      const parser = new SchemaParser(schema);
      const testBuffer = TestData.createTlvBuffer(
        0x04,
        TestData.createStringBuffer("hello"),
      );

      // When: Parsing with schema
      const result = parser.parse(testBuffer);

      // Then: Should return raw ArrayBuffer
      ExpectHelpers.expectArrayBuffer(result);
      const decoder = new TextDecoder();
      expect(decoder.decode(result)).toBe("hello");
    });

    test("should parse primitive field with string decoding", () => {
      // Given: A primitive schema with string decoder
      const schema = Schema.primitive(
        "message",
        Decoders.string,
        CommonTags.UTF8_STRING,
      );
      const parser = new SchemaParser(schema);
      const testBuffer = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("Hello World"),
      );

      // When: Parsing with schema
      const result = parser.parse(testBuffer);

      // Then: Should return decoded string
      ExpectHelpers.expectStringValue(result, "Hello World");
    });

    test("should parse primitive field with number decoding", () => {
      // Given: A primitive schema with number decoder
      const schema = Schema.primitive(
        "count",
        Decoders.integer,
        CommonTags.INTEGER,
      );
      const parser = new SchemaParser(schema);
      const testBuffer = TestData.createTlvBuffer(
        0x02,
        TestData.createBuffer([0x01, 0x00]),
      ); // 256

      // When: Parsing with schema
      const result = parser.parse(testBuffer);

      // Then: Should return decoded number
      ExpectHelpers.expectNumberValue(result, 256);
    });

    test("should parse primitive field with boolean decoding", () => {
      // Given: A primitive schema with boolean decoder
      const schema = Schema.primitive(
        "enabled",
        Decoders.boolean,
        CommonTags.BOOLEAN,
      );
      const parser = new SchemaParser(schema);
      const testBuffer = TestData.createTlvBuffer(
        0x01,
        TestData.createBuffer([0xff]),
      );

      // When: Parsing with schema
      const result = parser.parse(testBuffer);

      // Then: Should return decoded boolean
      ExpectHelpers.expectBooleanValue(result, true);
    });
  });

  describe("Constructed schema parsing", () => {
    test("should parse SEQUENCE with multiple primitive fields", () => {
      // Given: A SEQUENCE schema with name and age fields
      const nameSchema = Schema.primitive(
        "name",
        Decoders.string,
        CommonTags.UTF8_STRING,
      );
      const ageSchema = Schema.primitive(
        "age",
        Decoders.singleByte,
        CommonTags.INTEGER,
      );
      const personSchema = Schema.constructed(
        "person",
        [nameSchema, ageSchema],
        CommonTags.SEQUENCE,
      );

      // Create test data: SEQUENCE containing UTF8String "Alice" and INTEGER 30
      const nameData = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("Alice"),
      );
      const ageData = TestData.createTlvBuffer(
        0x02,
        TestData.createBuffer([30]),
      );
      const sequenceBuffer = TestData.createConstructedTlvBuffer(0x30, [
        nameData,
        ageData,
      ]);

      const parser = new SchemaParser(personSchema);

      // When: Parsing with schema
      const result = parser.parse(sequenceBuffer);

      // Then: Should return structured object
      ExpectHelpers.expectObjectStructure(result, ["name", "age"]);
      ExpectHelpers.expectStringValue(result.name, "Alice");
      ExpectHelpers.expectNumberValue(result.age, 30);
    });

    test("should parse nested SEQUENCE structures", () => {
      // Given: Nested SEQUENCE schema (person with address)
      const addressSchema = Schema.constructed(
        "address",
        [
          Schema.primitive("street", Decoders.string, CommonTags.UTF8_STRING),
          Schema.primitive("city", Decoders.string, CommonTags.UTF8_STRING),
        ],
        CommonTags.SEQUENCE,
      );

      const personSchema = Schema.constructed(
        "person",
        [
          Schema.primitive("name", Decoders.string, CommonTags.UTF8_STRING),
          addressSchema,
        ],
        CommonTags.SEQUENCE,
      );

      // Create nested test data
      const streetData = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("123 Main St"),
      );
      const cityData = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("Anytown"),
      );
      const addressSequence = TestData.createConstructedTlvBuffer(0x30, [
        streetData,
        cityData,
      ]);

      const nameData = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("Bob"),
      );
      const personSequence = TestData.createConstructedTlvBuffer(0x30, [
        nameData,
        addressSequence,
      ]);

      const parser = new SchemaParser(personSchema);

      // When: Parsing with schema
      const result = parser.parse(personSequence);

      // Then: Should return nested structured object
      ExpectHelpers.expectObjectStructure(result, ["name", "address"]);
      ExpectHelpers.expectStringValue(result.name, "Bob");
      ExpectHelpers.expectObjectStructure(result.address, ["street", "city"]);
      ExpectHelpers.expectStringValue(result.address.street, "123 Main St");
      ExpectHelpers.expectStringValue(result.address.city, "Anytown");
    });
  });

  describe("Tag validation", () => {
    test("should validate tag class matches schema expectation", () => {
      // Given: Schema expecting Application tag but data has Universal tag
      const schema = Schema.primitive("field", Decoders.string, {
        tagClass: TagClass.Application,
        tagNumber: 1,
      });
      const parser = new SchemaParser(schema);
      const testBuffer = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("test"),
      ); // Universal UTF8String

      // When/Then: Should throw tag class mismatch error
      expect(() => parser.parse(testBuffer)).toThrow(/tag class mismatch/i);
    });

    test("should validate tag number matches schema expectation", () => {
      // Given: Schema expecting tag number 5 but data has tag number 4
      const schema = Schema.primitive("field", Decoders.string, {
        tagClass: TagClass.Universal,
        tagNumber: 5,
      });
      const parser = new SchemaParser(schema);
      const testBuffer = TestData.createTlvBuffer(
        0x04,
        TestData.createStringBuffer("test"),
      ); // OCTET_STRING (tag 4)

      // When/Then: Should throw tag number mismatch error
      expect(() => parser.parse(testBuffer)).toThrow(/tag number mismatch/i);
    });

    test("should validate constructed flag matches schema expectation", () => {
      // Given: Primitive schema but data is constructed
      const schema = Schema.primitive(
        "field",
        Decoders.string,
        CommonTags.OCTET_STRING,
      );
      const parser = new SchemaParser(schema);

      // Create constructed TLV (with constructed bit set)
      const childData = TestData.createTlvBuffer(
        0x04,
        TestData.createStringBuffer("child"),
      );
      const constructedBuffer = TestData.createConstructedTlvBuffer(0x04, [
        childData,
      ]); // This will set constructed bit

      // When/Then: Should throw constructed flag mismatch error
      expect(() => parser.parse(constructedBuffer)).toThrow(
        /constructed flag mismatch/i,
      );
    });
  });

  describe("Context-specific and Application tags", () => {
    test("should parse Context-specific tags correctly", () => {
      // Given: Schema with Context-specific tag [0]
      const schema = Schema.primitive(
        "optional",
        Decoders.string,
        CommonTags.CONTEXT_SPECIFIC_0,
      );
      const parser = new SchemaParser(schema);
      const testBuffer = TestData.createTlvBuffer(
        0x80,
        TestData.createStringBuffer("context data"),
      );

      // When: Parsing with schema
      const result = parser.parse(testBuffer);

      // Then: Should parse successfully
      ExpectHelpers.expectStringValue(result, "context data");
    });

    test("should parse Application tags correctly", () => {
      // Given: Schema with Application tag [1]
      const schema = Schema.primitive(
        "version",
        Decoders.singleByte,
        CommonTags.APPLICATION_1,
      );
      const parser = new SchemaParser(schema);
      const testBuffer = TestData.createTlvBuffer(
        0x41,
        TestData.createBuffer([0x02]),
      );

      // When: Parsing with schema
      const result = parser.parse(testBuffer);

      // Then: Should parse successfully
      ExpectHelpers.expectNumberValue(result, 2);
    });

    test("should parse Private tags correctly", () => {
      // Given: Schema with Private tag [0]
      const schema = Schema.primitive(
        "private_data",
        Decoders.uint8Array,
        CommonTags.PRIVATE_0,
      );
      const parser = new SchemaParser(schema);
      const testBuffer = TestData.createTlvBuffer(
        0xc0,
        TestData.createBuffer([0xff, 0xee, 0xdd]),
      );

      // When: Parsing with schema
      const result = parser.parse(testBuffer);

      // Then: Should parse successfully
      ExpectHelpers.expectUint8ArrayBytes(result, [0xff, 0xee, 0xdd]);
    });
  });

  describe("Asynchronous parsing", () => {
    test("should parse asynchronously with async decoder", async () => {
      // Given: Schema with async decoder
      const schema = Schema.primitive(
        "asyncField",
        Decoders.asyncString,
        CommonTags.UTF8_STRING,
      );
      const parser = new SchemaParser(schema);
      const testBuffer = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("async test"),
      );

      // When: Parsing asynchronously
      const result = await parser.parse(testBuffer, { async: true });

      // Then: Should return decoded string
      ExpectHelpers.expectStringValue(result, "async test");
    });

    test("should parse nested structures with mixed sync/async decoders", async () => {
      // Given: Schema with both sync and async decoders
      const syncSchema = Schema.primitive(
        "sync",
        Decoders.string,
        CommonTags.UTF8_STRING,
      );
      const asyncSchema = Schema.primitive(
        "async",
        Decoders.asyncString,
        CommonTags.UTF8_STRING,
      );
      const mixedSchema = Schema.constructed(
        "mixed",
        [syncSchema, asyncSchema],
        CommonTags.SEQUENCE,
      );

      // Create test data
      const syncData = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("sync_data"),
      );
      const asyncData = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("async_data"),
      );
      const sequenceBuffer = TestData.createConstructedTlvBuffer(0x30, [
        syncData,
        asyncData,
      ]);

      const parser = new SchemaParser(mixedSchema);

      // When: Parsing asynchronously
      const result = await parser.parse(sequenceBuffer, { async: true });

      // Then: Should handle mixed sync/async correctly
      ExpectHelpers.expectObjectStructure(result, ["sync", "async"]);
      ExpectHelpers.expectStringValue(result.sync, "sync_data");
      ExpectHelpers.expectStringValue(result.async, "async_data");
    });
  });

  describe("Error handling", () => {
    test("should handle malformed TLV data gracefully", () => {
      // Given: Schema and malformed TLV data (invalid length encoding)
      const schema = Schema.primitive(
        "data",
        Decoders.string,
        CommonTags.OCTET_STRING,
      );
      const parser = new SchemaParser(schema);
      const malformedBuffer = TestData.createBuffer([0x04, 0x85]); // Says it has 5-byte length but no length bytes follow

      // When/Then: Should throw appropriate error
      expect(() => parser.parse(malformedBuffer)).toThrow();
    });

    test("should handle empty buffer gracefully", () => {
      // Given: Schema and empty buffer
      const schema = Schema.primitive(
        "data",
        Decoders.string,
        CommonTags.OCTET_STRING,
      );
      const parser = new SchemaParser(schema);
      const emptyBuffer = new ArrayBuffer(0);

      // When/Then: Should throw appropriate error
      expect(() => parser.parse(emptyBuffer)).toThrow();
    });
  });

  describe("Optional fields", () => {
    test("should ignore missing optional primitive fields", () => {
      const nicknameSchema = Schema.primitive(
        "nickname",
        Decoders.string,
        {
          ...CommonTags.CONTEXT_SPECIFIC_0,
          optional: true,
        },
      );
      const nameSchema = Schema.primitive(
        "name",
        Decoders.string,
        CommonTags.UTF8_STRING,
      );
      const ageSchema = Schema.primitive(
        "age",
        Decoders.singleByte,
        CommonTags.INTEGER,
      );
      const personSchema = Schema.constructed(
        "person",
        [nicknameSchema, nameSchema, ageSchema],
        CommonTags.SEQUENCE,
      );

      const nameField = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("Alice"),
      );
      const ageField = TestData.createTlvBuffer(
        0x02,
        TestData.createBuffer([30]),
      );
      const sequenceBuffer = TestData.createConstructedTlvBuffer(0x30, [
        nameField,
        ageField,
      ]);

      const parser = new SchemaParser(personSchema);
      const result = parser.parse(sequenceBuffer) as {
        nickname?: string;
        name: string;
        age: number;
      };

      expect(result.nickname).toBeUndefined();
      expect(result.name).toBe("Alice");
      expect(result.age).toBe(30);
    });

    test("should parse optional primitive when present", () => {
      const nicknameSchema = Schema.primitive(
        "nickname",
        Decoders.string,
        {
          ...CommonTags.CONTEXT_SPECIFIC_0,
          optional: true,
        },
      );
      const nameSchema = Schema.primitive(
        "name",
        Decoders.string,
        CommonTags.UTF8_STRING,
      );
      const ageSchema = Schema.primitive(
        "age",
        Decoders.singleByte,
        CommonTags.INTEGER,
      );
      const personSchema = Schema.constructed(
        "person",
        [nicknameSchema, nameSchema, ageSchema],
        CommonTags.SEQUENCE,
      );

      const nicknameField = TestData.createTlvBuffer(
        0x80,
        TestData.createStringBuffer("Al"),
      );
      const nameField = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("Alice"),
      );
      const ageField = TestData.createTlvBuffer(
        0x02,
        TestData.createBuffer([30]),
      );
      const sequenceBuffer = TestData.createConstructedTlvBuffer(0x30, [
        nicknameField,
        nameField,
        ageField,
      ]);

      const parser = new SchemaParser(personSchema);
      const result = parser.parse(sequenceBuffer) as {
        nickname?: string;
        name: string;
        age: number;
      };

      expect(result.nickname).toBe("Al");
      expect(result.name).toBe("Alice");
      expect(result.age).toBe(30);
    });
  });

  describe("Default values", () => {
    test("should use default when field is omitted", () => {
      const statusSchema = Schema.primitive(
        "status",
        Decoders.integer,
        {
          tagClass: TagClass.ContextSpecific,
          tagNumber: 0,
          defaultValue: 0,
        },
      );
      const amountSchema = Schema.primitive(
        "amount",
        Decoders.integer,
        CommonTags.INTEGER,
      );
      const paymentSchema = Schema.constructed(
        "payment",
        [statusSchema, amountSchema],
        CommonTags.SEQUENCE,
      );

      const amountField = TestData.createTlvBuffer(
        0x02,
        TestData.createBuffer([0x01]),
      );
      const sequenceBuffer = TestData.createConstructedTlvBuffer(0x30, [
        amountField,
      ]);

      const parser = new SchemaParser(paymentSchema);
      const result = parser.parse(sequenceBuffer) as {
        status: number;
        amount: number;
      };

      expect(result.status).toBe(0);
      expect(result.amount).toBe(1);
    });

    test("should override default when value present", () => {
      const statusSchema = Schema.primitive(
        "status",
        Decoders.integer,
        {
          tagClass: TagClass.ContextSpecific,
          tagNumber: 0,
          defaultValue: 0,
        },
      );
      const amountSchema = Schema.primitive(
        "amount",
        Decoders.integer,
        CommonTags.INTEGER,
      );
      const paymentSchema = Schema.constructed(
        "payment",
        [statusSchema, amountSchema],
        CommonTags.SEQUENCE,
      );

      const statusField = TestData.createTlvBuffer(
        0x80,
        TestData.createBuffer([0x02]),
      );
      const amountField = TestData.createTlvBuffer(
        0x02,
        TestData.createBuffer([0x05]),
      );
      const sequenceBuffer = TestData.createConstructedTlvBuffer(0x30, [
        statusField,
        amountField,
      ]);

      const parser = new SchemaParser(paymentSchema);
      const result = parser.parse(sequenceBuffer) as {
        status: number;
        amount: number;
      };

      expect(result.status).toBe(2);
      expect(result.amount).toBe(5);
    });
  });

  describe("Choice schemas", () => {
    test("should parse primitive choice option", () => {
      const contactChoice = Schema.choice("contact", [
        {
          name: "email",
          schema: Schema.primitive(
            "email",
            Decoders.string,
            CommonTags.UTF8_STRING,
          ),
        },
        {
          name: "phone",
          schema: Schema.primitive(
            "phone",
            Decoders.string,
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

      const emailField = TestData.createTlvBuffer(
        0x0c,
        TestData.createStringBuffer("alice@example.com"),
      );
      const personBuffer = TestData.createConstructedTlvBuffer(0x30, [
        emailField,
      ]);

      const parser = new SchemaParser(personSchema);
      const result = parser.parse(personBuffer) as {
        contact: { type: string; value: unknown };
      };

      expect(result.contact.type).toBe("email");
      expect(result.contact.value).toBe("alice@example.com");
    });

    test("should parse context-specific choice option", () => {
      const contactChoice = Schema.choice("contact", [
        {
          name: "email",
          schema: Schema.primitive(
            "email",
            Decoders.string,
            CommonTags.UTF8_STRING,
          ),
        },
        {
          name: "phone",
          schema: Schema.primitive(
            "phone",
            Decoders.string,
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

      const phoneField = TestData.createTlvBuffer(
        0x80,
        TestData.createStringBuffer("12345"),
      );
      const personBuffer = TestData.createConstructedTlvBuffer(0x30, [
        phoneField,
      ]);

      const parser = new SchemaParser(personSchema);
      const result = parser.parse(personBuffer) as {
        contact: { type: string; value: unknown };
      };

      expect(result.contact.type).toBe("phone");
      expect(result.contact.value).toBe("12345");
    });
  });
});

test("should accept any SET order when strict: false", () => {
  const setSchema = Schema.constructed(
    "unorderedSet",
    [
      Schema.primitive("high", Decoders.string, { tagNumber: 5 }),
      Schema.primitive("low", Decoders.string, { tagNumber: 1 }),
      Schema.primitive("middle", Decoders.string, { tagNumber: 3 }),
    ],
    CommonTags.SET,
  );

  // Create a buffer with SET elements in non-DER order
  const buffers = [
    TestData.createTlvBuffer(0x05, TestData.createStringBuffer("high")),
    TestData.createTlvBuffer(0x01, TestData.createStringBuffer("low")),
    TestData.createTlvBuffer(0x03, TestData.createStringBuffer("middle")),
  ];
  const setValue = TestData.concatBuffers(buffers);
  const setBuffer = TestData.createTlvBuffer(0x31, setValue); // SET tag

  // strict: false should accept any order
  const parser = new SchemaParser(setSchema, { strict: false });
  const result = parser.parse(setBuffer);

  expect(result.high).toBe("high");
  expect(result.low).toBe("low");
  expect(result.middle).toBe("middle");
});

test("should enforce DER SET order when strict: true", () => {
  const setSchema = Schema.constructed(
    "orderedSet",
    [
      Schema.primitive("high", Decoders.string, { tagNumber: 5 }),
      Schema.primitive("low", Decoders.string, { tagNumber: 1 }),
      Schema.primitive("middle", Decoders.string, { tagNumber: 3 }),
    ],
    CommonTags.SET,
  );

  // Create a buffer with SET elements in non-DER order
  const buffers = [
    TestData.createTlvBuffer(0x05, TestData.createStringBuffer("high")),
    TestData.createTlvBuffer(0x01, TestData.createStringBuffer("low")),
    TestData.createTlvBuffer(0x03, TestData.createStringBuffer("middle")),
  ];
  const setValue = TestData.concatBuffers(buffers);
  const setBuffer = TestData.createTlvBuffer(0x31, setValue); // SET tag

  // strict: true should enforce DER order and may throw if order is wrong
  const parser = new SchemaParser(setSchema, { strict: true });
  let threw = false;
  try {
    parser.parse(setBuffer);
  } catch (e) {
    threw = true;
  }
  expect(threw).toBe(true);
});
