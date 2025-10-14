import { describe, expect, test } from "vitest";
import {
  Schema as ParserSchema,
  SchemaParser,
  TagClass,
} from "../../src/parser";
import { TestData } from "../parser/test-helpers";

describe("Parser Schema.repeated() strictness and ordering", () => {
  test("repeated UTF8String parses in given order (SEQUENCE semantics)", () => {
    // Prepare SEQUENCE OF UTF8String: [ "one", "two" ]
    const utf8One = TestData.createTlvBuffer(
      0x0c,
      TestData.createStringBuffer("one"),
    );
    const utf8Two = TestData.createTlvBuffer(
      0x0c,
      TestData.createStringBuffer("two"),
    );
    const seq = TestData.createConstructedTlvBuffer(0x30, [utf8One, utf8Two]); // 0x30 = SEQUENCE constructed

    const item = ParserSchema.primitive(
      "item",
      (buf: ArrayBuffer) => new TextDecoder().decode(buf),
      {
        tagClass: TagClass.Universal,
        tagNumber: 12,
      },
    );
    const seqSchema = ParserSchema.repeated("items", item);

    const parser = new SchemaParser(seqSchema);
    const parsed = parser.parse(seq);
    expect(parsed).toEqual(["one", "two"]);
  });

  test("repeated tagNumber 17 strict mode: rejects non-DER ordering", () => {
    // Prepare SET OF UTF8String with non-DER order [ "beta", "alpha" ]
    const alpha = TestData.createTlvBuffer(
      0x0c,
      TestData.createStringBuffer("alpha"),
    );
    const beta = TestData.createTlvBuffer(
      0x0c,
      TestData.createStringBuffer("beta"),
    );
    const setNonDer = TestData.createConstructedTlvBuffer(0x31, [alpha, beta]); // 0x31 = SET constructed (non-DER order)

    const item = ParserSchema.primitive(
      "item",
      (buf: ArrayBuffer) => new TextDecoder().decode(buf),
      {
        tagClass: TagClass.Universal,
        tagNumber: 12,
      },
    );
    const setSchema = ParserSchema.repeated("items", item, { tagNumber: 17 });

    const parserStrict = new SchemaParser(setSchema, { strict: true });
    expect(() => parserStrict.parse(setNonDer)).toThrow(
      /DER lexicographic order/i,
    );

    const parserLenient = new SchemaParser(setSchema, { strict: false });
    const parsedLenient = parserLenient.parse(setNonDer);
    expect(parsedLenient).toEqual(["alpha", "beta"]);
  });

  test("repeated tagNumber 17 strict mode: accepts DER ordering", () => {
    // Build DER-sorted order manually ["alpha","beta"]
    const alpha = TestData.createTlvBuffer(
      0x0c,
      TestData.createStringBuffer("alpha"),
    );
    const beta = TestData.createTlvBuffer(
      0x0c,
      TestData.createStringBuffer("beta"),
    );
    const setDer = TestData.createConstructedTlvBuffer(0x31, [beta, alpha]);

    const item = ParserSchema.primitive(
      "item",
      (buf: ArrayBuffer) => new TextDecoder().decode(buf),
      {
        tagClass: TagClass.Universal,
        tagNumber: 12,
      },
    );
    const setSchema = ParserSchema.repeated("items", item, { tagNumber: 17 });

    const parserStrict = new SchemaParser(setSchema, { strict: true });
    const parsed = parserStrict.parse(setDer);
    expect(parsed).toEqual(["beta", "alpha"]);
  });
});
