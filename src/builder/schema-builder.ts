import { TagClass } from "../common/types.js";
import { BasicTLVBuilder } from "./basic-builder.js";

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
    const tagClass = schema.tagClass ?? TagClass.Universal;
    const { tagNumber } = schema;
    if (typeof tagNumber !== "number") {
      throw new Error(`Primitive field '${schema.name}' is missing tagNumber`);
    }

    let value: ArrayBuffer;
    if (typeof schema.encode === "function") {
      // Cast is safe by contract of schema.encode contravariance
      value = schema.encode(data);
    } else {
      if (data instanceof ArrayBuffer) {
        value = data;
      } else if (data instanceof Uint8Array) {
        // Preserve only the slice for the view
        const copy = new Uint8Array(data.byteLength);
        copy.set(data);
        value = copy.buffer;
      } else {
        throw new Error(
          `Primitive field '${schema.name}' has no encoder and data is not an ArrayBuffer`,
        );
      }
    }

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
    const tagClass = schema.tagClass ?? TagClass.Universal;
    const { tagNumber } = schema;
    if (typeof tagNumber !== "number") {
      throw new Error(
        `Constructed field '${schema.name}' is missing tagNumber`,
      );
    }

    const childBuffers: ArrayBuffer[] = [];

    for (const field of schema.fields) {
      const fieldName = field.name;
      const v = data[fieldName];

      // Missing property handling
      if (v === undefined) {
        if (field.optional) {
          continue;
        }
        if (this.strict) {
          throw new Error(
            `Missing required property '${fieldName}' in constructed '${schema.name}'`,
          );
        }
        // non-strict: ignore unknown/missing
        continue;
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
}

/**
 * Utility class for creating new TLV schemas (identical to parser schemas).
 */
// Convenience factory for constructing schema descriptors used by the builder.
export class Schema {
  static primitive<
    N extends string,
    E = ArrayBuffer,
    O extends SchemaOptions | undefined = undefined,
  >(
    name: N,
    encode?: (data: E) => ArrayBuffer,
    options?: O,
  ): PrimitiveTLVSchema<N, E> & OptionalFlag<O> {
    const obj = {
      name,
      ...(encode ? { encode } : {}),
      ...(options?.tagClass !== undefined
        ? { tagClass: options.tagClass }
        : {}),
      ...(options?.tagNumber !== undefined
        ? { tagNumber: options.tagNumber }
        : {}),
      ...(options?.optional ? { optional: true as const } : {}),
    };
    return obj as PrimitiveTLVSchema<N, E> & OptionalFlag<O>;
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
