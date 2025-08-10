import { BasicTLVBuilder } from "@aokiapp/tlv/builder";
import { TagClass } from "@aokiapp/tlv/common";

const tlv = {
  tag: { tagClass: TagClass.Universal, tagNumber: 0x04, constructed: false },
  length: 3,
  value: new TextEncoder().encode("Hi!").buffer,
  endOffset: 0,
};
const encoded = BasicTLVBuilder.build(tlv);
console.log(new Uint8Array(encoded)); // [0x04, 0x03, 0x48, 0x69, 0x21]
