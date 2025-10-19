import { inferIsSetFromTag } from "../common/index.js";
import { TagClass } from "../common/types.js";
import { BasicTLVParser } from "./basic-parser.js";

type DefaultDecodeType = ArrayBuffer;
type SchemaOptions = {
  readonly tagClass?: TagClass;
  readonly tagNumber?: number;
  readonly optional?: boolean;
  readonly isSet?: boolean;
};

type OptionalFlag<O extends SchemaOptions | undefined> = {
  readonly optional: O extends { optional: true } ? true : false;
};

/**
 * Base interface for a TLV schema object.
 */
interface TLVSchemaBase<N extends string = string> {
  readonly name: N;
  readonly tagClass: TagClass;
  readonly tagNumber: number;
  /**
   * When present, this field is optional in a constructed container.
   */
  readonly optional: boolean;
}

/**
 * Interface for defining a primitive TLV schema.
 * @template DecodedType - The type after decoding.
 */
interface PrimitiveTLVSchema<
  N extends string = string,
  DecodedType = DefaultDecodeType,
> extends TLVSchemaBase<N> {
  /**
   * Optional decode function for synchronous decoding.
   * Use a method signature to improve assignability across unions.
   */
  decode(buffer: ArrayBuffer): DecodedType;
}

/**
 * Interface for defining a constructed TLV schema.
 * @template F - The array of child field schemas.
 */
interface ConstructedTLVSchema<
  N extends string = string,
  F extends readonly TLVSchema[] = readonly TLVSchema[],
> extends TLVSchemaBase<N> {
  readonly fields: F;
  readonly isSet: boolean;
}

// Describes a repeated TLV schema entry (e.g. SET/SEQUENCE OF).
interface RepeatedTLVSchema<
  N extends string = string,
  Item extends TLVSchema = TLVSchema,
> extends TLVSchemaBase<N> {
  readonly item: Item;
}

type TLVSchema<N extends string = string, D = unknown> =
  | PrimitiveTLVSchema<N, D>
  | ConstructedTLVSchema<N, readonly TLVSchema[]>
  | RepeatedTLVSchema<N, TLVSchema>;

type ParsedResult<S extends TLVSchema> = S extends ConstructedTLVSchema
  ? ParsedResultFromConstructed<S>
  : S extends RepeatedTLVSchema
    ? ParsedResultFromRepeated<S>
    : S extends PrimitiveTLVSchema<string, unknown>
      ? ParsedResultFromPrimitive<S>
      : never;

type ParsedResultFromConstructed<S> =
  S extends ConstructedTLVSchema<string, infer Fields>
    ? Fields extends readonly TLVSchema[]
      ? {
          // required fields
          [K in Fields[number] as K["optional"] extends true
            ? never
            : K["name"]]: ParsedResult<K>;
        } & {
          // optional fields
          [K in Fields[number] as K["optional"] extends true
            ? K["name"]
            : never]?: ParsedResult<K>;
        }
      : never
    : never;

type ParsedResultFromRepeated<S> =
  S extends RepeatedTLVSchema<string, infer Item>
    ? ParsedResult<Item>[]
    : never;

type ParsedResultFromPrimitive<S> =
  S extends PrimitiveTLVSchema<string, infer D> ? D : never;

/**
 * A parser that parses TLV data based on a given schema.
 * Provides synchronous parse operations.
 */
// Consumes TLV buffers and produces structured data following the schema layout.
export class SchemaParser<S extends TLVSchema> {
  public readonly schema: S;
  public readonly strict: boolean;
  private depthCounter: number = 0;
  private readonly maxDepth: number;

  public constructor(
    schema: S,
    options?: { strict?: boolean; maxDepth?: number },
  ) {
    this.schema = schema;
    this.strict = options?.strict ?? true;
    this.maxDepth = options?.maxDepth ?? 100;
    this.depthCounter = 0;
  }

  // Parses the TLV buffer and returns schema-typed data.
  public parse(buffer: ArrayBuffer): ParsedResult<S> {
    // Reset depth counter per top-level parse invocation
    this.depthCounter = 0;
    return this.parseTopLevel(this.schema, buffer) as ParsedResult<S>;
  }

  private parseTopLevel(schema: TLVSchema, buffer: ArrayBuffer): unknown {
    if (this.isConstructed(schema)) {
      return this.parseConstructed(
        schema as ConstructedTLVSchema<string, readonly TLVSchema[]>,
        buffer,
      );
    }
    if (this.isRepeated(schema)) {
      // Top-level repeated has no tag to wrap items; disallow to keep TLV well-formed.
      throw new Error(
        `Top-level repeated schema '${schema.name}' is not supported. Wrap it in a constructed container.`,
      );
    }
    return this.parsePrimitive(schema, buffer);
  }

  private parsePrimitive(
    schema: PrimitiveTLVSchema<string, unknown>,
    buffer: ArrayBuffer,
  ): unknown {
    this.ensureDepth();
    try {
      const tlv = BasicTLVParser.parse(buffer);

      if (
        tlv.tag.tagClass !== schema.tagClass ||
        tlv.tag.tagNumber !== schema.tagNumber ||
        tlv.tag.constructed
      ) {
        throw new Error(
          `TLV tag mismatch for primitive '${schema.name}' (expected class=${schema.tagClass} number=${schema.tagNumber} constructed=false; found class=${tlv.tag.tagClass} number=${tlv.tag.tagNumber} constructed=${tlv.tag.constructed})`,
        );
      }

      // Enforce full buffer consumption at top-level when strict
      if (this.strict && tlv.endOffset !== buffer.byteLength) {
        throw new Error(
          `Unexpected trailing bytes after TLV at offset ${tlv.endOffset} (buffer length ${buffer.byteLength}) for primitive '${schema.name}'`,
        );
      }

      return schema.decode(tlv.value);
    } finally {
      this.depthCounter--;
    }
  }

  private parseConstructed(
    schema: ConstructedTLVSchema<string, readonly TLVSchema[]>,
    buffer: ArrayBuffer,
  ): Record<string, unknown> {
    this.ensureDepth();
    try {
      const outer = BasicTLVParser.parse(buffer);

      if (
        outer.tag.tagClass !== schema.tagClass ||
        outer.tag.tagNumber !== schema.tagNumber ||
        !outer.tag.constructed
      ) {
        throw new Error(
          `Container tag mismatch for constructed '${schema.name}' (expected class=${schema.tagClass} number=${schema.tagNumber} constructed=true; found class=${outer.tag.tagClass} number=${outer.tag.tagNumber} constructed=${outer.tag.constructed})`,
        );
      }

      // Enforce full buffer consumption at top-level when strict
      if (this.strict && outer.endOffset !== buffer.byteLength) {
        throw new Error(
          `Unexpected trailing bytes after TLV at offset ${outer.endOffset} (buffer length ${buffer.byteLength}) for constructed '${schema.name}'`,
        );
      }

      const inner = outer.value;

      // If this constructed schema declares no child fields, accept any inner content without validation.
      // This preserves placeholder containers like header.sender/recipient and certTemplate.subject used in examples.
      if (schema.fields.length === 0) {
        return {};
      }

      // Determine SET vs SEQUENCE using explicit flag or tag inference (UNIVERSAL 17=SET, 16=SEQUENCE).
      const treatAsSet = schema.isSet === true;
      if (treatAsSet) {
        return this.parseConstructedSet(schema, inner);
      }
      return this.parseConstructedSequence(schema, inner);
    } finally {
      this.depthCounter--;
    }
  }

  /**
   * Strict, linear SEQUENCE matching (unchanged behavior).
   * - Consumes children in schema order
   * - Optional fields may be skipped
   * - Repeated fields consume zero or more consecutive matching children
   * - Any mismatch immediately fails (independent of 'strict')
   * - No extra children are allowed
   */
  private parseConstructedSequence(
    schema: ConstructedTLVSchema<string, readonly TLVSchema[]>,
    inner: ArrayBuffer,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    // Pre-initialize arrays for repeated fields (always present)
    for (const field of schema.fields) {
      if (this.isRepeated(field)) {
        out[field.name] = [];
      }
    }

    let offset = 0;
    let fIdx = 0;

    while (fIdx < schema.fields.length) {
      const field = schema.fields[fIdx];

      // Repeated field: consume zero or more consecutive children
      if (this.isRepeated(field)) {
        const item = field.item;
        const itemConstructed = this.isConstructed(item);

        while (offset < inner.byteLength) {
          const slice = inner.slice(offset);
          const childTLV = BasicTLVParser.parse(slice);
          if (
            childTLV.tag.tagClass === item.tagClass &&
            childTLV.tag.tagNumber === item.tagNumber &&
            childTLV.tag.constructed === itemConstructed
          ) {
            const childRaw = inner.slice(offset, offset + childTLV.endOffset);
            const parsedItem = this.parseTopLevel(item, childRaw);
            (out[field.name] as unknown[]).push(parsedItem);
            offset += childTLV.endOffset;
          } else {
            break;
          }
        }
        fIdx++;
        continue;
      }

      // Non-repeated field
      if (offset >= inner.byteLength) {
        // No more children; required field missing => fail immediately
        if (!field.optional) {
          throw new Error(
            `Missing required property '${field.name}' in constructed '${schema.name}'`,
          );
        }
        // Optional: skip, proceed to next field
        fIdx++;
        continue;
      }

      const slice = inner.slice(offset);
      const childTLV = BasicTLVParser.parse(slice);

      if (this.isConstructed(field)) {
        if (
          childTLV.tag.tagClass === field.tagClass &&
          childTLV.tag.tagNumber === field.tagNumber &&
          childTLV.tag.constructed === true
        ) {
          const childRaw = inner.slice(offset, offset + childTLV.endOffset);
          const parsedChild = this.parseConstructed(field, childRaw);
          out[field.name] = parsedChild;
          offset += childTLV.endOffset;
          fIdx++;
          continue;
        }

        // Expected constructed field did not match
        if (field.optional) {
          // Skip the optional field (do not consume child), proceed to next schema field
          fIdx++;
          continue;
        }
        throw new Error(
          `Sequence order mismatch in constructed '${schema.name}': expected constructed field '${field.name}' tagClass=${field.tagClass} tagNumber=${field.tagNumber} but found tagClass=${childTLV.tag.tagClass} tagNumber=${childTLV.tag.tagNumber} constructed=${childTLV.tag.constructed}`,
        );
      }

      // Primitive field

      if (
        childTLV.tag.tagClass === field.tagClass &&
        childTLV.tag.tagNumber === field.tagNumber &&
        childTLV.tag.constructed === false
      ) {
        const childRaw = inner.slice(offset, offset + childTLV.endOffset);
        const parsedValue = this.parsePrimitive(field, childRaw);
        out[field.name] = parsedValue;
        offset += childTLV.endOffset;
        fIdx++;
        continue;
      }

      // Expected primitive field did not match
      if (field.optional) {
        // Skip optional field (do not consume child)
        fIdx++;
        continue;
      }
      throw new Error(
        `Sequence order mismatch in constructed '${schema.name}': expected primitive field '${field.name}' tagClass=${field.tagClass} tagNumber=${field.tagNumber} but found tagClass=${childTLV.tag.tagClass} tagNumber=${childTLV.tag.tagNumber} constructed=${childTLV.tag.constructed}`,
      );
    }

    // After consuming all schema fields, no extra children are allowed.
    if (offset < inner.byteLength) {
      const extraSlice = inner.slice(offset);
      const extraTLV = BasicTLVParser.parse(extraSlice);
      throw new Error(
        `Unexpected extra child TLV tagClass=${extraTLV.tag.tagClass} tagNumber=${extraTLV.tag.tagNumber} constructed=${extraTLV.tag.constructed} in constructed '${schema.name}'`,
      );
    }

    // Presence check (strict mode) retained for compatibility; most missing required fields are already caught above.
    if (this.strict) {
      for (const field of schema.fields) {
        const name = field.name;
        if (this.isRepeated(field)) {
          continue;
        }
        if (!field.optional && out[name] === undefined) {
          throw new Error(
            `Missing required property '${name}' in constructed '${schema.name}'`,
          );
        }
      }
    }

    return out;
  }

  /**
   * SET parsing with order-independent matching and DER canonical validation when strict is true.
   * - Collects all child TLVs (raw bytes + TLV)
   * - Immediately fails on unknown children (independent of 'strict')
   * - Non-repeated fields: matches at most one child based on tagClass, tagNumber, constructed
   * - Repeated fields: collects all matching children (SET OF) in any order
   * - Fails when a required field is missing or leftover children remain
   */
  private parseConstructedSet(
    schema: ConstructedTLVSchema<string, readonly TLVSchema[]>,
    inner: ArrayBuffer,
  ): Record<string, unknown> {
    // Allow repeated fields (SET OF) in SET; handled below

    // Collect children (raw + TLV)
    const children: {
      raw: ArrayBuffer;
      tlv: ReturnType<typeof BasicTLVParser.parse>;
    }[] = [];
    {
      let offset = 0;
      while (offset < inner.byteLength) {
        const slice = inner.slice(offset);
        const childTLV = BasicTLVParser.parse(slice);
        const childRaw = inner.slice(offset, offset + childTLV.endOffset);
        children.push({ raw: childRaw, tlv: childTLV });
        offset += childTLV.endOffset;
      }
    }

    // Unknown child detection (independent of 'strict')
    for (const c of children) {
      const known = schema.fields.some((field) =>
        this.matchesFieldTag(field, c.tlv.tag),
      );
      if (!known) {
        throw new Error(
          `Unknown child TLV tagClass=${c.tlv.tag.tagClass} tagNumber=${c.tlv.tag.tagNumber} constructed=${c.tlv.tag.constructed} in SET '${schema.name}'`,
        );
      }
    }

    if (this.strict === true) {
      for (let i = 1; i < children.length; i++) {
        if (this.compareUnsignedLex(children[i - 1].raw, children[i].raw) > 0) {
          throw new Error(
            `DER canonical order violation in SET '${schema.name}': element at index ${i - 1} should come after index ${i}`,
          );
        }
      }
    }

    // Field matching:
    // - Non-repeated fields: at most one matching child
    // - Repeated fields: collect all matching children (SET OF)
    const consumed = new Array(children.length).fill(false);
    const out: Record<string, unknown> = {};

    for (const field of schema.fields) {
      if (this.isRepeated(field)) {
        // Pre-initialize array result as in SEQUENCE behavior
        out[field.name] = [];
        const item = field.item;
        for (let i = 0; i < children.length; i++) {
          if (consumed[i]) continue;
          const c = children[i];
          if (this.matchesFieldTag(field, c.tlv.tag)) {
            // Parse according to item schema
            const parsedItem = this.parseTopLevel(item, c.raw);
            (out[field.name] as unknown[]).push(parsedItem);
            consumed[i] = true;
          }
        }
        // If repeated field is required but no items matched, fail
        if (!field.optional && (out[field.name] as unknown[]).length === 0) {
          throw new Error(
            `Missing required property '${field.name}' in SET '${schema.name}'`,
          );
        }
        continue;
      }

      // Non-repeated field
      let matchedIndex = -1;
      for (let i = 0; i < children.length; i++) {
        if (consumed[i]) continue;
        const c = children[i];
        if (this.matchesFieldTag(field, c.tlv.tag)) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex === -1) {
        if (!field.optional) {
          throw new Error(
            `Missing required property '${field.name}' in SET '${schema.name}'`,
          );
        }
        continue;
      }

      const child = children[matchedIndex];
      const parsed = this.isConstructed(field)
        ? this.parseConstructed(field, child.raw)
        : this.parsePrimitive(field, child.raw);

      out[field.name] = parsed;
      consumed[matchedIndex] = true;
    }

    // No leftover children permitted
    const extraIdx = consumed.findIndex((v) => v === false);
    if (extraIdx !== -1) {
      const extraTag = children[extraIdx].tlv.tag;
      throw new Error(
        `Unexpected extra child TLV tagClass=${extraTag.tagClass} tagNumber=${extraTag.tagNumber} constructed=${extraTag.constructed} in SET '${schema.name}'`,
      );
    }

    return out;
  }

  // Tag match utility for fields vs TLV child
  private matchesFieldTag(
    field: TLVSchema,
    tag: { tagClass: TagClass; tagNumber: number; constructed: boolean },
  ): boolean {
    // If field is repeated, compare against the item's tag
    if (this.isRepeated(field)) {
      const item = field.item;
      const itemClass = item.tagClass ?? TagClass.Universal;
      const itemNumber = item.tagNumber;
      if (typeof itemNumber !== "number") return false;
      const itemConstructed = this.isConstructed(item);
      return (
        tag.tagClass === itemClass &&
        tag.tagNumber === itemNumber &&
        tag.constructed === itemConstructed
      );
    }
    const fieldClass = field.tagClass ?? TagClass.Universal;
    const fieldNumber = field.tagNumber;
    if (typeof fieldNumber !== "number") {
      return false;
    }
    const fieldConstructed = this.isConstructed(field);
    return (
      tag.tagClass === fieldClass &&
      tag.tagNumber === fieldNumber &&
      tag.constructed === fieldConstructed
    );
  }

  // Unsigned lexicographic comparator for raw DER bytes (a < b => negative, a > b => positive)
  private compareUnsignedLex(a: ArrayBuffer, b: ArrayBuffer): number {
    const ua = new Uint8Array(a);
    const ub = new Uint8Array(b);
    const len = Math.min(ua.length, ub.length);
    for (let i = 0; i < len; i++) {
      if (ua[i] !== ub[i]) return ua[i] - ub[i];
    }
    return ua.length - ub.length;
  }

  // Depth guard to prevent stack overflows and pathological nested inputs
  private ensureDepth(): void {
    if (this.depthCounter >= this.maxDepth) {
      throw new Error(`Maximum parsing depth exceeded: ${this.maxDepth}`);
    }
    this.depthCounter++;
  }

  private isConstructed(
    schema: TLVSchema,
  ): schema is ConstructedTLVSchema<string, readonly TLVSchema[]> {
    return Object.prototype.hasOwnProperty.call(schema, "fields");
  }

  private isRepeated(
    schema: TLVSchema,
  ): schema is RepeatedTLVSchema<string, TLVSchema> {
    return Object.prototype.hasOwnProperty.call(schema, "item");
  }
}

/**
 * Utility class for creating new TLV schemas (identical to builder schemas).
 */
// Convenience factory for constructing schema descriptors consumed by the parser.
export class Schema {
  static primitive<
    N extends string,
    O extends SchemaOptions,
    DecodedType = ArrayBuffer,
  >(
    name: N,
    options: O,
    decode: (buffer: ArrayBuffer) => DecodedType = (buffer: ArrayBuffer) =>
      buffer as DecodedType,
  ): PrimitiveTLVSchema<N, DecodedType> & OptionalFlag<O> {
    const tagNumber = options.tagNumber;
    if (typeof tagNumber !== "number") {
      throw new Error(`Primitive schema '${name}' requires tagNumber`);
    }
    const obj = {
      name,
      decode,
      tagClass: options?.tagClass ?? TagClass.Universal,
      tagNumber,
      optional: options?.optional ? (true as const) : (false as const),
    };
    return obj as PrimitiveTLVSchema<N, DecodedType> & OptionalFlag<O>;
  }

  static constructed<
    N extends string,
    O extends SchemaOptions,
    Fields extends readonly TLVSchema[],
  >(
    name: N,
    options: O,
    fields: Fields,
  ): ConstructedTLVSchema<N, Fields> & OptionalFlag<O> {
    const tagClassNormalized = options?.tagClass ?? TagClass.Universal;
    const inferredIsSet =
      options?.isSet !== undefined
        ? options.isSet
        : inferIsSetFromTag(tagClassNormalized, options?.tagNumber);
    const inferredTagNumber = inferredIsSet ? 17 : 16;

    const obj = {
      name,
      fields,
      tagClass: tagClassNormalized,
      tagNumber: options?.tagNumber ?? inferredTagNumber,
      optional: options?.optional ? (true as const) : (false as const),
      isSet: inferredIsSet,
    };
    return obj as ConstructedTLVSchema<N, Fields> & OptionalFlag<O>;
  }

  static repeated<
    N extends string,
    O extends SchemaOptions,
    Item extends TLVSchema,
  >(
    name: N,
    options: O,
    item: Item,
  ): RepeatedTLVSchema<N, Item> & OptionalFlag<O> {
    const obj = {
      name,
      item,
      tagClass: options?.tagClass ?? TagClass.Universal,
      tagNumber: options?.tagNumber,
      optional: options?.optional ? (true as const) : (false as const),
    };
    return obj as RepeatedTLVSchema<N, Item> & OptionalFlag<O>;
  }
}
