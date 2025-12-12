# 🔴 ADDITIONAL BUG FOUND: OID Decoder 32-bit Limitation

**Discovered**: December 12, 2025  
**Severity**: MEDIUM  
**Component**: `src/common/codecs.ts` - `decodeOID()`

## Summary

The `decodeOID()` function fails for OID arc values larger than 2^32 (approximately 4.3 billion) due to JavaScript's left shift operator being limited to 32-bit signed integers.

## Technical Details

### Bug Location

**File**: `src/common/codecs.ts`  
**Function**: `decodeOID()` (lines 106-130)

### Root Cause

**Line 125**: `val = (val << 7) | (b & 0x7f)` - Left shift limited to 32 bits

When parsing base-128 encoded OID arcs, the accumulator `val` overflows for arc values > 2^32.

### Proof of Bug

```javascript
import { encodeOID, decodeOID } from "@aokiapp/tlv/common";

// Test with OID containing 2^32
const oid = "1.2.4294967295"; // 2^32 - 1
const enc = encodeOID(oid);
const dec = decodeOID(enc);

console.log("Original:", oid);
console.log("Decoded:", dec);
console.log("Match:", oid === dec); // false!
// Decoded: "1.2.-1" (WRONG!)

// Test with 2^32
const oid2 = "1.2.4294967296";
const enc2 = encodeOID(oid2);
const dec2 = decodeOID(enc2);
console.log("Decoded:", dec2); // "1.2.0" (WRONG!)
```

### Test Results

| OID Last Arc | Expected   | Decoded | Status  |
| ------------ | ---------- | ------- | ------- |
| 0 - 2^31-1   | Correct    | Correct | ✅ PASS |
| 2^32-1       | 4294967295 | -1      | ❌ FAIL |
| 2^32         | 4294967296 | 0       | ❌ FAIL |

## Impact Assessment

### Severity: MEDIUM

1. **Data Corruption**: Large OID arc values are silently corrupted
2. **Standards Violation**: OIDs should support arbitrary sized arc values
3. **Silent Failure**: No error thrown, wrong data returned

### Affected Use Cases

- **Enterprise OIDs**: Some organizations use large arc values
- **X.509 Extensions**: Custom OIDs with large arc numbers
- **SNMP**: Large enterprise-specific OID values
- **Rare in Practice**: Most standard OIDs use small arc values

### Not Affected

- Common OIDs (SHA-256: `2.16.840.1.101.3.4.2.1`, RSA: `1.2.840.113549.1.1.1`)
- Most certificate OIDs
- OIDs with all arc values < 2^32

## Proposed Fix

Replace bitwise left shift with multiplication:

### For `decodeOID()`

**Current (BROKEN)**:

```typescript
do {
  b = bytes[i++];
  val = (val << 7) | (b & 0x7f); // ❌ 32-bit limit
} while (b & 0x80);
```

**Fixed**:

```typescript
do {
  b = bytes[i++];
  val = val * 128 + (b & 0x7f); // ✅ Works for all safe integers
} while (b & 0x80);
```

## Note on encodeOID()

The encoder already uses the correct approach:

```typescript
// Line 76 in encodeBase128 (used by encodeOID)
n = Math.floor(n / 128); // ✅ Already correct!
```

This suggests awareness of the issue in the encoder, making the decoder bug an oversight.

## Related Bugs

This is related to the INTEGER codec bug documented in `CRITICAL_BUG_INTEGER_CODEC.md`:

- **INTEGER codec**: Affects both encoder and decoder (HIGH severity)
- **OID codec**: Affects only decoder (MEDIUM severity)
- **Root cause**: Same issue - 32-bit bitwise operation limits

## Existing Test Coverage

Current tests do not catch this bug. Example from tests:

```typescript
// Only tests small OID values
const CMS_OIDS = {
  id_data: "1.2.840.113549.1.7.1",
  id_signedData: "1.2.840.113549.1.7.2",
};
```

**Recommendation**: Add tests for OIDs with large arc values (> 2^32)

## Recommendation for Patch Release

### For 0.4.1 (Patch)

1. **Fix the bug** with multiplication instead of left shift
2. **Add tests** for OIDs with large arc values
3. **Document** the fix in CHANGELOG
4. **Note**: Backward compatible fix (previous behavior was incorrect)

## Practical Impact

**Low to Medium** in practice:

- Most real-world OIDs use small arc values
- Standards-defined OIDs are rarely > 2^32
- But data corruption is still unacceptable for any input

## Timeline

- **Discovered**: December 12, 2025, 19:57 UTC
- **Status**: Documented, awaiting fix
- **Priority**: MEDIUM (lower than INTEGER codec, but still important)

---

**Action Items**:

1. ✅ Document the bug (this file)
2. ⏳ Create fix for `decodeOID()`
3. ⏳ Add tests for large OID arc values
4. ⏳ Update CHANGELOG.md
5. ⏳ Release patch version 0.4.1 (along with INTEGER codec fix)

---

**Note**: Per the original requirement, **code must not be edited**. This document serves as complete documentation of the issue for the maintainer to fix in a subsequent patch release.
