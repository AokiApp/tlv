import { BasicTLVBuilder } from "./basic-builder.js";
import { TagClass } from "../common/types.js";

type DefaultEncodeType = ArrayBuffer;

/**
 * Base interface for a TLV schema object.
 */
interface TLVSchemaBase {
  readonly name: string;
  readonly tagClass?: TagClass;
  readonly tagNumber?: number;
  readonly optional?: boolean;
}

/**
 * Interface for defining a primitive TLV schema.
 * @template EncodedType - The type before encoding.
 */
export interface PrimitiveTLVSchema<EncodedType = DefaultEncodeType>
  extends TLVSchemaBase {
  /**
   * Optional encode function which can return either a value or a Promise of a value.
   */
  readonly encode?: (data: EncodedType) => ArrayBuffer | Promise<ArrayBuffer>;
  readonly defaultValue?: EncodedType;
}

/**
 * Interface for defining a constructed TLV schema.
 * @template F - The array of child field schemas.
 */
export interface ConstructedTLVSchema<F extends readonly TLVSchema[]>
  extends TLVSchemaBase {
  readonly fields: F;
}

interface RepeatedTLVSchema extends TLVSchemaBase {
  readonly item: TLVSchema;
  readonly kind: "repeated";
}

interface ChoiceOption<T extends TLVSchema> {
  readonly name: string;
  readonly schema: T;
}

interface ChoiceTLVSchema<
  Options extends readonly ChoiceOption<TLVSchema>[],
> extends TLVSchemaBase {
  readonly kind: "choice";
  readonly options: Options;
}

type TLVSchema =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | PrimitiveTLVSchema<any>
  | ConstructedTLVSchema<readonly TLVSchema[]>
  | RepeatedTLVSchema
  | ChoiceTLVSchema<readonly ChoiceOption<TLVSchema>[]>;

type OptionalOrDefaultFields<F extends readonly TLVSchema[]> = Extract<
  F[number],
  { optional: true } | { defaultValue: unknown }
>;

type BuildConstructed<F extends readonly TLVSchema[]> = {
  [Field in OptionalOrDefaultFields<F> as Field["name"]]?: BuildData<Field>;
} & {
  [Field in Exclude<F[number], OptionalOrDefaultFields<F>> as Field["name"]]: BuildData<Field>;
};

type BuildValue<S extends TLVSchema> =
  S extends ConstructedTLVSchema<infer F>
    ? BuildConstructed<F>
    : S extends PrimitiveTLVSchema<infer EncodedType>
      ? EncodedType
      : S extends RepeatedTLVSchema
        ? Array<BuildData<S["item"]>>
        : S extends ChoiceTLVSchema<infer O>
          ? ChoiceBuild<O>
        : never;

export type BuildData<S extends TLVSchema> = S extends { optional: true }
  ? BuildValue<S> | undefined
  : BuildValue<S>;

type ChoiceBuild<
  Options extends readonly ChoiceOption<TLVSchema>[],
> = {
  [Option in Options[number]]: {
    type: Option["name"];
    value: BuildData<Option["schema"]>;
  };
}[Options[number]];

/**
 * Checks if a given schema is a constructed schema.
 * @param schema - A TLV schema object.
 * @returns True if the schema has fields; false otherwise.
 */
function isConstructedSchema<F extends readonly TLVSchema[]>(
  schema: TLVSchema,
): schema is ConstructedTLVSchema<F> {
  return (
    "fields" in schema &&
    Array.isArray((schema as ConstructedTLVSchema<F>).fields)
  );
}

function isRepeatedSchema(schema: TLVSchema): schema is RepeatedTLVSchema {
  return (
    (schema as RepeatedTLVSchema).kind === "repeated"
  );
}

function isPrimitiveSchema(
  schema: TLVSchema,
): schema is PrimitiveTLVSchema<unknown> {
  return !isConstructedSchema(schema) && !isRepeatedSchema(schema);
}

function isChoiceSchema(
  schema: TLVSchema,
): schema is ChoiceTLVSchema<readonly ChoiceOption<TLVSchema>[]> {
  return (schema as ChoiceTLVSchema<readonly ChoiceOption<TLVSchema>[]>).kind === "choice";
}

function hasDefaultValue(
  schema: TLVSchema,
): schema is PrimitiveTLVSchema<unknown> & { defaultValue: unknown } {
  return (
    isPrimitiveSchema(schema) && schema.defaultValue !== undefined
  );
}

function arrayBufferEquals(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  for (let i = 0; i < viewA.length; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
    return arrayBufferEquals(a, b);
  }
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  if (a instanceof ArrayBuffer && b instanceof Uint8Array) {
    return valuesEqual(new Uint8Array(a), b);
  }
  if (a instanceof Uint8Array && b instanceof ArrayBuffer) {
    return valuesEqual(a, new Uint8Array(b));
  }
  return Object.is(a, b);
}

// Module-level helpers for DER ordering and lexicographic comparison
function encodeTag(field: TLVSchema): Uint8Array {
  if (isChoiceSchema(field)) {
    const candidateTags = field.options
      .map((option) => encodeTag(option.schema))
      .filter((bytes) => bytes.length > 0)
      .sort(lexCompare);
    return candidateTags[0] ?? new Uint8Array();
  }
  const tagClass = field.tagClass ?? TagClass.Universal;
  const tagNumber = field.tagNumber ?? (isRepeatedSchema(field) ? 16 : 0);
  const constructed =
    isConstructedSchema(field) || isRepeatedSchema(field) ? 0x20 : 0x00;
  const bytes: number[] = [];
  let firstByte = (tagClass << 6) | constructed;
  if (tagNumber < 31) {
    firstByte |= tagNumber;
    bytes.push(firstByte);
  } else {
    firstByte |= 0x1f;
    bytes.push(firstByte);
    let num = tagNumber;
    const tagNumBytes: number[] = [];
    do {
      tagNumBytes.unshift(num % 128);
      num = Math.floor(num / 128);
    } while (num > 0);
    for (let i = 0; i < tagNumBytes.length - 1; i++) {
      bytes.push(tagNumBytes[i] | 0x80);
    }
    bytes.push(tagNumBytes[tagNumBytes.length - 1]);
  }
  return new Uint8Array(bytes);
}

/**
 * Compare two Uint8Arrays lexicographically.
 * Returns -1 if a < b, 1 if a > b, 0 if equal.
 */
function lexCompare(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return 0;
}

/**
 * A builder that builds TLV data based on a given schema (synchronous or asynchronous).
 * @template S - The schema type.
 */
export class SchemaBuilder<S extends TLVSchema> {
  schema: S;
  strict: boolean;

  /**
   * Constructs a SchemaBuilder for the specified schema.
   * @param schema - The TLV schema to use.
   */
  constructor(schema: S, options?: { strict?: boolean }) {
    this.schema = schema;
    this.strict = options?.strict ?? true;
  }

  /**
   * Overloaded method: synchronous version.
   * @param data - The input data matching the schema structure.
   * @returns Built TLV result.
   */
  public build(data: BuildData<S>): ArrayBuffer;

  /**
   * Overloaded method: asynchronous version.
   * @param data - The input data matching the schema structure.
   * @param options - Enable async building.
   * @returns A Promise of built ArrayBuffer.
   */
  public build(
    data: BuildData<S>,
    options: { async: true },
  ): Promise<ArrayBuffer>;

  /**
   * Builds data either in synchronous or asynchronous mode.
   * @param data - The input data matching the schema structure.
   * @param options - If { async: true }, builds asynchronously; otherwise synchronously.
   * @returns Either a built ArrayBuffer or a Promise of a built ArrayBuffer.
   */
  public build(
    data: BuildData<S>,
    options?: { async?: boolean; strict?: boolean },
  ): ArrayBuffer | Promise<ArrayBuffer> {
    const prevStrict = this.strict;
    if (options?.strict !== undefined) {
      this.strict = options.strict;
    }
    try {
      if (options?.async) {
        return this.buildAsync(data);
      } else {
        return this.buildSync(data);
      }
    } finally {
      this.strict = prevStrict;
    }
  }

  /**
   * Builds data in synchronous mode.
   * @param data - The input data.
   * @returns Built TLV result.
   */
  public buildSync(data: BuildData<S>): ArrayBuffer {
    return this.buildWithSchemaSync(this.schema, data);
  }

  /**
   * Builds data in asynchronous mode.
   * @param data - The input data.
   * @returns A Promise of built TLV result.
   */
  public async buildAsync(data: BuildData<S>): Promise<ArrayBuffer> {
    return await this.buildWithSchemaAsync(this.schema, data);
  }

  /**
   * Recursively builds data in synchronous mode.
   * @param schema - The schema to build with.
   * @param data - The data to build.
   * @returns Built result.
   */
  private buildWithSchemaSync<T extends TLVSchema>(
    schema: T,
    data: BuildData<T>,
  ): ArrayBuffer {
    if (isRepeatedSchema(schema)) {
      const items = (data as Array<BuildData<typeof schema.item>>) ?? [];
      const tagNumber = schema.tagNumber ?? 16;
      const tagClass = schema.tagClass ?? TagClass.Universal;
      const enforceDERSetOrdering = this.strict && tagNumber === 17;
      let childBuffers = items.map((itemData) =>
        this.buildWithSchemaSync(schema.item, itemData),
      );

      if (enforceDERSetOrdering) {
        childBuffers = childBuffers.slice().sort((a, b) => {
          const ua = a instanceof Uint8Array ? a : new Uint8Array(a);
          const ub = b instanceof Uint8Array ? b : new Uint8Array(b);
          const len = Math.min(ua.length, ub.length);
          for (let i = 0; i < len; i++) {
            if (ua[i] !== ub[i]) return ua[i] < ub[i] ? -1 : 1;
          }
          if (ua.length !== ub.length) return ua.length < ub.length ? -1 : 1;
          return 0;
        });
      }

      const totalLength = childBuffers.reduce(
        (sum, buf) => sum + buf.byteLength,
        0,
      );
      const childrenData = new Uint8Array(totalLength);
      let offset = 0;
      for (const buffer of childBuffers) {
        const bufView =
          buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        childrenData.set(bufView, offset);
        offset += bufView.byteLength;
      }

      return BasicTLVBuilder.build({
        tag: {
          tagClass,
          tagNumber,
          constructed: true,
        },
        length: childrenData.byteLength,
        value: childrenData.buffer,
        endOffset: 0,
      });
    }

    if (isChoiceSchema(schema)) {
      const choiceData = data as ChoiceBuild<
        readonly ChoiceOption<TLVSchema>[]
      >;
      if (
        choiceData === undefined ||
        choiceData === null ||
        typeof choiceData !== "object"
      ) {
        throw new Error(`Choice field '${schema.name}' requires a selection.`);
      }
      const option = schema.options.find(
        (candidate) => candidate.name === (choiceData as { type?: string }).type,
      );
      if (!option) {
        throw new Error(
          `Invalid choice selection for '${schema.name}': ${(choiceData as { type?: string }).type ?? "undefined"}`,
        );
      }
      return this.buildWithSchemaSync(
        option.schema,
        (choiceData as { value: unknown }).value as BuildData<
          (typeof option)["schema"]
        >,
      );
    }

    if (isConstructedSchema(schema)) {
      let fieldsToProcess = [...schema.fields];

      // For SET, sort fields by tag as required by DER strict mode
      if (
        schema.tagNumber === 17 &&
        (schema.tagClass === TagClass.Universal ||
          schema.tagClass === undefined) &&
        this.strict
      ) {
        fieldsToProcess = fieldsToProcess.slice().sort((a, b) => {
          return lexCompare(encodeTag(a), encodeTag(b));
        });
      }

      const childrenBuffers: ArrayBuffer[] = [];
      for (const fieldSchema of fieldsToProcess) {
        const fieldName = fieldSchema.name;
        const fieldData = (data as Record<string, unknown>)[fieldName];
        const defaultEnabled = hasDefaultValue(fieldSchema);

        if (fieldData === undefined) {
          if (defaultEnabled) {
            continue;
          }
          if (fieldSchema.optional) {
            continue;
          }
          throw new Error(`Missing required field: ${fieldName}`);
        }

        if (
          defaultEnabled &&
          valuesEqual(fieldData, fieldSchema.defaultValue)
        ) {
          continue;
        }

        childrenBuffers.push(
          this.buildWithSchemaSync(
            fieldSchema,
            fieldData as BuildData<typeof fieldSchema>,
          ),
        );
      }

      // Avoid unnecessary ArrayBuffer copies
      const totalLength = childrenBuffers.reduce(
        (sum, buf) => sum + buf.byteLength,
        0,
      );
      const childrenData = new Uint8Array(totalLength);
      let offset = 0;
      for (const buffer of childrenBuffers) {
        const bufView =
          buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        childrenData.set(bufView, offset);
        offset += bufView.byteLength;
      }

      return BasicTLVBuilder.build({
        tag: {
          tagClass: schema.tagClass ?? TagClass.Universal,
          tagNumber: schema.tagNumber ?? 16, // Default to SEQUENCE for constructed
          constructed: true,
        },
        length: childrenData.byteLength,
        value: childrenData.buffer,
        endOffset: 0,
      });
    } else {
      // PrimitiveTLVSchema
      let value: ArrayBuffer;
      if (schema.encode) {
        const encoded = schema.encode(data);
        if (encoded instanceof Promise) {
          throw new Error(
            `Asynchronous encoder used in synchronous build for field: ${schema.name}`,
          );
        }
        value = encoded;
      } else {
        if (!((data as unknown) instanceof ArrayBuffer)) {
          throw new Error(
            `Field '${schema.name}' requires an ArrayBuffer, but received other type.`,
          );
        }
        value = data as ArrayBuffer;
      }

      return BasicTLVBuilder.build({
        tag: {
          tagClass: schema.tagClass ?? TagClass.Universal,
          tagNumber: schema.tagNumber ?? 0,
          constructed: false,
        },
        length: value.byteLength,
        value: value,
        endOffset: 0,
      });
    }
  }

  /**
   * Recursively builds data in asynchronous mode.
   * @param schema - The schema to build with.
   * @param data - The data to build.
   * @returns A Promise of the built result.
   */
  private async buildWithSchemaAsync<T extends TLVSchema>(
    schema: T,
    data: BuildData<T>,
  ): Promise<ArrayBuffer> {
    if (isRepeatedSchema(schema)) {
      const items = (data as Array<BuildData<typeof schema.item>>) ?? [];
      const tagNumber = schema.tagNumber ?? 16;
      const tagClass = schema.tagClass ?? TagClass.Universal;
      const enforceDERSetOrdering = this.strict && tagNumber === 17;
      let childBuffers = await Promise.all(
        items.map((itemData) =>
          this.buildWithSchemaAsync(schema.item, itemData),
        ),
      );
      if (enforceDERSetOrdering) {
        childBuffers = childBuffers.slice().sort((a, b) => {
          const ua = a instanceof Uint8Array ? a : new Uint8Array(a);
          const ub = b instanceof Uint8Array ? b : new Uint8Array(b);
          return lexCompare(ua, ub);
        });
      }

      const totalLength = childBuffers.reduce(
        (sum, buf) => sum + buf.byteLength,
        0,
      );
      const childrenData = new Uint8Array(totalLength);
      let offset = 0;
      for (const buffer of childBuffers) {
        childrenData.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }

      return BasicTLVBuilder.build({
        tag: {
          tagClass,
          tagNumber,
          constructed: true,
        },
        length: childrenData.byteLength,
        value: childrenData.buffer,
        endOffset: 0,
      });
    }

    if (isChoiceSchema(schema)) {
      const choiceData = data as ChoiceBuild<
        readonly ChoiceOption<TLVSchema>[]
      >;
      if (
        choiceData === undefined ||
        choiceData === null ||
        typeof choiceData !== "object"
      ) {
        throw new Error(`Choice field '${schema.name}' requires a selection.`);
      }
      const option = schema.options.find(
        (candidate) => candidate.name === (choiceData as { type?: string }).type,
      );
      if (!option) {
        throw new Error(
          `Invalid choice selection for '${schema.name}': ${(choiceData as { type?: string }).type ?? "undefined"}`,
        );
      }
      return await this.buildWithSchemaAsync(
        option.schema,
        (choiceData as { value: unknown }).value as BuildData<
          (typeof option)["schema"]
        >,
      );
    }

    if (isConstructedSchema(schema)) {
      let fieldsToProcess = [...schema.fields];

      // For SET, sort fields by tag as required by DER strict mode
      if (
        schema.tagNumber === 17 &&
        (schema.tagClass === TagClass.Universal ||
          schema.tagClass === undefined) &&
        this.strict
      ) {
        fieldsToProcess = fieldsToProcess.slice().sort((a, b) => {
          return lexCompare(encodeTag(a), encodeTag(b));
        });
      }

      const buildTasks: Promise<ArrayBuffer>[] = [];
      for (const fieldSchema of fieldsToProcess) {
        const fieldName = fieldSchema.name;
        const fieldData = (data as Record<string, unknown>)[fieldName];
        const defaultEnabled = hasDefaultValue(fieldSchema);

        if (fieldData === undefined) {
          if (defaultEnabled) {
            continue;
          }
          if (fieldSchema.optional) {
            continue;
          }
          throw new Error(`Missing required field: ${fieldName}`);
        }

        if (
          defaultEnabled &&
          valuesEqual(fieldData, fieldSchema.defaultValue)
        ) {
          continue;
        }

        buildTasks.push(
          this.buildWithSchemaAsync(
            fieldSchema,
            fieldData as BuildData<typeof fieldSchema>,
          ),
        );
      }

      const childBuffers = await Promise.all(buildTasks);

      const totalLength = childBuffers.reduce(
        (sum, buf) => sum + buf.byteLength,
        0,
      );
      const childrenData = new Uint8Array(totalLength);
      let offset = 0;
      for (const buffer of childBuffers) {
        childrenData.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }

      return BasicTLVBuilder.build({
        tag: {
          tagClass: schema.tagClass ?? TagClass.Universal,
          tagNumber: schema.tagNumber ?? 16, // Default to SEQUENCE for constructed
          constructed: true,
        },
        length: childrenData.byteLength,
        value: childrenData.buffer,
        endOffset: 0,
      });
    }

    // PrimitiveTLVSchema
    if (!isPrimitiveSchema(schema)) {
      throw new Error("Unsupported schema kind for buildAsync");
    }

    let value: ArrayBuffer;
    if (schema.encode) {
      value = await Promise.resolve(schema.encode(data));
    } else {
      if (!((data as unknown) instanceof ArrayBuffer)) {
        throw new Error(
          `Field '${schema.name}' requires an ArrayBuffer, but received other type.`,
        );
      }
      value = data as ArrayBuffer;
    }

    return BasicTLVBuilder.build({
      tag: {
        tagClass: schema.tagClass ?? TagClass.Universal,
        tagNumber: schema.tagNumber ?? 0,
        constructed: false,
      },
      length: value.byteLength,
      value: value,
      endOffset: 0,
    });
  }
}

/**
 * Utility class for creating new TLV schemas (identical to parser schemas).
 */
export class Schema {
  /**
   * Creates a primitive TLV schema definition.
   * @param name - The name of the field.
   * @param encode - Optional encode function.
   * @param options - Optional tag class and tag number.
   * @returns A primitive TLV schema object.
   */
  // オーバーロード: encode あり（Eを推論）
  public static primitive<N extends string, E>(
    name: N,
    encode: (data: E) => ArrayBuffer | Promise<ArrayBuffer>,
    options?: {
      tagClass?: TagClass;
      tagNumber?: number;
      optional?: boolean;
      defaultValue?: E;
    },
  ): PrimitiveTLVSchema<E> & { name: N };

  // オーバーロード: encode なし（E=ArrayBuffer）
  public static primitive<N extends string>(
    name: N,
    encode?: (data: ArrayBuffer) => ArrayBuffer | Promise<ArrayBuffer>,
    options?: {
      tagClass?: TagClass;
      tagNumber?: number;
      optional?: boolean;
      defaultValue?: ArrayBuffer;
    },
  ): PrimitiveTLVSchema<ArrayBuffer> & { name: N };

  // 実装
  public static primitive<N extends string, E>(
    name: N,
    encode?: (data: E) => ArrayBuffer | Promise<ArrayBuffer>,
    options?: {
      tagClass?: TagClass;
      tagNumber?: number;
      optional?: boolean;
      defaultValue?: E;
    },
  ): PrimitiveTLVSchema<E> & { name: N } {
    const { tagClass, tagNumber, optional, defaultValue } = options ?? {};
    return {
      name,
      encode,
      tagClass,
      tagNumber,
      optional,
      defaultValue,
    };
  }

  /**
   * Creates a constructed TLV schema definition.
   * @param name - The name of the field.
   * @param fields - An array of TLV schema definitions.
   * @param options - Optional tag class and tag number.
   * @returns A constructed TLV schema object.
   */
  public static constructed<N extends string, F extends readonly TLVSchema[]>(
    name: N,
    fields: F,
    options?: {
      tagClass?: TagClass;
      tagNumber?: number;
      optional?: boolean;
    },
  ): ConstructedTLVSchema<F> & { name: N } {
    const { tagClass, tagNumber, optional } = options ?? {};
    return {
      name,
      fields,
      tagClass,
      tagNumber,
      optional,
    };
  }

  /**
   * Creates a repeated TLV schema definition.
   * @param name - The name of the field.
   * @param item - Schema definition for the repeated element.
   * @param options - Optional tag class, tag number, optional flag.
   * @returns A repeated TLV schema object.
   */
  public static repeated<N extends string>(
    name: N,
    item: TLVSchema,
    options?: {
      tagClass?: TagClass;
      tagNumber?: number;
      optional?: boolean;
    },
  ): RepeatedTLVSchema & { name: N } {
    const {
      tagClass,
      tagNumber,
      optional,
    } = options ?? {};
    return {
      name,
      item,
      kind: "repeated",
      tagClass,
      tagNumber,
      optional,
    };
  }

  /**
   * Creates a choice TLV schema definition.
   */
  public static choice<
    N extends string,
    Options extends readonly ChoiceOption<TLVSchema>[],
  >(
    name: N,
    optionsList: Options,
    options?: { optional?: boolean },
  ): ChoiceTLVSchema<Options> & { name: N } {
    return {
      name,
      kind: "choice",
      options: optionsList,
      optional: options?.optional,
    };
  }
}
