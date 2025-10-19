// tests/unit/tlv/basic-tlv.length-exceed.test.ts
import { describe, it } from "vitest";
import assert from "assert";
import { BasicTLVParser } from "../../../src/parser";
import { fromHexString } from "../../helpers/utils";

describe("BasicTLVParser.readValue: declared length exceeds available bytes", () => {
  it("short-form length: declared length 5 but only 2 bytes available -> throws", () => {
    // Tag: Private primitive (0xC1), Length: 0x05, Value: only 2 bytes (AA BB)
    const buf = fromHexString("c105aabb");
    assert.throws(() => BasicTLVParser.parse(buf));
  });

  it("long-form length: declared length 130 but only 1 byte available -> throws", () => {
    // Tag: Private primitive (0xC1), Length: long-form 0x81 0x82 (130), Value: only 1 byte (00)
    const buf = fromHexString("c1818200");
    assert.throws(() => BasicTLVParser.parse(buf));
  });
});