import { TagClass } from "./types.js";
export * from "./codecs.js";
export * from "./types.js";

export function inferIsSetFromTag(
  tagClass?: TagClass,
  tagNumber?: number,
): boolean | undefined {
  const cls = tagClass ?? TagClass.Universal;
  if (typeof tagNumber !== "number") return undefined;
  if (cls === TagClass.Universal) {
    if (tagNumber === 17) return true;
    if (tagNumber === 16) return false;
  }
  return undefined;
}
