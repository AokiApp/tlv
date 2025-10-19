# @aokiapp/tlv

Tag-Length-Value (TLV) parser and builder library with schema support. Provides both parsing and building APIs as submodules.

## Features

- **Schema-based TLV parsing and building**: Define structured schemas for complex TLV data
- **DER encoding support**: Full compliance with Distinguished Encoding Rules
- **Modular API**: Separate parser and builder modules for focused usage
- **TypeScript-first**: Complete type safety with inferred types from schemas
- **ASN.1 compatible**: Support for various ASN.1 constructs (SEQUENCE, SET, primitives, etc.)
- **Real-world examples**: Includes CMS (RFC 5652) and CRCL implementations

## Installation

```bash
npm install @aokiapp/tlv
```

## Quick Start

### Basic TLV Parsing

```typescript
import { BasicTLVParser } from "@aokiapp/tlv/parser";

// Parse raw TLV data
const buffer = new Uint8Array([0x04, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]).buffer;
const tlv = BasicTLVParser.parse(buffer);

console.log(tlv);
// {
//   tag: { tagClass: 0, constructed: false, tagNumber: 4 },
//   length: 5,
//   value: ArrayBuffer(...),
//   endOffset: 7
// }
```

### Schema-based Parsing

```typescript
import { SchemaParser, Schema, TagClass } from "@aokiapp/tlv/parser";
import { decodeUtf8, decodeInteger } from "@aokiapp/tlv/common";

// Define a schema for a person record
const PersonSchema = Schema.constructed("person", { tagNumber: 16 }, [
  Schema.primitive("id", { tagNumber: 2 }, decodeInteger),
  Schema.primitive("name", { tagNumber: 12 }, decodeUtf8),
  Schema.primitive("email", { tagNumber: 12, optional: true }, decodeUtf8),
]);

// Parse TLV data according to schema
const parser = new SchemaParser(PersonSchema);
const result = parser.parse(tlvBuffer);

// Result is fully typed:
// { id: number, name: string, email?: string }
```

### Schema-based Building

```typescript
import { SchemaBuilder, Schema } from "@aokiapp/tlv/builder";
import { encodeUtf8, encodeInteger } from "@aokiapp/tlv/common";

// Define builder schema
const PersonSchema = Schema.constructed("person", { tagNumber: 16 }, [
  Schema.primitive("id", { tagNumber: 2 }, encodeInteger),
  Schema.primitive("name", { tagNumber: 12 }, encodeUtf8),
]);

// Build TLV data from structured input
const builder = new SchemaBuilder(PersonSchema);
const tlvBuffer = builder.build({
  id: 123,
  name: "John Doe"
});
```

## API Reference

### Parser Module (`@aokiapp/tlv/parser`)

#### `BasicTLVParser`

Low-level TLV parsing for raw DER/BER data.

```typescript
class BasicTLVParser {
  static parse(buffer: ArrayBuffer): TLVResult
}
```

**Parameters:**
- `buffer: ArrayBuffer` - Raw TLV data to parse

**Returns:**
- [`TLVResult`](src/common/types.ts:15) - Parsed structure with tag, length, value, and endOffset

**Throws:**
- Error if indefinite length (0x80) is encountered (DER compliance)
- Error if declared length exceeds available bytes

**Example:**
```typescript
const buffer = new Uint8Array([0x04, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]).buffer;
const result = BasicTLVParser.parse(buffer);
// Returns: {
//   tag: { tagClass: 0, constructed: false, tagNumber: 4 },
//   length: 5,
//   value: ArrayBuffer(5), // "Hello"
//   endOffset: 7
// }
```

#### `SchemaParser`

Schema-driven TLV parsing with full type inference.

```typescript
class SchemaParser {
  constructor(schema: TLVSchema, options?: { strict?: boolean })
  parse(buffer: ArrayBuffer): any  // Fully typed based on schema
}
```

**Constructor Parameters:**
- `schema: TLVSchema` - TLV schema definition
- `options.strict?: boolean` - Enable strict validation (default: true)

**Methods:**

##### `parse(buffer: ArrayBuffer): any`

Parse TLV data according to schema with full type inference.

**Parameters:**
- `buffer: ArrayBuffer` - DER-encoded TLV data

**Returns:**
- Fully typed result based on schema definition (TypeScript infers the exact type)

**Behavior:**
- **Strict mode (default)**: Enforces exact schema compliance, canonical SET ordering
- **Non-strict mode**: More permissive parsing, preserves original SET order
- **SEQUENCE**: Children must appear in exact schema order
- **SET**: Children can appear in any order, validated for canonical ordering in strict mode
- **Repeated fields**: Automatically collect multiple consecutive matching children

**Throws:**
- Error on tag class/number mismatches
- Error on missing required fields
- Error on unknown children (immediate failure regardless of strict mode)
- Error on DER canonical order violations in SET (strict mode only)

#### `Schema` (Parser)

Factory class for creating parser schemas.

```typescript
class Schema {
  static primitive(
    name: string,
    options: SchemaOptions,
    decode?: (buffer: ArrayBuffer) => any
  ): TLVSchema
  
  static constructed(
    name: string,
    options: SchemaOptions,
    fields: TLVSchema[]
  ): TLVSchema
  
  static repeated(
    name: string,
    options: SchemaOptions,
    item: TLVSchema
  ): TLVSchema
}
```

### Builder Module (`@aokiapp/tlv/builder`)

#### `BasicTLVBuilder`

Low-level TLV building for constructing DER-encoded data.

```typescript
class BasicTLVBuilder {
  static build(tlv: TLVResult): ArrayBuffer
}
```

**Parameters:**
- `tlv: TLVResult` - TLV structure to encode

**Returns:**
- `ArrayBuffer` - DER-encoded TLV data

**Behavior:**
- Supports high tag numbers (>= 31) with multi-byte encoding
- Supports long-form length encoding (>= 128 bytes)
- Enforces DER canonical encoding rules
- Maximum length field: 126 bytes (BER/DER limit)

**Throws:**
- Error for invalid tag numbers (negative, non-finite)
- Error for invalid tag classes (outside 0-3 range)
- Error for values too large to encode (> 126-byte length field)

**Example:**
```typescript
const tlv: TLVResult = {
  tag: { tagClass: TagClass.Universal, constructed: false, tagNumber: 4 },
  length: 5,
  value: new TextEncoder().encode("Hello").buffer,
  endOffset: 0
};
const encoded = BasicTLVBuilder.build(tlv);
```

#### `SchemaBuilder`

Schema-driven TLV building with type validation.

```typescript
class SchemaBuilder {
  constructor(schema: TLVSchema, options?: { strict?: boolean })
  build(data: any): ArrayBuffer  // Input type inferred from schema
}
```

**Constructor Parameters:**
- `schema: TLVSchema` - TLV schema definition
- `options.strict?: boolean` - Enable strict validation (default: true)

**Methods:**

##### `build(data: any): ArrayBuffer`

Build DER-encoded TLV data from structured input.

**Parameters:**
- `data: any` - Input data matching schema structure (TypeScript infers exact type)

**Returns:**
- `ArrayBuffer` - DER-encoded TLV data

**Behavior:**
- **Strict mode (default)**: Validates all required fields, sorts SET children canonically
- **Non-strict mode**: Permits missing fields, preserves SET child order
- **Type safety**: Input data type is inferred from schema definition
- **SET ordering**: Applies DER canonical lexicographic sorting in strict mode

**Throws:**
- Error on missing required properties (strict mode)
- Error on type validation failures
- Error on top-level repeated schemas (must be wrapped in constructed container)

#### `Schema` (Builder)

Factory class for creating builder schemas.

```typescript
class Schema {
  static primitive(
    name: string,
    options: SchemaOptions,
    encode?: (data: any) => ArrayBuffer
  ): TLVSchema
  
  static constructed(
    name: string,
    options: SchemaOptions,
    fields: TLVSchema[]
  ): TLVSchema
  
  static repeated(
    name: string,
    options: SchemaOptions,
    item: TLVSchema
  ): TLVSchema
}
```

### Schema Options

All schema factory methods accept common options:

```typescript
interface SchemaOptions {
  readonly tagClass?: TagClass;     // Default: TagClass.Universal
  readonly tagNumber?: number;      // Required for primitives
  readonly optional?: boolean;      // Default: false
  readonly isSet?: boolean;         // Auto-inferred for UNIVERSAL 16/17
}
```

**Tag Class Values:**
- `TagClass.Universal` (0) - Standard ASN.1 types
- `TagClass.Application` (1) - Application-specific types  
- `TagClass.ContextSpecific` (2) - Context-specific types
- `TagClass.Private` (3) - Private types

**Tag Number Inference:**
- **SEQUENCE**: `tagNumber: 16` (UNIVERSAL, constructed)
- **SET**: `tagNumber: 17` (UNIVERSAL, constructed)  
- **Custom tags**: Explicit `tagNumber` required


### Utility Functions

#### Encoding Functions

```typescript
// Text encoding
function encodeUtf8(str: string): ArrayBuffer
function encodeAscii(str: string): ArrayBuffer

// Number encoding  
function encodeInteger(n: number): ArrayBuffer    // DER INTEGER encoding
function encodeOID(oid: string): ArrayBuffer      // OBJECT IDENTIFIER encoding

// Binary encoding
function encodeBitString(bits: { unusedBits: number; data: Uint8Array }): ArrayBuffer

// Buffer utilities
function toArrayBuffer(u8: Uint8Array): ArrayBuffer
```

#### Decoding Functions

```typescript
// Text decoding
function decodeUtf8(buffer: ArrayBuffer): string
function decodeAscii(buffer: ArrayBuffer): string  
function decodeShiftJis(buffer: ArrayBuffer): string

// Number decoding
function decodeInteger(buffer: ArrayBuffer): number
function decodeOID(buffer: ArrayBuffer): string

// Binary decoding
function decodeBitStringHex(buffer: ArrayBuffer): { unusedBits: number; hex: string }

// Buffer utilities
function toHex(input: ArrayBuffer | Uint8Array): string
function bufferToArrayBuffer(buf: Buffer): ArrayBuffer
```

### Schema Pattern Examples

#### Basic Schema Types

```typescript
// Primitive field
Schema.primitive("fieldName", { tagNumber: 4 }, decodeUtf8)

// Optional field
Schema.primitive("optional", { tagNumber: 5, optional: true }, decodeUtf8)

// Context-specific tag [0], [1], etc.
Schema.primitive("contextTag", {
  tagClass: TagClass.ContextSpecific,
  tagNumber: 0
}, decodeInteger)

// SEQUENCE (ordered container)
Schema.constructed("sequence", { tagNumber: 16 }, [
  Schema.primitive("field1", { tagNumber: 2 }, decodeInteger),
  Schema.primitive("field2", { tagNumber: 12 }, decodeUtf8),
])

// SET (unordered container)
Schema.constructed("set", { tagNumber: 17, isSet: true }, [
  Schema.primitive("a", { tagNumber: 2 }, decodeInteger),
  Schema.primitive("b", { tagNumber: 12 }, decodeUtf8),
])

// SEQUENCE OF (repeated items)
Schema.constructed("container", { tagNumber: 16 }, [
  Schema.repeated("items", {},
    Schema.primitive("item", { tagNumber: 4 }, decodeUtf8)
  )
])
```

#### Nested Structures

```typescript
const DocumentSchema = Schema.constructed("document", { tagNumber: 16 }, [
  Schema.constructed("header", { tagNumber: 16 }, [
    Schema.primitive("version", { tagNumber: 2 }, decodeInteger),
    Schema.primitive("timestamp", { tagNumber: 24 }, decodeUtf8),
  ]),
  Schema.constructed("content", { tagNumber: 16 }, [
    Schema.primitive("title", { tagNumber: 12 }, decodeUtf8),
    Schema.primitive("description", { tagNumber: 12, optional: true }, decodeUtf8),
    Schema.repeated("tags", {},
      Schema.primitive("tag", { tagNumber: 12 }, decodeUtf8)
    ),
  ])
]);

// TypeScript infers:
// {
//   header: { version: number; timestamp: string };
//   content: { title: string; description?: string; tags: string[] }
// }
```

### Operating Modes

#### Strict Mode (Default)

```typescript
new SchemaParser(schema, { strict: true });   // Default
new SchemaBuilder(schema, { strict: true });
```

- **Validation**: Enforces exact schema compliance
- **SET ordering**: Validates/applies DER canonical ordering
- **Error handling**: Fails fast on any schema violations

#### Non-Strict Mode

```typescript
new SchemaParser(schema, { strict: false });
new SchemaBuilder(schema, { strict: false });
```

- **Flexibility**: More permissive parsing/building
- **SET ordering**: Preserves original order
- **Performance**: Faster with less validation overhead

### Error Handling

```typescript
try {
  const result = new SchemaParser(schema).parse(buffer);
} catch (error) {
  // Detailed error messages for debugging:
  // - "TLV tag mismatch for primitive 'fieldName'"
  // - "Missing required property 'fieldName'"
  // - "DER canonical order violation in SET 'setName'"
  console.error("Parse failed:", error.message);
}
```

### Advanced Usage

#### Custom Codecs

```typescript
// Custom timestamp codec
function decodeTimestamp(buffer: ArrayBuffer): Date {
  const iso = new TextDecoder().decode(buffer);
  return new Date(iso);
}

const schema = Schema.primitive("created", { tagNumber: 24 }, decodeTimestamp);
// Result type automatically inferred as Date
```

## Development

### Build

```bash
npm run build          # Compile TypeScript
npm run typecheck      # Type checking only
```

### Testing

```bash
npm test              # Run tests
```

### Code Quality

```bash
npm run lint          # ESLint
npm run format        # Prettier
```

### Release

```bash
npm run changelog     # Create changeset
npm run version       # Update version
npm run publish       # Publish to npm
```

## Project Structure

```
├── src/
│   ├── parser/          # TLV parsing functionality
│   ├── builder/         # TLV building functionality  
│   ├── common/          # Shared types and utilities
│   └── utils/           # Encoding/decoding utilities
├── examples/
│   ├── cms/             # CMS (RFC 5652) examples
│   └── crcl/            # CRCL certificate request examples
├── tests/               # Test suite
└── dist/                # Compiled output
```

## Supported Encoders/Decoders

The library includes various built-in codecs:

- **Text**: UTF-8, ASCII, Shift-JIS
- **Numbers**: INTEGER (DER encoding)
- **Identifiers**: OBJECT IDENTIFIER
- **Binary**: BIT STRING, OCTET STRING  
- **Utility**: Hex conversion, buffer operations

## TypeScript Support

Full TypeScript support with:

- Schema type inference for parsing results
- Compile-time validation of builder input data
- Optional/required field type safety
- Generic schema composition

## License

This project is licensed under the AokiApp Normative Application License - Tight. See [`LICENSE.md`](LICENSE.md:1) for details.

**Note**: This is NOT an open source license. The source code is made publicly visible for transparency only. Commercial use requires explicit written permission from AokiApp Inc.

## Contributing

This project is currently under restrictive licensing. For contribution guidelines or commercial licensing inquiries, please contact AokiApp Inc. at hello+github@aoki.app.

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md:1) for version history and changes.