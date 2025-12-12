# 🔴 CRITICAL BUG FOUND: Integer Codec 32-bit Limitation

**Discovered**: December 12, 2025  
**Severity**: HIGH  
**Component**: `src/common/codecs.ts` - `encodeInteger()` and `decodeInteger()`

## Summary

The `encodeInteger()` and `decodeInteger()` functions fail for integers larger than 2^32 (approximately 4.3 billion) due to JavaScript's bitwise operators being limited to 32-bit signed integers.

## Technical Details

### Bug Location

**File**: `src/common/codecs.ts`  
**Function**: `encodeInteger()` (lines 46-59) and `decodeInteger()` (lines 61-69)

### Root Cause

JavaScript bitwise operators (`>>>`, `<<`, `&`, `|`) operate on 32-bit signed integers:

1. **Line 55**: `temp >>>= 8` - Unsigned right shift limited to 32 bits
2. **Line 67**: `n = (n << 8) | bytes[i]` - Left shift limited to 32 bits

### Proof of Bug

```javascript
import { encodeInteger, decodeInteger } from "@aokiapp/tlv/common";

// Test with MAX_SAFE_INTEGER (2^53 - 1)
const maxSafe = Number.MAX_SAFE_INTEGER; // 9007199254740991
const encoded = encodeInteger(maxSafe);
const decoded = decodeInteger(encoded);

console.log("Original:", maxSafe);
console.log("Decoded:", decoded);
console.log("Match:", maxSafe === decoded); // false!
// Decoded: -1 (WRONG!)

// Test with 2^48
const val = 281474976710655; // 2^48 - 1
const enc = encodeInteger(val);
const dec = decodeInteger(enc);
console.log("2^48-1 round-trip:", val === dec); // false!
```

### Test Results

| Input Value      | Expected         | Actual  | Status  |
| ---------------- | ---------------- | ------- | ------- |
| 0 - 2^32-1       | Correct          | Correct | ✅ PASS |
| 2^32             | 4294967296       | 0       | ❌ FAIL |
| 2^48             | 281474976710656  | 0       | ❌ FAIL |
| MAX_SAFE_INTEGER | 9007199254740991 | -1      | ❌ FAIL |

## Impact Assessment

### Severity: HIGH

1. **Data Corruption**: Large integers are silently corrupted
2. **Security Risk**: May affect cryptographic operations (signatures, keys)
3. **Silent Failure**: No error thrown, wrong data returned
4. **Standards Violation**: ASN.1 INTEGER should support arbitrary precision

### Affected Use Cases

- **Certificate serial numbers** (often > 2^32)
- **Large timestamps** (Unix timestamps in milliseconds > 2^32 after ~2106)
- **Cryptographic values** (key sizes, exponents)
- **Financial amounts** (large currency values in smallest units)

### Not Affected

- Small integers (< 2^32 ≈ 4.3 billion)
- Most common TLV/ASN.1 use cases with small tag numbers and lengths
- String encodings (UTF-8, OID, etc.)

## Proposed Fix

Replace bitwise operations with arithmetic operations:

### For `encodeInteger()`

**Current (BROKEN)**:

```typescript
while (temp > 0) {
  out.unshift(temp & 0xff);
  temp >>>= 8; // ❌ 32-bit limit
}
```

**Fixed**:

```typescript
while (temp > 0) {
  out.unshift(temp % 256);
  temp = Math.floor(temp / 256); // ✅ Works for all safe integers
}
```

### For `decodeInteger()`

**Current (BROKEN)**:

```typescript
for (; i < bytes.length; i++) n = (n << 8) | bytes[i]; // ❌ 32-bit limit
```

**Fixed**:

```typescript
for (; i < bytes.length; i++) {
  n = n * 256 + bytes[i]; // ✅ Works for all safe integers
}
```

## Verification

After fix, test with:

```javascript
// Test large integers
const testValues = [
  0,
  127,
  128,
  255,
  256,
  65535,
  65536,
  2 ** 32 - 1,
  2 ** 32,
  2 ** 48,
  Number.MAX_SAFE_INTEGER,
];

for (const val of testValues) {
  const enc = encodeInteger(val);
  const dec = decodeInteger(enc);
  assert(val === dec, `Failed for ${val}`);
}
```

## Existing Test Coverage

**Current tests DO NOT catch this bug** because they only test small integers:

```typescript
// From tests/unit/common/codecs.test.ts
describe("encodeInteger/decodeInteger", () => {
  it("encodes zero", () => {
    // Tests 0
  });
  it("encodes and decodes number", () => {
    // Tests 123 (small)
  });
});
```

**Recommendation**: Add tests for large integers (> 2^32, up to MAX_SAFE_INTEGER)

## Recommendation for Patch Release

### For 0.4.1 (Patch)

1. **Fix the bug** with arithmetic operations (backward compatible)
2. **Add tests** for large integers
3. **Document** the fix in CHANGELOG
4. **Important**: This is a bug fix, not a breaking change

### Breaking Change Note

This fix changes the behavior for large integers, but the previous behavior was **incorrect**, so this is still a patch-level bug fix, not a breaking change.

## Related Issues

Similar issue exists in `BasicTLVBuilder` (line 49):

```typescript
num = Math.floor(num / 128); // ✅ Already correctly using division!
```

The builder already uses `Math.floor` for division, showing awareness of this issue. The inconsistency suggests the codec bug was an oversight.

## CVE Assessment

While not a security vulnerability per se (no memory corruption, no arbitrary code execution), this could have security implications:

- **Data Integrity**: Corrupted cryptographic values
- **Authentication Bypass**: Wrong signature values
- **Certificate Validation**: Incorrect serial numbers

**Recommendation**: Consider requesting a CVE if this library is used in security-critical applications.

## Timeline

- **Discovered**: December 12, 2025, 19:52 UTC
- **Status**: Documented, awaiting fix
- **Priority**: HIGH - Should be fixed in next patch release

---

**Action Items**:

1. ✅ Document the bug (this file)
2. ⏳ Create fix for `encodeInteger()` and `decodeInteger()`
3. ⏳ Add comprehensive tests for large integers
4. ⏳ Update CHANGELOG.md
5. ⏳ Release patch version 0.4.1

---

**Note**: Per the original requirement, **code must not be edited**. This document serves as complete documentation of the issue for the maintainer to fix in a subsequent patch release.
