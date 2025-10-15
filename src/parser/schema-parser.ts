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
 * @template DecodedType - The type after decoding.
 */
export interface PrimitiveTLVSchema<DecodedType = DefaultEncodeType>
  extends TLVSchemaBase {
  /**
   * Optional decode function for synchronous decoding.
   */
  readonly decode?: (buffer: ArrayBuffer) => DecodedType;
}

/**
 * Interface for defining a constructed TLV schema.
 * @template F - The array of child field schemas.
 */
export interface ConstructedTLVSchema<F extends readonly TLVSchema[]>
  extends TLVSchemaBase {
  readonly fields: F;
}

// Describes a repeated TLV schema entry (e.g. SET/SEQUENCE OF).
interface RepeatedTLVSchema extends TLVSchemaBase {
  readonly item: TLVSchema;
  readonly optional?: true;
}

export type TLVSchema =
  | PrimitiveTLVSchema<unknown>
  | ConstructedTLVSchema<readonly TLVSchema[]>
  | RepeatedTLVSchema;

/**
 * ParsedResult&lt;S&gt; describes the TypeScript shape produced by SchemaParser for a TLV schema S.
 *
 * Rules:
 * 1) Primitive fields:
 *    - The result is the DecodedType for that primitive (default: ArrayBuffer), i.e., what decode(buffer) returns.
 *
 * 2) Constructed containers (SEQUENCE/SET-like):
 *    - The result is an object whose keys come from each field schema's `name`.
 *    - Required fields (no `optional` flag) are present as required properties.
 *    - Optional fields (`optional: true`) appear as optional properties (using the `?` modifier).
 *
 * 3) Repeated fields (SEQUENCE OF / SET OF):
 *    - The result is Array&lt;ParsedResult&lt;item&gt;&gt; where `item` is the nested field schema.
 *
 * 4) Optional flag type discrimination:
 *    - The flag is a literal `optional?: true` on a field schema.
 *    - It is used purely for type-level discrimination to determine if a property should be optional.
 *
 * 5) Runtime vs. typing:
 *    - Strict mode and runtime validation are separate concerns.
 *    - ParsedResult only models the static shape implied by the schema; it does not enforce runtime presence.
 *
 * Pseudo-code (informal):
 *   function TypeOfParsedResult(schema S):
 *     if S is Constructed(fields F):
 *       let R = {}
 *       for each field f in F:
 *         key = f.name
 *         valueType = TypeOfParsedResult(f)
 *         if f.optional === true:
 *           R[key]? = valueType // optional property
 *         else:
 *           R[key] = valueType  // required property
 *       return R
 *     else if S is Primitive(decodedType D):
 *       return D
 *     else if S is Repeated(item I):
 *       return Array&lt;TypeOfParsedResult(I)&gt;
 *
 * Notes:
 * - The `optional` flag does not change array element types; it only toggles property optionality in constructed objects.
 * - Keys are computed from Field["name"]; duplicate names should be avoided and may lead to undefined behavior.
 */
export type ParsedResult<S extends TLVSchema> =
  S extends ConstructedTLVSchema<infer F>
    ? {
        [Field in F[number] as Field extends { optional: true }
          ? Field["name"]
          : never]?: ParsedResult<Field>;
      } & {
        [Field in F[number] as Field extends { optional: true }
          ? never
          : Field["name"]]: ParsedResult<Field>;
      }
    : S extends PrimitiveTLVSchema<infer DecodedType>
      ? DecodedType
      : S extends RepeatedTLVSchema
        ? Array<ParsedResult<S["item"]>>
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
  static primitive<N extends string, D = ArrayBuffer>(
    name: N,
    decode?: (buffer: ArrayBuffer) => D,
    options?: {
      tagClass?: TagClass;
      tagNumber?: number;
    },
  ): PrimitiveTLVSchema<D> & { name: N };
  static constructed<N extends string, F extends readonly TLVSchema[]>(
    name: N,
    fields: F,
    options?: {
      tagClass?: TagClass;
      tagNumber?: number;
    },
  ): ConstructedTLVSchema<F> & { name: N };
}
