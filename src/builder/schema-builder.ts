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
interface PrimitiveTLVSchema<
  N extends string = string,
  EncodedType = DefaultEncodeType,
> extends TLVSchemaBase<N> {
  /**
   * Optional encode function for synchronous encoding.
   * Use a method signature to improve assignability across unions.
   */
  encode?(data: EncodedType): ArrayBuffer;
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

// Describes a repeated TLV schema entry (e.g. SEQUENCE OF).
interface RepeatedTLVSchema<
  N extends string = string,
  Item extends TLVSchema = TLVSchema,
> extends TLVSchemaBase<N> {
  readonly item: Item;
}

type TLVSchema<N extends string = string, E = unknown> =
  | PrimitiveTLVSchema<N, E>
  | ConstructedTLVSchema<N, readonly TLVSchema[]>
  | RepeatedTLVSchema<N, TLVSchema>;

type BuildData<S extends TLVSchema> = S extends ConstructedTLVSchema
  ? BuildDataFromConstructed<S>
  : S extends RepeatedTLVSchema
    ? BuildDataFromRepeated<S>
    : S extends PrimitiveTLVSchema<string, unknown>
      ? BuildDataFromPrimitive<S>
      : never;

type BuildDataFromConstructed<S> =
  S extends ConstructedTLVSchema<string, infer Fields>
    ? Fields extends readonly TLVSchema[]
      ? {
          // required fields
          [K in Fields[number] as K["optional"] extends true
            ? never
            : K["name"]]: BuildData<K>;
        } & {
          // optional fields
          [K in Fields[number] as K["optional"] extends true
            ? K["name"]
            : never]?: BuildData<K>;
        }
      : never
    : never;

// Recursively builds an array of items according to the item schema.

type BuildDataFromRepeated<S> =
  S extends RepeatedTLVSchema<string, infer Item> ? BuildData<Item>[] : never;

type BuildDataFromPrimitive<S> =
  S extends PrimitiveTLVSchema<string, infer E> ? E : never;

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
