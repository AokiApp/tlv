# @aokiapp/tlv

[![CI](https://github.com/AokiApp/tlv/actions/workflows/ci.yml/badge.svg)](https://github.com/AokiApp/tlv/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/@aokiapp/tlv.svg)](https://www.npmjs.com/package/@aokiapp/tlv)

High-performance TypeScript library for Tag-Length-Value (TLV) parsing and building, with schema-driven API and full type support.

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
- [Modules](#modules)
  - [Parser](#parser)
  - [Builder](#builder)
  - [Common Types](#common-types)
- [API Reference](#api-reference)
- [Examples](#examples)
- [License](#license)

## Features

- ⚡️ Fast, zero-dependency TLV parser and builder
- 📐 Schema-driven API with sync/async support
- 🔒 Full TypeScript type safety and inference
- 🧩 Modular design: separate parser, builder, and common types

## Getting Started

### Installation

```bash
npm install @aokiapp/tlv
```

### Quick Start

#### Basic Parser

```typescript
import { BasicTLVParser } from "@aokiapp/tlv/parser";

const buffer = new Uint8Array([0x04, 0x05 /*...*/]).buffer;
const result = BasicTLVParser.parse(buffer);
console.log(result);
```

#### Schema Parser

```typescript
import { SchemaParser, Schema } from "@aokiapp/tlv/parser";
import { TagClass } from "@aokiapp/tlv/common";

const schema = Schema.primitive("name", {
  tagClass: TagClass.Universal,
  tagNumber: 0x0c,
  decode: (buf: ArrayBuffer) => new TextDecoder().decode(buf),
});
const parser = new SchemaParser(schema);
const parsed = parser.parseSync(buffer); // Synchronous
// Or: await parser.parseAsync(buffer); // Asynchronous
console.log(parsed);
```

## Modules

### Parser (`@aokiapp/tlv/parser`)

- **BasicTLVParser**: `parse(buffer: ArrayBuffer): TLVResult` — Parse raw TLV.
- **SchemaParser\<S>**: 
  - `parse(buffer: ArrayBuffer, options?: { async?: boolean; strict?: boolean }): ParsedResult<S> | Promise<ParsedResult<S>>`
  - `parseSync(buffer: ArrayBuffer): ParsedResult<S>`
  - `parseAsync(buffer: ArrayBuffer): Promise<ParsedResult<S>>`
- **Schema**: Static helpers for schema construction.

### Builder (`@aokiapp/tlv/builder`)

- **BasicTLVBuilder**: `build(tlv: TLVResult): ArrayBuffer` — DER encode TLV result.
- **SchemaBuilder\<S>**: 
  - `build(data: BuildData<S>, options?: { async?: boolean; strict?: boolean }): ArrayBuffer | Promise<ArrayBuffer>`
  - Synchronous and asynchronous variants.
- **Schema**: Static helpers for schema construction.

### Common Types (`@aokiapp/tlv/common`)

- `TagClass` — Enum for Universal, Application, ContextSpecific, Private.
- `TLVResult`, `TagInfo` — Interfaces for parsed TLV data.

## API Reference

### Parser

#### BasicTLVParser

[`BasicTLVParser.parse(buffer: ArrayBuffer): TLVResult`](src/parser/basic-parser.ts:9)  
Parse a single TLV structure.

- `buffer`: ArrayBuffer containing TLV data.
- Returns: TLVResult.

#### SchemaParser\<S>

[`SchemaParser.parse(buffer: ArrayBuffer, options?: { async?: boolean; strict?: boolean }): ParsedResult<S> | Promise<ParsedResult<S>>`](src/parser/schema-parser.ts:109)  
[`SchemaParser.parseSync(buffer: ArrayBuffer): ParsedResult<S>`](src/parser/schema-parser.ts:133)  
[`SchemaParser.parseAsync(buffer: ArrayBuffer): Promise<ParsedResult<S>>`](src/parser/schema-parser.ts:145)  
Parse TLV data based on a schema.

- `buffer`: ArrayBuffer input.
- `options.async`: true for asynchronous parsing.
- `options.strict`: override strict DER mode.
- Returns: Parsed result matching schema, synchronously or as a Promise.

#### Schema

[`Schema.primitive<N, D>(name: N, options): TLVSchema`](src/parser/schema-parser.ts:339)  
[`Schema.constructed<N, F>(name: N, fields: F, options?): TLVSchema`](src/parser/schema-parser.ts:363)  
Helpers for building schema objects.

### Builder

#### BasicTLVBuilder

[`BasicTLVBuilder.build(tlv: TLVResult): ArrayBuffer`](src/builder/basic-builder.ts:13)  
Build DER-encoded TLV from a TLVResult.

#### SchemaBuilder\<S>

[`SchemaBuilder.build(data: BuildData<S>, options?: { async?: boolean; strict?: boolean }): ArrayBuffer | Promise<ArrayBuffer>`](src/builder/schema-builder.ts:104)  
Build TLV data based on a schema.

### Common Types

[`TagClass`](src/common/types.ts:1) — Enum of TLV tag classes.  
[`TagInfo`](src/common/types.ts:9) — Interface for TLV tag metadata.  
[`TLVResult`](src/common/types.ts:15) — Interface for parsed TLV results.

## Examples

### Parsing Primitive TLV

```typescript
import { BasicTLVParser } from "@aokiapp/tlv/parser";
import { TagClass } from "@aokiapp/tlv/common";

const buffer = new Uint8Array([0x04, 0x03, 0x41, 0x42, 0x43]).buffer;
const result = BasicTLVParser.parse(buffer);
console.log(result);
// {
//   tag: { tagClass: TagClass.Universal, tagNumber: 4, constructed: false },
//   length: 3,
//   value: ArrayBuffer([...]),
//   endOffset: 5
// }
```

### Parsing Constructed TLV (using Schema class)

```typescript
import { SchemaParser, Schema } from "@aokiapp/tlv/parser";
import { TagClass } from "@aokiapp/tlv/common";

const personSchema = Schema.constructed("person", [
  Schema.primitive("age", {
    tagNumber: 0x02,
    decode: buf => new DataView(buf).getUint8(0),
  }),
  Schema.primitive("name", {
    tagNumber: 0x0c,
    decode: buf => new TextDecoder().decode(buf),
  }),
], { tagClass: TagClass.Universal, tagNumber: 0x10 });

const buffer = /* TLV-encoded ArrayBuffer for person */;
const parser = new SchemaParser(personSchema);
const parsed = parser.parseSync(buffer); // Or await parser.parseAsync(buffer)
console.log(parsed); // { age: 30, name: "Alice" }
```

### Building Primitive TLV

```typescript
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
```

### Building Constructed TLV (using Schema class)

```typescript
import { SchemaBuilder, Schema } from "@aokiapp/tlv/builder";
import { TagClass } from "@aokiapp/tlv/common";

const personSchema = Schema.constructed("person", [
  Schema.primitive("age", {
    tagNumber: 0x02,
    encode: (n: number) => new Uint8Array([n]).buffer,
  }),
  Schema.primitive("name", {
    tagNumber: 0x0c,
    encode: (s: string) => new TextEncoder().encode(s).buffer,
  }),
], { tagClass: TagClass.Universal, tagNumber: 0x10 });

const builder = new SchemaBuilder(personSchema);
const built = builder.build({ age: 30, name: "Alice" }); // Synchronous
// Or: await builder.build({ age: 30, name: "Alice" }, { async: true }); // Asynchronous
console.log(new Uint8Array(built)); // TLV-encoded person structure
```

## License

See [`LICENSE.md`](LICENSE.md) for the full license text and terms.