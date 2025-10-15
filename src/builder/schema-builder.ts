import type { TagClass } from "../common/types.js";

type DefaultEncodeType = ArrayBuffer;

/**
 * Base interface for a TLV schema object.
 */
interface TLVSchemaBase {
  readonly name: string;
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
export interface PrimitiveTLVSchema<EncodedType = DefaultEncodeType>
  extends TLVSchemaBase {
  /**
   * Optional encode function for synchronous encoding.
   */
  readonly encode?: (data: EncodedType) => ArrayBuffer;
}

/**
 * Interface for defining a constructed TLV schema.
 * @template F - The array of child field schemas.
 */
export interface ConstructedTLVSchema<F extends readonly TLVSchema[]>
  extends TLVSchemaBase {
  readonly fields: F;
}

// Describes a repeated TLV schema entry (e.g. SEQUENCE OF).
interface RepeatedTLVSchema extends TLVSchemaBase {
  readonly item: TLVSchema;
  readonly optional?: true;
}

export type TLVSchema =
  | PrimitiveTLVSchema<unknown>
  | ConstructedTLVSchema<readonly TLVSchema[]>
  | RepeatedTLVSchema;

export type BuildData<S extends TLVSchema> =
  S extends ConstructedTLVSchema<infer F>
    ? {
        [Field in F[number] as Field extends { optional: true }
          ? Field["name"]
          : never]?: BuildData<Field>;
      } & {
        [Field in F[number] as Field extends { optional: true }
          ? never
          : Field["name"]]: BuildData<Field>;
      }
    : S extends PrimitiveTLVSchema<infer EncodedType>
      ? EncodedType
      : S extends RepeatedTLVSchema
        ? Array<BuildData<S["item"]>>
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
  static primitive<N extends string, E = ArrayBuffer>(
    name: N,
    encode?: (data: E) => ArrayBuffer,
    options?: {
      tagClass?: TagClass;
      tagNumber?: number;
    },
  ): PrimitiveTLVSchema<E> & { name: N };
  static constructed<N extends string, F extends readonly TLVSchema[]>(
    name: N,
    fields: F,
    options?: {
      tagClass?: TagClass;
      tagNumber?: number;
    },
  ): ConstructedTLVSchema<F> & { name: N };
}
