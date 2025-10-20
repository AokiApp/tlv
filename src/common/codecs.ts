/**
 * Common encode/decode utilities for TLV ASN.1 DER operations
 */

export function identity(ab: ArrayBuffer): ArrayBuffer {
  return ab;
}

export function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const out = new ArrayBuffer(buf.byteLength);
  new Uint8Array(out).set(
    new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
  );
  return out;
}

export function toHex(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

export function encodeUtf8(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer;
}

export function decodeUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder("utf-8").decode(buffer);
}

export function decodeShiftJis(buffer: ArrayBuffer): string {
  return new TextDecoder("shift_jis").decode(buffer);
}

export function decodeAscii(buffer: ArrayBuffer): string {
  return new TextDecoder("ascii").decode(buffer);
}

export function encodeInteger(n: number): ArrayBuffer {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`INTEGER must be non-negative finite number; got ${n}`);
  }
  if (n === 0) return new Uint8Array([0x00]).buffer;
  const out: number[] = [];
  let temp = n;
  while (temp > 0) {
    out.unshift(temp & 0xff);
    temp >>>= 8;
  }
  if (out[0] & 0x80) out.unshift(0x00);
  return new Uint8Array(out).buffer;
}

export function decodeInteger(buffer: ArrayBuffer): number {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return 0;
  let i = 0;
  if (bytes[0] === 0x00 && bytes.length > 1) i = 1;
  let n = 0;
  for (; i < bytes.length; i++) n = (n << 8) | bytes[i];
  return n;
}

function encodeBase128(n: number): number[] {
  if (n === 0) return [0x00];
  const stack: number[] = [];
  while (n > 0) {
    stack.push(n & 0x7f);
    n = Math.floor(n / 128);
  }
  const out = stack.reverse();
  for (let i = 0; i < out.length - 1; i++) out[i] |= 0x80;
  return out;
}

export function encodeOID(oid: string): ArrayBuffer {
  const arcs = oid.split(".").map((s) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid OID arc: ${s}`);
    return Math.floor(n);
  });
  if (arcs.length < 2)
    throw new Error(`OID must have at least two arcs; got '${oid}'`);
  const first = arcs[0];
  const second = arcs[1];
  let firstByte = 0;
  if (first < 2) {
    firstByte = first * 40 + second;
  } else {
    firstByte = 80 + second;
  }
  const out: number[] = [firstByte];
  for (let i = 2; i < arcs.length; i++) {
    out.push(...encodeBase128(arcs[i]));
  }
  return new Uint8Array(out).buffer;
}

export function decodeOID(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) throw new Error("Empty OID encoding (0 bytes)");
  const firstByte = bytes[0];
  let first = Math.floor(firstByte / 40);
  let second = firstByte % 40;
  if (firstByte >= 80) {
    first = 2;
    second = firstByte - 80;
  }
  const arcs: number[] = [first, second];
  let i = 1;
  while (i < bytes.length) {
    let val = 0;
    let b: number;
    do {
      if (i >= bytes.length)
        throw new Error(`Truncated OID at byte index ${i}`);
      b = bytes[i++];
      val = (val << 7) | (b & 0x7f);
    } while (b & 0x80);
    arcs.push(val);
  }
  return arcs.join(".");
}

export function decodeBitStringHex(buffer: ArrayBuffer): {
  unusedBits: number;
  hex: string;
} {
  const bytes = new Uint8Array(buffer);
  const unusedBits = bytes.length > 0 ? bytes[0] : 0;
  const content = bytes.length > 0 ? bytes.slice(1) : new Uint8Array();
  return { unusedBits, hex: toHex(content) };
}

export function encodeBitString(bits: {
  unusedBits: number;
  data: Uint8Array;
}): ArrayBuffer {
  const buffer = new ArrayBuffer(bits.data.length + 1);
  const view = new Uint8Array(buffer);
  view[0] = bits.unusedBits;
  view.set(bits.data, 1);
  return buffer;
}
