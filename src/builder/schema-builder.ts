import { TagClass } from "../common/types.js";
import { BasicTLVBuilder } from "./basic-builder.js";

type DefaultEncodeType = ArrayBuffer;
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
  encode(data: EncodedType): ArrayBuffer;
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

// Describes a repeated TLV schema entry (e.g. SEQUENCE/SET OF).
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

/**
 * A TLV builder that encodes data according to a provided schema.
 * Strict mode enforces presence of all required fields and type expectations.
 */
export class SchemaBuilder<S extends TLVSchema> {
  public readonly schema: S;
  public readonly strict: boolean;

  public constructor(schema: S, options?: { strict?: boolean }) {
    this.schema = schema;
    this.strict = options?.strict ?? true;
  }

  // Encodes the supplied data into TLV using the schema rules.
  public build(data: BuildData<S>): ArrayBuffer {
    return this.encodeTopLevel(this.schema, data);
  }

  private encodeTopLevel(schema: TLVSchema, data: unknown): ArrayBuffer {
    if (this.isConstructed(schema)) {
      return this.encodeConstructed(
        schema,
        (data ?? {}) as Record<string, unknown>,
      );
    }
    if (this.isRepeated(schema)) {
      // Top-level repeated has no tag to wrap items; disallow to keep TLV well-formed.
      throw new Error(
        `Top-level repeated schema '${schema.name}' is not supported. Wrap it in a constructed container.`,
      );
    }
    return this.encodePrimitive(schema, data);
  }

  private encodePrimitive(
    schema: PrimitiveTLVSchema<string, unknown>,
    data: unknown,
  ): ArrayBuffer {
    const { tagNumber, tagClass } = schema;

    const value = schema.encode(data);

    return BasicTLVBuilder.build({
      tag: { tagClass, constructed: false, tagNumber },
      length: value.byteLength,
      value,
      endOffset: 0,
    });
  }

  private encodeConstructed(
    schema: ConstructedTLVSchema<string, readonly TLVSchema[]>,
    data: Record<string, unknown>,
  ): ArrayBuffer {
    const { tagNumber, tagClass } = schema;

    const childBuffers: ArrayBuffer[] = [];

    for (const field of schema.fields) {
      const fieldName = field.name;
      const v = data[fieldName];

      // Missing property handling
      if (v === undefined) {
        if (field.optional) {
          continue;
        }
        throw new Error(
          `Missing required property '${fieldName}' in constructed '${schema.name}'`,
        );
      }

      if (this.isRepeated(field)) {
        if (!Array.isArray(v)) {
          throw new Error(`Repeated field '${fieldName}' expects an array`);
        }
        const items = v as unknown[];
        for (const item of items) {
          const itemTLV = this.encodeTopLevel(field.item, item);
          childBuffers.push(itemTLV);
        }
        continue;
      }

      if (this.isConstructed(field)) {
        const childTLV = this.encodeConstructed(
          field,
          v as Record<string, unknown>,
        );
        childBuffers.push(childTLV);
        continue;
      }

      // Primitive child
      const primTLV = this.encodePrimitive(field, v);
      childBuffers.push(primTLV);
    }

    // For SET, enforce DER canonical ordering when strict=true; preserve input order when strict=false
    if (schema.isSet === true && this.strict === true) {
      childBuffers.sort((a, b) => this.compareUnsignedLex(a, b));
    }

    const inner = this.concatBuffers(childBuffers);
    return BasicTLVBuilder.build({
      tag: { tagClass, constructed: true, tagNumber },
      length: inner.byteLength,
      value: inner,
      endOffset: 0,
    });
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

  private concatBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const b of buffers) {
      out.set(new Uint8Array(b), off);
      off += b.byteLength;
    }
    return out.buffer;
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
}

/**
 * Utility class for creating new TLV schemas (identical to parser schemas).
 */
// Convenience factory for constructing schema descriptors used by the builder.
export class Schema {
  /**
   * Infer whether a constructed UNIVERSAL tag indicates SET or SEQUENCE.
   * - Returns true for UNIVERSAL tagNumber 17 (SET)
   * - Returns false for UNIVERSAL tagNumber 16 (SEQUENCE)
   * - Returns undefined for other classes/numbers
   */
  static inferIsSetFromTag(
    tagClass?: TagClass,
    tagNumber?: number,
  ): boolean | undefined {
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
    O extends SchemaOptions,
    EncodedType = ArrayBuffer,
  >(
    name: N,
    options: O,
    encode: (data: EncodedType) => ArrayBuffer = (data: EncodedType) =>
      data as ArrayBuffer,
  ): PrimitiveTLVSchema<N, EncodedType> & OptionalFlag<O> {
    const tagNumber = options.tagNumber;
    if (typeof tagNumber !== "number") {
      throw new Error(`Primitive schema '${name}' requires tagNumber`);
    }
    const obj = {
      name,
      encode,
      tagClass: options?.tagClass ?? TagClass.Universal,
      tagNumber,
      optional: options?.optional ? (true as const) : (false as const),
    };
    return obj as PrimitiveTLVSchema<N, EncodedType> & OptionalFlag<O>;
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
        : Schema.inferIsSetFromTag(tagClassNormalized, options?.tagNumber);
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
