import type { TagClass } from "../common/types.js";

type DefaultEncodeType = ArrayBuffer;
type SchemaOptions = {
  readonly tagClass?: TagClass;
  readonly tagNumber?: number;
  readonly optional?: true;
};

type OptionalFlag<O extends SchemaOptions | undefined> = O extends {
  optional: true;
}
  ? { readonly optional: true }
  : Record<never, never>;

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
  DecodedType = DefaultEncodeType,
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
export declare class SchemaParser<S extends TLVSchema> {
  readonly schema: S;
  readonly strict: boolean;
  constructor(schema: S, options?: { strict?: boolean });
  // Parses the TLV buffer and returns schema-typed data.
  parse(buffer: ArrayBuffer): ParsedResult<S>;
}

/**
 * Utility class for creating new TLV schemas.
 */
// Convenience factory for constructing schema descriptors consumed by the parser.
export declare class Schema {
  static primitive<
    N extends string,
    D = ArrayBuffer,
    O extends SchemaOptions | undefined = undefined,
  >(
    name: N,
    decode?: (buffer: ArrayBuffer) => D,
    options?: O,
  ): PrimitiveTLVSchema<N, D> & OptionalFlag<O>;
  static constructed<
    N extends string,
    F extends readonly TLVSchema[],
    O extends SchemaOptions | undefined = undefined,
  >(
    name: N,
    fields: F,
    options?: O,
  ): ConstructedTLVSchema<N, F> & OptionalFlag<O>;
  static repeated<
    N extends string,
    Item extends TLVSchema,
    O extends SchemaOptions | undefined = undefined,
  >(
    name: N,
    item: Item,
    options?: O,
  ): RepeatedTLVSchema<N, Item> & OptionalFlag<O>;
}
