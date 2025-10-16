import { TagClass } from "../common/types.js";
import { BasicTLVParser } from "./basic-parser.js";

type DefaultDecodeType = ArrayBuffer;
type SchemaOptions = {
  readonly tagClass?: TagClass;
  readonly tagNumber?: number;
  readonly optional?: true;
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
    return this.parsePrimitive(schema, buffer);
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
    const out: Record<string, unknown> = {};

    // Pre-initialize arrays for repeated fields (always present)
    for (const field of schema.fields) {
      if (this.isRepeated(field)) {
        out[field.name] = [];
      }
    }

    let offset = 0;
    while (offset < inner.byteLength) {
      const slice = inner.slice(offset);
      const childTLV = BasicTLVParser.parse(slice);
      const childRaw = inner.slice(offset, offset + childTLV.endOffset);
      offset += childTLV.endOffset;

      let handled = false;

      for (const field of schema.fields) {
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

          if (
            childTLV.tag.tagClass === itemClass &&
            childTLV.tag.tagNumber === itemNumber &&
            childTLV.tag.constructed === itemConstructed
          ) {
            const parsedItem = this.parseTopLevel(item, childRaw);
            (out[field.name] as unknown[]).push(parsedItem);
            handled = true;
            break;
          }
          continue;
        }

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
            const parsedChild = this.parseConstructed(field, childRaw);
            out[field.name] = parsedChild;
            handled = true;
            break;
          }
          continue;
        }

        // Primitive child
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
          const parsedValue = this.parsePrimitive(field, childRaw);
          out[field.name] = parsedValue;
          handled = true;
          break;
        }
      }

      if (!handled) {
        if (this.strict) {
          throw new Error(
            `Unknown child TLV with tagNumber=${childTLV.tag.tagNumber} in constructed '${schema.name}'`,
          );
        }
        // non-strict: ignore unknown children
      }
    }

    // Enforce presence of required (non-optional) fields in strict mode.
    if (this.strict) {
      for (const field of schema.fields) {
        const name = field.name;
        if (this.isRepeated(field)) {
          // Always present because of pre-initialization
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
