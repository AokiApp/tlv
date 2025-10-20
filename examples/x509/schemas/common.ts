import {
  decodeOID,
  encodeOID,
  decodeInteger,
  encodeInteger,
  decodeUtf8,
  encodeUtf8,
  decodeAscii,
  decodeBitStringHex,
  encodeBitString,
  toArrayBuffer,
  toHex,
} from "../../../src/common/codecs.ts";

/**
 * Encode ASCII (PrintableString/IA5String/etc.) as ArrayBuffer.
 * Throws when non-ASCII characters are present.
 */
export function encodeAscii(str: string): ArrayBuffer {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 0x7f) {
      throw new Error("Non-ASCII character in Printable/IA5 string");
    }
  }
  return new TextEncoder().encode(str).buffer;
}

/**
 * Convert hex string to Uint8Array bytes.
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Encode BMPString (UCS-2 big-endian) from JS string.
 * Note: surrogate pairs (outside BMP) are not handled; suitable for typical cert fields.
 */
export function encodeBMPString(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < str.length; i++) {
    view.setUint16(i * 2, str.charCodeAt(i), false /* big-endian */);
  }
  return buf;
}

/**
 * Decode BMPString (UCS-2 big-endian) to JS string.
 */
export function decodeBMPString(buffer: ArrayBuffer): string {
  const view = new DataView(buffer);
  let s = "";
  for (let i = 0; i < view.byteLength; i += 2) {
    s += String.fromCharCode(view.getUint16(i, false /* big-endian */));
  }
  return s;
}

/**
 * BOOLEAN encode/decode helpers (Universal tag 0x01).
 */
export function encodeBoolean(b: boolean): ArrayBuffer {
  return new Uint8Array([b ? 0xff : 0x00]).buffer;
}
export function decodeBoolean(buffer: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buffer);
  return u8.length > 0 && u8[0] !== 0x00;
}

/**
 * Encode BIT STRING from { unusedBits, hex } to DER content.
 */
export function encodeBitStringFromHex(v: {
  unusedBits: number;
  hex: string;
}): ArrayBuffer {
  return encodeBitString({ unusedBits: v.unusedBits, data: hexToBytes(v.hex) });
}

export function encodeNull(_: null): ArrayBuffer {
  return new Uint8Array(0).buffer;
}

export function decodeNull(_: ArrayBuffer): null {
  return null;
}

// Re-exports used by schemas
export {
  decodeOID,
  encodeOID,
  decodeInteger,
  encodeInteger,
  decodeUtf8,
  encodeUtf8,
  decodeAscii,
  decodeBitStringHex,
  toArrayBuffer,
  toHex,
};
