import { Schema, TagClass } from "../../src/parser";
import { decodeOffsets, decodePublicKey, decodeText } from "../helpers/utils";

export const schemaCertificate = Schema.constructed(
  "certificate",
  {
    tagClass: TagClass.Application,
    tagNumber: 0x21,
  },
  [
    Schema.primitive(
      "contents",
      { tagClass: TagClass.Application, tagNumber: 0x4e },
      async (buffer: ArrayBuffer) => {
        const issuer = buffer.slice(0, 16);
        const subject = buffer.slice(16, 32);
        const certificate_raw = buffer.slice(32);
        const public_key = await decodePublicKey(certificate_raw);
        return { issuer, subject, public_key };
      },
    ),
    Schema.primitive(
      "thisSignature",
      { tagClass: TagClass.Application, tagNumber: 0x37 },
      (buffer) => new Uint8Array(buffer),
    ),
  ],
);

export const schemaKenhojoBasicFour = Schema.constructed(
  "kenhojoBasicFour",
  {},
  [
    Schema.primitive(
      "offsets",
      { tagClass: TagClass.Private, tagNumber: 0x21 },
      decodeOffsets,
    ),
    Schema.primitive(
      "name",
      { tagClass: TagClass.Private, tagNumber: 0x22 },
      decodeText,
    ),
    Schema.primitive(
      "address",
      { tagClass: TagClass.Private, tagNumber: 0x23 },
      decodeText,
    ),
    Schema.primitive(
      "birth",
      { tagClass: TagClass.Private, tagNumber: 0x24 },
      decodeText,
    ),
    Schema.primitive(
      "gender",
      { tagClass: TagClass.Private, tagNumber: 0x25 },
      decodeText,
    ),
  ],
);

export const schemaKenhojoSignature = Schema.constructed(
  "kenhojoSignature",
  {
    tagClass: TagClass.Private,
    tagNumber: 0x30,
  },
  [
    Schema.primitive(
      "kenhojoMyNumberHash",
      { tagClass: TagClass.Private, tagNumber: 0x31 },
      (buffer) => new Uint8Array(buffer),
    ),
    Schema.primitive(
      "kenhojoBasicFourHash",
      { tagClass: TagClass.Private, tagNumber: 0x32 },
      (buffer) => new Uint8Array(buffer),
    ),
    Schema.primitive(
      "thisSignature",
      { tagClass: TagClass.Private, tagNumber: 0x33 },
      (buffer) => new Uint8Array(buffer),
    ),
  ],
);

export const schemaKenhojoAuthKey = Schema.constructed(
  "kenhojoAuthKey",
  {
    tagClass: TagClass.Private,
    tagNumber: 0x50,
  },
  [
    Schema.primitive(
      "publicKey",
      { tagClass: TagClass.Private, tagNumber: 0x51 },
      decodePublicKey,
    ),
    Schema.primitive(
      "thisSignature",
      { tagClass: TagClass.Private, tagNumber: 0x52 },
      (buffer) => new Uint8Array(buffer),
    ),
  ],
);

export const schemaKenkakuBirth = Schema.constructed(
  "kenkakuBirth",
  {},
  [
    Schema.primitive(
      "birth",
      { tagClass: TagClass.Private, tagNumber: 0x11 },
      decodeText,
    ),
    Schema.primitive(
      "publicKey",
      { tagClass: TagClass.Private, tagNumber: 0x12 },
      decodePublicKey,
    ),
    Schema.primitive(
      "thisSignature",
      { tagClass: TagClass.Private, tagNumber: 0x13 },
      (buffer) => new Uint8Array(buffer),
    ),
  ],
);

export const schemaKenkakuEntries = Schema.constructed(
  "kenkakuEntries",
  {},
  [
    Schema.primitive(
      "offsets",
      { tagClass: TagClass.Private, tagNumber: 0x21 },
      decodeOffsets,
    ),
    Schema.primitive(
      "birth",
      { tagClass: TagClass.Private, tagNumber: 0x22 },
      decodeText,
    ),
    Schema.primitive(
      "gender",
      { tagClass: TagClass.Private, tagNumber: 0x23 },
      decodeText,
    ),
    Schema.primitive(
      "publicKey",
      { tagClass: TagClass.Private, tagNumber: 0x24 },
      decodePublicKey,
    ),
    Schema.primitive(
      "namePng",
      { tagClass: TagClass.Private, tagNumber: 0x25 },
      (buffer) => new Uint8Array(buffer),
    ),
    Schema.primitive(
      "addressPng",
      { tagClass: TagClass.Private, tagNumber: 0x26 },
      (buffer) => new Uint8Array(buffer),
    ),
    Schema.primitive(
      "faceJp2",
      { tagClass: TagClass.Private, tagNumber: 0x27 },
      (buffer) => new Uint8Array(buffer),
    ),
    Schema.primitive(
      "thisSignature",
      { tagClass: TagClass.Private, tagNumber: 0x28 },
      (buffer) => new Uint8Array(buffer),
    ),
    Schema.primitive(
      "expire",
      { tagClass: TagClass.Private, tagNumber: 0x29 },
      decodeText,
    ),
    Schema.primitive(
      "securityCodePng",
      { tagClass: TagClass.Private, tagNumber: 0x2a },
      (buffer) => new Uint8Array(buffer),
    ),
  ],
);

export const schemaKenkakuMyNumber = Schema.constructed(
  "kenkakuMyNumber",
  {
    tagClass: TagClass.Private,
    tagNumber: 0x40,
  },
  [
    Schema.primitive(
      "myNumberPng",
      { tagClass: TagClass.Private, tagNumber: 0x41 },
      (buffer) => new Uint8Array(buffer),
    ),
    Schema.primitive(
      "publicKey",
      { tagClass: TagClass.Private, tagNumber: 0x42 },
      decodePublicKey,
    ),
    Schema.primitive(
      "thisSignature",
      { tagClass: TagClass.Private, tagNumber: 0x43 },
      (buffer) => new Uint8Array(buffer),
    ),
  ],
);