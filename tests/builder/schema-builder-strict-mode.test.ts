import { describe, expect, test } from "vitest";
import { SchemaBuilder, Schema, TagClass } from "../../src/builder";
import { Encoders, CommonTags } from "./test-helpers";

function readLength(
  bytes: Uint8Array,
  offset: number,
): { length: number; newOffset: number } {
  let length = bytes[offset++];
  if (length & 0x80) {
    const numBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = (length << 8) | bytes[offset++];
    }
  }
  return { length, newOffset: offset };
}

function readTagNumber(
  bytes: Uint8Array,
  offset: number,
): { tagNumber: number; newOffset: number } {
  const firstByte = bytes[offset++];
  let tagNumber = firstByte & 0x1f;
  if (tagNumber === 0x1f) {
    tagNumber = 0;
    let b: number;
    do {
      b = bytes[offset++];
      tagNumber = (tagNumber << 7) | (b & 0x7f);
    } while (b & 0x80);
  }
  return { tagNumber, newOffset: offset };
}

function parseConstructedChildrenTagNumbers(buffer: ArrayBuffer): number[] {
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  // Read outer tag
  offset += 1;
  const lengthInfo = readLength(bytes, offset);
  offset = lengthInfo.newOffset;
  const end = offset + lengthInfo.length;
  const tags: number[] = [];
  while (offset < end) {
    const tagInfo = readTagNumber(bytes, offset);
    const lenInfo = readLength(bytes, tagInfo.newOffset);
    tags.push(tagInfo.tagNumber);
    offset = lenInfo.newOffset + lenInfo.length;
  }
  return tags;
}

function parseSetOfStrings(buffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  // Read outer tag
  offset += 1;
  const lengthInfo = readLength(bytes, offset);
  offset = lengthInfo.newOffset;
  const end = offset + lengthInfo.length;
  const out: string[] = [];
  const decoder = new TextDecoder();
  while (offset < end) {
    const tagInfo = readTagNumber(bytes, offset);
    const lenInfo = readLength(bytes, tagInfo.newOffset);
    const valueStart = lenInfo.newOffset;
    const valueEnd = valueStart + lenInfo.length;
    const valueBytes = bytes.slice(valueStart, valueEnd);
    out.push(decoder.decode(valueBytes));
    offset = valueEnd;
  }
  return out;
}

describe("SchemaBuilder strict mode consistency", () => {
  test("async SET OF sorts by DER when strict: true", async () => {
    const item = Schema.primitive<string, string>("item", Encoders.string, {
      tagClass: TagClass.Universal,
      tagNumber: 12,
    });
    const setSchema = Schema.setOf("items", item);
    const builder = new SchemaBuilder(setSchema, { strict: true });
    const encoded = await builder.build(["alpha", "beta"], { async: true });
    expect(new Uint8Array(encoded)[0]).toBe(0x31);
    expect(parseSetOfStrings(encoded)).toEqual(["beta", "alpha"]);
  });

  test("async SET OF preserves input order when strict: false", async () => {
    const item = Schema.primitive<string, string>("item", Encoders.string, {
      tagClass: TagClass.Universal,
      tagNumber: 12,
    });
    const setSchema = Schema.setOf("items", item);
    const builder = new SchemaBuilder(setSchema, { strict: false });
    const encoded = await builder.build(["alpha", "beta"], { async: true });
    expect(new Uint8Array(encoded)[0]).toBe(0x31);
    expect(parseSetOfStrings(encoded)).toEqual(["alpha", "beta"]);
  });

  test("async constructed SET sorts fields by DER tag order when strict: true", async () => {
    const setSchema = Schema.constructed(
      "orderedSet",
      [
        Schema.primitive("high", undefined, { tagNumber: 5 }),
        Schema.primitive("low", undefined, { tagNumber: 1 }),
        Schema.primitive("middle", undefined, { tagNumber: 3 }),
      ],
      CommonTags.SET,
    );
    const builder = new SchemaBuilder(setSchema, { strict: true });
    const result = await builder.build(
      {
        high: new ArrayBuffer(1),
        low: new ArrayBuffer(1),
        middle: new ArrayBuffer(1),
      },
      { async: true },
    );
    expect(new Uint8Array(result)[0]).toBe(0x31);
    expect(parseConstructedChildrenTagNumbers(result)).toEqual([1, 3, 5]);
  });

  test("async constructed SET preserves field order when strict: false", async () => {
    const setSchema = Schema.constructed(
      "unorderedSet",
      [
        Schema.primitive("high", undefined, { tagNumber: 5 }),
        Schema.primitive("low", undefined, { tagNumber: 1 }),
        Schema.primitive("middle", undefined, { tagNumber: 3 }),
      ],
      CommonTags.SET,
    );
    const builder = new SchemaBuilder(setSchema, { strict: false });
    const result = await builder.build(
      {
        high: new ArrayBuffer(1),
        low: new ArrayBuffer(1),
        middle: new ArrayBuffer(1),
      },
      { async: true },
    );
    expect(new Uint8Array(result)[0]).toBe(0x31);
    expect(parseConstructedChildrenTagNumbers(result)).toEqual([5, 1, 3]);
  });
});
