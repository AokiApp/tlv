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
export interface PrimitiveTLVSchema<
  N extends string = string,
  DecodedType = DefaultEncodeType,
> extends TLVSchemaBase<N> {
  /**
   * Optional decode function for synchronous decoding.
   */
  readonly decode?: (buffer: ArrayBuffer) => DecodedType;
}

/**
 * Interface for defining a constructed TLV schema.
 * @template F - The array of child field schemas.
 */
export interface ConstructedTLVSchema<
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

export type TLVSchema<N extends string = string> =
  | PrimitiveTLVSchema<N, unknown>
  | ConstructedTLVSchema<N, readonly TLVSchema[]>
  | RepeatedTLVSchema<N, TLVSchema>;

/**
 * ParsedResult type family — readable breakdown
 *
 * Explanation DSL (parse-time):
 * - Primitive(name, DecodedType) => DecodedType
 * - Constructed(name, [field1: Schema, field2?: Schema, ...]) =>
 *     { field1: ParsedResult<Schema>; field2?: ParsedResult<Schema>; ... }
 * - Repeated(name, ItemSchema) => ParsedResult<ItemSchema>[]
 *
 * Notes:
 * - Optional fields are marked with '?' and become optional properties.
 * - Keys are taken from each child schema's 'name' property.
 */
type ParsedConstructedFields<F extends readonly TLVSchema[]> = {
  [Field in F[number] as Field extends { optional: true }
    ? Field["name"]
    : never]?: ParsedResult<Field>;
} & {
  [Field in F[number] as Field extends { optional: true }
    ? never
    : Field["name"]]: ParsedResult<Field>;
};

/**
 * The parse-time representation for a primitive schema is the value
 * after decoding from the TLV buffer.
 */
type ParsedPrimitive<DecodedType> = DecodedType;

/**
 * The parse-time representation for a repeated schema is an array of
 * parse-time values of its item schema.
 */
type ParsedRepeated<Item extends TLVSchema> = Array<ParsedResult<Item>>;

/**
 * Maps a schema to its parse-time data shape.
 * Broken down into aliases above for readability and tooling friendliness.
 */
export type ParsedResult<S extends TLVSchema> =
  S extends ConstructedTLVSchema<string, infer F>
    ? ParsedConstructedFields<F>
    : S extends PrimitiveTLVSchema<string, infer DecodedType>
      ? ParsedPrimitive<DecodedType>
      : S extends RepeatedTLVSchema<string, infer Item>
        ? ParsedRepeated<Item>
        : never;

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
