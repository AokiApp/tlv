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
 * @template EncodedType - The type before encoding.
 */
export interface PrimitiveTLVSchema<
  N extends string = string,
  EncodedType = DefaultEncodeType,
> extends TLVSchemaBase<N> {
  /**
   * Optional encode function for synchronous encoding.
   */
  readonly encode?: (data: EncodedType) => ArrayBuffer;
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

// Describes a repeated TLV schema entry (e.g. SEQUENCE OF).
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
 * BuildData type family — readable breakdown
 *
 * Explanation DSL (build-time):
 * - Primitive(name, EncodedType) => EncodedType
 * - Constructed(name, [field1: Schema, field2?: Schema, ...]) =>
 *     { field1: BuildData<Schema>; field2?: BuildData<Schema>; ... }
 * - Repeated(name, ItemSchema) => BuildData<ItemSchema>[]
 *
 * Notes:
 * - Optional fields are marked with '?' in the DSL and become optional properties.
 * - Keys are taken from each child schema's 'name' property.
 */
type BuildDataConstructedFields<F extends readonly TLVSchema[]> = {
  [Field in F[number] as Field extends { optional: true }
    ? Field["name"]
    : never]?: BuildData<Field>;
} & {
  [Field in F[number] as Field extends { optional: true }
    ? never
    : Field["name"]]: BuildData<Field>;
};

/**
 * The build-time representation for a primitive schema is the input
 * value prior to encoding.
 */
type BuildDataPrimitive<EncodedType> = EncodedType;

/**
 * The build-time representation for a repeated schema is an array of
 * build-time values of its item schema.
 */
type BuildDataRepeated<Item extends TLVSchema> = Array<BuildData<Item>>;

/**
 * Maps a schema to its build-time data shape.
 * Broken down into aliases above for readability and tooling friendliness.
 */
export type BuildData<S extends TLVSchema> =
  S extends ConstructedTLVSchema<string, infer F>
    ? BuildDataConstructedFields<F>
    : S extends PrimitiveTLVSchema<string, infer EncodedType>
      ? BuildDataPrimitive<EncodedType>
      : S extends RepeatedTLVSchema<string, infer Item>
        ? BuildDataRepeated<Item>
        : never;

// Builds TLV payloads according to the provided schema definition.
export declare class SchemaBuilder<S extends TLVSchema> {
  readonly schema: S;
  readonly strict: boolean;
  constructor(schema: S, options?: { strict?: boolean });
  // Encodes the supplied data into TLV using the schema rules.
  build(data: BuildData<S>): ArrayBuffer;
}

/**
 * Utility class for creating new TLV schemas (identical to parser schemas).
 */
// Convenience factory for constructing schema descriptors used by the builder.
export declare class Schema {
  static primitive<
    N extends string,
    E = ArrayBuffer,
    O extends SchemaOptions | undefined = undefined,
  >(
    name: N,
    encode?: (data: E) => ArrayBuffer,
    options?: O,
  ): PrimitiveTLVSchema<N, E> & OptionalFlag<O>;
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
