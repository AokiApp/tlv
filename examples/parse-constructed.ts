import { SchemaParser, Schema } from "@aokiapp/tlv/parser";
import { TagClass } from "@aokiapp/tlv/common";

// Helper functions for decoding
const decodeUint8 = (buffer: ArrayBuffer): number =>
  new DataView(buffer).getUint8(0);
const decodeText = (buffer: ArrayBuffer): string =>
  new TextDecoder().decode(buffer);

// Define a realistic "person" schema for parsing
const personSchema = Schema.constructed(
  "person",
  [
    Schema.primitive("age", decodeUint8, { tagNumber: 0x02 }),
    Schema.primitive("name", decodeText, { tagNumber: 0x0c }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 0x10 },
);

// Example TLV-encoded buffer for { age: 30, name: "Alice" }
const buffer = new Uint8Array([
  0x10,
  0x08, // Sequence tag and length
  0x02,
  0x01,
  0x1e, // age: 30
  0x0c,
  0x05,
  0x41,
  0x6c,
  0x69,
  0x63,
  0x65, // name: "Alice"
]).buffer;

const parser = new SchemaParser(personSchema);
const parsed = parser.parse(buffer);
console.log(parsed); // { age: 30, name: "Alice" }
