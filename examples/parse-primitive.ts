import { BasicTLVParser } from "@aokiapp/tlv/parser";

const buffer = new Uint8Array([0x04, 0x03, 0x41, 0x42, 0x43]).buffer;
const result = BasicTLVParser.parse(buffer);
console.log(result);
// {
//   tag: { tagClass: TagClass.Universal, tagNumber: 4, constructed: false },
//   length: 3,
//   value: ArrayBuffer([...]),
//   endOffset: 5
// }
