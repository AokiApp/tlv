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
- [Notes](#notes)
- [License](#license)

## Features

- ⚡️ Fast, zero-dependency TLV parser and builder (ESM, TypeScript)
- 📐 Schema-driven API
- 🔒 Full TypeScript type safety and inference for schema-driven parse/build
- 🧩 Modular design: separate parser, builder, and common types
- ✅ DER rules enforced where applicable (e.g., no indefinite length)

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

const schema = Schema.primitive(
  "name",
  { tagClass: TagClass.Universal, tagNumber: 0x0c },
  (buf: ArrayBuffer) => new TextDecoder().decode(buf),
);
const parser = new SchemaParser(schema, { strict: true });
const parsed = parser.parse(buffer); // string | Promise<string> depending on your decode
console.log(parsed);
```

## Modules

### Parser (`@aokiapp/tlv/parser`)

- BasicTLVParser:
  - `parse(buffer: ArrayBuffer): TLVResult` — Parse raw TLV
- SchemaParser\<S>:
  - `new SchemaParser(schema: S, options?: { strict?: boolean })`
  - `parse(buffer: ArrayBuffer): ParsedResult<S>` (can contain Promises if decoders are async)
- Schema: Static helpers for schema construction:
  - `Schema.primitive(name, options, decode?)`
  - `Schema.constructed(name, options, fields)`
  - `Schema.repeated(name, options, item)`

### Builder (`@aokiapp/tlv/builder`)

- BasicTLVBuilder:
  - `build(tlv: TLVResult): ArrayBuffer` — DER encode TLV result (length is derived from value)
- SchemaBuilder\<S>:
  - `new SchemaBuilder(schema: S, options?: { strict?: boolean })`
  - `build(data: BuildData<S>): ArrayBuffer`
- Schema: Static helpers for schema construction:
  - `Schema.primitive(name, options, encode?)`
  - `Schema.constructed(name, options, fields)`
  - `Schema.repeated(name, options, item)`

### Common Types (`@aokiapp/tlv/common`)

- `TagClass` — const enum-like object for Universal, Application, ContextSpecific, Private
- `TLVResult`, `TagInfo` — Interfaces for parsed TLV data

## API Reference

### Parser

#### BasicTLVParser

[`BasicTLVParser.parse(buffer: ArrayBuffer): TLVResult`](src/parser/basic-parser.ts:9)
Parse a single TLV structure.

- `buffer`: ArrayBuffer containing TLV data.
- Returns: TLVResult.

#### SchemaParser\<S>

[`new SchemaParser()`](src/parser/schema-parser.ts:112)
[`SchemaParser.parse(buffer: ArrayBuffer): ParsedResult<S>`](src/parser/schema-parser.ts:118)
Parse TLV data based on a schema. If a primitive's `decode` returns a Promise, the returned structure may contain Promises at those positions (or be a Promise when the top-level primitive is async).

- `buffer`: ArrayBuffer input.
- `options.strict` (constructor): boolean to enforce tag/field validation (default true).
- Returns: Parsed result matching schema (may include Promises if decoders are async).

#### Schema

[`Schema.primitive<N, D>(name: N, options, decode?)`](src/parser/schema-parser.ts:112)
[`Schema.constructed<N, F>(name: N, options, fields)`](src/parser/schema-parser.ts:546)
[`Schema.repeated<N, Item>(name: N, options, item)`](src/parser/schema-parser.ts:605)
Helpers for building schema objects.

### Builder

#### BasicTLVBuilder

[`BasicTLVBuilder.build(tlv: TLVResult): ArrayBuffer`](src/builder/basic-builder.ts:13)
Build DER-encoded TLV from a TLVResult (length is computed from `value`).

#### SchemaBuilder\<S>

[`new SchemaBuilder()`](src/builder/schema-builder.ts:111)
[`SchemaBuilder.build(data: BuildData<S>): ArrayBuffer`](src/builder/schema-builder.ts:117)
Build TLV data based on a schema.

#### Schema

[`Schema.primitive<N, E>(name: N, encode?, options)`](src/builder/schema-builder.ts:270)
[`Schema.constructed<N, F>(name: N, fields: F, options?)`](src/builder/schema-builder.ts:294)
[`Schema.repeated<N, Item>(name: N, item: Item, options?)`](src/builder/schema-builder.ts:316)

### Common Types

[`TagClass`](src/common/types.ts:1) — const enum-like of TLV tag classes.
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

const personSchema = Schema.constructed(
  "person",
  { tagClass: TagClass.Private, tagNumber: 0x20 },
  [
    Schema.primitive(
      "age",
      { tagClass: TagClass.Private, tagNumber: 0x10 },
      (buffer: ArrayBuffer) => new DataView(buffer).getUint8(0),
    ),
    Schema.primitive(
      "name",
      { tagClass: TagClass.Private, tagNumber: 0x11 },
      (buffer: ArrayBuffer) => new TextDecoder("utf-8").decode(buffer),
    ),
  ],
);

const buffer = /* TLV-encoded ArrayBuffer for person */;
const parser = new SchemaParser(personSchema);
const parsed = parser.parse(buffer);
console.log(parsed); // { age: 7, name: "alice" }
```

### Async decode (parse returns Promise when decode is async)

```typescript
import { SchemaParser, Schema } from "@aokiapp/tlv/parser";
import { TagClass } from "@aokiapp/tlv/common";

const textSchema = Schema.primitive(
  "text",
  { tagClass: TagClass.Private, tagNumber: 0x01 },
  async (buffer: ArrayBuffer) => {
    await Promise.resolve();
    return new TextDecoder("utf-8").decode(buffer);
  },
);

const parser = new SchemaParser(textSchema);
const parsed = parser.parse(/* TLV bytes */) as Promise<string>;
const value = await parsed; // "hello"
```

### Building Primitive TLV

```typescript
import { BasicTLVBuilder } from "@aokiapp/tlv/builder";
import { TagClass } from "@aokiapp/tlv/common";

const tlv = {
  tag: { tagClass: TagClass.Universal, tagNumber: 0x04, constructed: false },
  length: 3, // ignored; length is derived from value
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

const personSchema = Schema.constructed(
  "person",
  { tagClass: TagClass.Private, tagNumber: 0x20 },
  [
    Schema.primitive(
      "id",
      { tagClass: TagClass.Private, tagNumber: 0x10 },
      (n: number) => new Uint8Array([n]).buffer,
    ),
    Schema.primitive(
      "name",
      { tagClass: TagClass.Private, tagNumber: 0x11 },
      (s: string) => new TextEncoder().encode(s).buffer,
    ),
  ],
);

const builder = new SchemaBuilder(personSchema);
const built = builder.build({ id: 7, name: "alice" }); // Synchronous
console.log(new Uint8Array(built));
```

## Notes

- Strict mode:
  - Parser: `strict: true` enforces container tag match, required field presence, and rejects unknown children. With `strict: false`, unknown children are ignored and only matched fields are returned.
  - Builder: `strict: true` requires all non-optional fields; with `strict: false`, extra properties are ignored.
- Top-level repeated schemas are not supported. Wrap repeated items in a constructed container.
- Primitive fallback:
  - Parser without `decode`: returns raw `ArrayBuffer` (default identity decode).
  - Builder without `encode`: input must be `ArrayBuffer` (provide an `encode` to convert non-ArrayBuffer types like `Uint8Array`).
- Length handling: Encoded length is derived from the value bytes; indefinite length is rejected.

## License

See [`LICENSE.md`](LICENSE.md) for the full license text and terms.
