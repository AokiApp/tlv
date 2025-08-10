import { SchemaBuilder, Schema } from "@aokiapp/tlv/builder";
import { TagClass } from "@aokiapp/tlv/common";

// Helper functions for encoding
const encodeUint8 = (n: number): ArrayBuffer => new Uint8Array([n]).buffer;
const encodeText = (s: string): ArrayBuffer =>
  new TextEncoder().encode(s).buffer;

// Define a realistic "person" schema for building
const personSchema = Schema.constructed(
  "person",
  [
    Schema.primitive("age", encodeUint8, { tagNumber: 0x02 }),
    Schema.primitive("name", encodeText, { tagNumber: 0x0c }),
  ],
  { tagClass: TagClass.Universal, tagNumber: 0x10 },
);

const builder = new SchemaBuilder(personSchema);
const built = builder.build({ age: 30, name: "Alice" }); // Synchronous
console.log(new Uint8Array(built)); // TLV-encoded person structure
