import { TagClass } from "../common/types.js";
import { BasicTLVParser } from "./basic-parser.js";

type DefaultDecodeType = ArrayBuffer;
type SchemaOptions = {
  readonly tagClass?: TagClass;
  readonly tagNumber?: number;
  readonly optional?: true;
  readonly isSet?: boolean;
  readonly enforceCanonical?: boolean;
};

type OptionalFlag<O extends SchemaOptions | undefined> = O extends {
  optional: true;
}
  ? { readonly optional: true }
  : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {};

/**
 * Base interface for a TLV schema object.
 */
interface TLVSchemaBase<N extends string = string> {
  readonly name: N;
  readonly tagClass?: TagClass;
  readonly tagNumber?: number;
  /**
   * When present, this field is optional in a constructed container.
   */
  readonly optional?: true;
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
  decode?(buffer: ArrayBuffer): DecodedType;
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
  readonly isSet?: boolean;
  readonly enforceCanonical?: boolean;
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

  public constructor(schema: S, options?: { strict?: boolean }) {
    this.schema = schema;
    this.strict = options?.strict ?? true;
  }

  // Parses the TLV buffer and returns schema-typed data.
  public parse(buffer: ArrayBuffer): ParsedResult<S> {
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
    return this.parsePrimitive(schema , buffer);
  }

  private parsePrimitive(
    schema: PrimitiveTLVSchema<string, unknown>,
    buffer: ArrayBuffer,
  ): unknown {
    const tlv = BasicTLVParser.parse(buffer);
    const expectedClass = schema.tagClass ?? TagClass.Universal;
    const { tagNumber } = schema;
    if (typeof tagNumber !== "number") {
      throw new Error(`Primitive field '${schema.name}' is missing tagNumber`);
    }

    if (this.strict) {
      if (
        tlv.tag.tagClass !== expectedClass ||
        tlv.tag.tagNumber !== tagNumber ||
        tlv.tag.constructed
      ) {
        throw new Error(`TLV tag mismatch for primitive '${schema.name}'`);
      }
    }

    if (typeof schema.decode === "function") {
      return schema.decode(tlv.value);
    }
    return tlv.value;
  }

  private parseConstructed(
    schema: ConstructedTLVSchema<string, readonly TLVSchema[]>,
    buffer: ArrayBuffer,
  ): Record<string, unknown> {
    const outer = BasicTLVParser.parse(buffer);

    const expectedClass = schema.tagClass ?? TagClass.Universal;
    const { tagNumber } = schema;
    if (typeof tagNumber !== "number") {
      throw new Error(
        `Constructed field '${schema.name}' is missing tagNumber`,
      );
    }

    if (this.strict) {
      if (
        outer.tag.tagClass !== expectedClass ||
        outer.tag.tagNumber !== tagNumber ||
        !outer.tag.constructed
      ) {
        throw new Error(
          `Container tag mismatch for constructed '${schema.name}'`,
        );
      }
    }

    const inner = outer.value;

    // If this constructed schema declares no child fields, accept any inner content without validation.
    // This preserves placeholder containers like header.sender/recipient and certTemplate.subject used in examples.
    if (schema.fields.length === 0) {
      return {};
    }

    // Determine SET vs SEQUENCE using explicit flag or tag inference (UNIVERSAL 17=SET, 16=SEQUENCE).
    const treatAsSet =
      typeof schema.isSet === "boolean"
        ? schema.isSet
        : Schema.inferIsSetFromTag(schema.tagClass, schema.tagNumber) === true;
    if (treatAsSet) {
      return this.parseConstructedSet(schema, inner);
    }
    return this.parseConstructedSequence(schema, inner);
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
        const itemClass = item.tagClass ?? TagClass.Universal;
        const itemNumber = item.tagNumber;
        if (typeof itemNumber !== "number") {
          throw new Error(
            `Repeated field '${field.name}' item is missing tagNumber`,
          );
        }
        const itemConstructed = this.isConstructed(item);

        while (offset < inner.byteLength) {
          const slice = inner.slice(offset);
          const childTLV = BasicTLVParser.parse(slice);
          if (
            childTLV.tag.tagClass === itemClass &&
            childTLV.tag.tagNumber === itemNumber &&
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
        const fieldClass = field.tagClass ?? TagClass.Universal;
        const fieldNumber = field.tagNumber;
        if (typeof fieldNumber !== "number") {
          throw new Error(
            `Constructed field '${field.name}' is missing tagNumber`,
          );
        }
        if (
          childTLV.tag.tagClass === fieldClass &&
          childTLV.tag.tagNumber === fieldNumber &&
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
          `Sequence order mismatch in constructed '${schema.name}': expected constructed field '${field.name}' tagClass=${fieldClass} tagNumber=${fieldNumber} but found tagClass=${childTLV.tag.tagClass} tagNumber=${childTLV.tag.tagNumber}`,
        );
      }

      // Primitive field
      const primClass = field.tagClass ?? TagClass.Universal;
      const primNumber = field.tagNumber;
      if (typeof primNumber !== "number") {
        throw new Error(
          `Primitive field '${field.name}' is missing tagNumber`,
        );
      }

      if (
        childTLV.tag.tagClass === primClass &&
        childTLV.tag.tagNumber === primNumber &&
        childTLV.tag.constructed === false
      ) {
        const childRaw = inner.slice(offset, offset + childTLV.endOffset);
        const parsedValue = this.parsePrimitive(
          field ,
          childRaw,
        );
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
        `Sequence order mismatch in constructed '${schema.name}': expected primitive field '${field.name}' tagClass=${primClass} tagNumber=${primNumber} but found tagClass=${childTLV.tag.tagClass} tagNumber=${childTLV.tag.tagNumber}`,
      );
    }

    // After consuming all schema fields, no extra children are allowed.
    if (offset < inner.byteLength) {
      const extraSlice = inner.slice(offset);
      const extraTLV = BasicTLVParser.parse(extraSlice);
      throw new Error(
        `Unexpected extra child TLV tagClass=${extraTLV.tag.tagClass} tagNumber=${extraTLV.tag.tagNumber} in constructed '${schema.name}'`,
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
   * SET parsing with order-independent matching and optional DER canonical validation.
   * - Collects all child TLVs (raw bytes + TLV)
   * - Immediately fails on unknown children (independent of 'strict')
   * - Matches each schema field to at most one child based on tagClass, tagNumber, constructed
   * - Fails when a required field is missing or leftover children remain
   * - If enforceCanonical is true, verifies children raw bytes are sorted ascending (unsigned lexicographic)
   * - Repeated fields in SET are out of scope and rejected
   */
  private parseConstructedSet(
    schema: ConstructedTLVSchema<string, readonly TLVSchema[]>,
    inner: ArrayBuffer,
  ): Record<string, unknown> {
    // Reject repeated fields in SET (SET OF will be handled in future extension)
    for (const field of schema.fields) {
      if (this.isRepeated(field)) {
        throw new Error(
          `Repeated field '${field.name}' is not supported in SET '${schema.name}'`,
        );
      }
    }

    // Collect children (raw + TLV)
    const children: { raw: ArrayBuffer; tlv: ReturnType<typeof BasicTLVParser.parse> }[] = [];
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
          `Unknown child TLV tagClass=${c.tlv.tag.tagClass} tagNumber=${c.tlv.tag.tagNumber} in SET '${schema.name}'`,
        );
      }
    }

    // Optional canonical order validation
    if (schema.enforceCanonical === true) {
      for (let i = 1; i < children.length; i++) {
        if (this.compareUnsignedLex(children[i - 1].raw, children[i].raw) > 0) {
          throw new Error(
            `DER canonical order violation in SET '${schema.name}': element at index ${i - 1} should come after index ${i}`,
          );
        }
      }
    }

    // Field matching (at most one child per field)
    const consumed = new Array(children.length).fill(false);
    const out: Record<string, unknown> = {};

    for (const field of schema.fields) {
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
      const parsed =
        this.isConstructed(field)
          ? this.parseConstructed(field, child.raw)
          : this.parsePrimitive(
              field ,
              child.raw,
            );

      out[field.name] = parsed;
      consumed[matchedIndex] = true;
    }

    // No leftover children permitted
    const extraIdx = consumed.findIndex((v) => v === false);
    if (extraIdx !== -1) {
      const extraTag = children[extraIdx].tlv.tag;
      throw new Error(
        `Unexpected extra child TLV tagClass=${extraTag.tagClass} tagNumber=${extraTag.tagNumber} in SET '${schema.name}'`,
      );
    }

    return out;
  }

  // Tag match utility for fields vs TLV child
  private matchesFieldTag(
    field: TLVSchema,
    tag: { tagClass: TagClass; tagNumber: number; constructed: boolean },
  ): boolean {
    if (this.isRepeated(field)) {
      // Repeated in SET is out of scope; treat as non-matching here.
      return false;
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
  /**
   * Infer whether a constructed UNIVERSAL tag indicates SET or SEQUENCE.
   * - Returns true for UNIVERSAL tagNumber 17 (SET)
   * - Returns false for UNIVERSAL tagNumber 16 (SEQUENCE)
   * - Returns undefined for other classes/numbers
   */
  static inferIsSetFromTag(tagClass?: TagClass, tagNumber?: number): boolean | undefined {
    const cls = tagClass ?? TagClass.Universal;
    if (typeof tagNumber !== "number") return undefined;
    if (cls === TagClass.Universal) {
      if (tagNumber === 17) return true;
      if (tagNumber === 16) return false;
    }
    return undefined;
  }

  static primitive<
    N extends string,
    D = ArrayBuffer,
    O extends SchemaOptions | undefined = undefined,
  >(
    name: N,
    decode?: (buffer: ArrayBuffer) => D,
    options?: O,
  ): PrimitiveTLVSchema<N, D> & OptionalFlag<O> {
    const obj = {
      name,
      ...(decode ? { decode } : {}),
      ...(options?.tagClass !== undefined
        ? { tagClass: options.tagClass }
        : {}),
      ...(options?.tagNumber !== undefined
        ? { tagNumber: options.tagNumber }
        : {}),
      ...(options?.optional ? { optional: true as const } : {}),
    };
    return obj as PrimitiveTLVSchema<N, D> & OptionalFlag<O>;
  }

  static constructed<
    N extends string,
    F extends readonly TLVSchema[],
    O extends SchemaOptions | undefined = undefined,
  >(
    name: N,
    fields: F,
    options?: O,
  ): ConstructedTLVSchema<N, F> & OptionalFlag<O> {
    const obj = {
      name,
      fields,
      ...(options?.tagClass !== undefined
        ? { tagClass: options.tagClass }
        : {}),
      ...(options?.tagNumber !== undefined
        ? { tagNumber: options.tagNumber }
        : {}),
      ...(options?.optional ? { optional: true as const } : {}),
      ...(options?.isSet !== undefined ? { isSet: options.isSet } : {}),
      ...(options?.enforceCanonical !== undefined
        ? { enforceCanonical: options.enforceCanonical }
        : {}),
    };
    return obj as ConstructedTLVSchema<N, F> & OptionalFlag<O>;
  }

  static repeated<
    N extends string,
    Item extends TLVSchema,
    O extends SchemaOptions | undefined = undefined,
  >(
    name: N,
    item: Item,
    options?: O,
  ): RepeatedTLVSchema<N, Item> & OptionalFlag<O> {
    const obj = {
      name,
      item,
      ...(options?.tagClass !== undefined
        ? { tagClass: options.tagClass }
        : {}),
      ...(options?.tagNumber !== undefined
        ? { tagNumber: options.tagNumber }
        : {}),
      ...(options?.optional ? { optional: true as const } : {}),
    };
    return obj as RepeatedTLVSchema<N, Item> & OptionalFlag<O>;
  }
}