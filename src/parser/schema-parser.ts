import { BasicTLVParser } from "./basic-parser.js";

import { TagClass, TagInfo } from "../common/types.js";

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
 * @template DecodedType - The type after decoding.
 */
export interface PrimitiveTLVSchema<DecodedType = DefaultEncodeType>
  extends TLVSchemaBase {
  /**
   * Optional decode function which can return either a value or a Promise of a value.
   */
  readonly decode?: (buffer: ArrayBuffer) => DecodedType | Promise<DecodedType>;
  readonly defaultValue?: DecodedType;
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
  | PrimitiveTLVSchema<unknown>
  | ConstructedTLVSchema<readonly TLVSchema[]>
  | RepeatedTLVSchema
  | ChoiceTLVSchema<readonly ChoiceOption<TLVSchema>[]>;

type ParsedConstructed<F extends readonly TLVSchema[]> = {
  [Field in Extract<F[number], { optional: true }> as Field["name"]]?: ParsedResult<Field>;
} & {
  [Field in Exclude<F[number], { optional: true }> as Field["name"]]: ParsedResult<Field>;
};

type ParsedValue<S extends TLVSchema> =
  S extends ConstructedTLVSchema<infer F>
    ? ParsedConstructed<F>
    : S extends PrimitiveTLVSchema<infer DecodedType>
      ? DecodedType
      : S extends RepeatedTLVSchema
        ? Array<ParsedResult<S["item"]>>
        : S extends ChoiceTLVSchema<infer O>
          ? ChoiceParsed<O>
        : never;

type ParsedResult<S extends TLVSchema> = S extends { optional: true }
  ? ParsedValue<S> | undefined
  : ParsedValue<S>;

type ChoiceParsed<
  Options extends readonly ChoiceOption<TLVSchema>[],
> = {
  [Option in Options[number]]: {
    type: Option["name"];
    value: ParsedResult<Option["schema"]>;
  };
}[Options[number]];

/**
 * Checks if a given schema is a constructed schema.
 * @param schema - A TLV schema object.
 * @returns True if the schema has fields; false otherwise.
 */
function isConstructedSchema(
  schema: TLVSchema,
): schema is ConstructedTLVSchema<readonly TLVSchema[]> {
  return (
    "fields" in schema &&
    Array.isArray(
      (schema as unknown as ConstructedTLVSchema<readonly TLVSchema[]>).fields,
    )
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
/**
 * A parser that parses TLV data based on a given schema (synchronous or asynchronous).
 * @template S - The schema type.
 */
export class SchemaParser<S extends TLVSchema> {
  schema: S;
  buffer = new ArrayBuffer(0);
  view = new DataView(this.buffer);
  offset = 0;
  strict: boolean;

  /**
   * Constructs a SchemaParser for the specified schema.
   * @param schema - The TLV schema to use.
   */
  constructor(schema: S, options?: { strict?: boolean }) {
    this.schema = schema;
    this.strict = options?.strict ?? false;
  }

  /**
   * Overloaded method: synchronous version.
   * @param buffer - The input data as an ArrayBuffer.
   * @returns Parsed result matching the schema.
   */
  public parse(buffer: ArrayBuffer): ParsedResult<S>;

  /**
   * Overloaded method: asynchronous version.
   * @param buffer - The input data as an ArrayBuffer.
   * @param options - Enable async parsing.
   * @returns A Promise of parsed result matching the schema.
   */
  public parse(
    buffer: ArrayBuffer,
    options: { async: true },
  ): Promise<ParsedResult<S>>;

  /**
   * Parses data either in synchronous or asynchronous mode.
   * @param buffer - The input data as an ArrayBuffer.
   * @param options - If { async: true }, parses asynchronously; otherwise synchronously.
   * @returns Either a parsed result or a Promise of a parsed result.
   */
  public parse(
    buffer: ArrayBuffer,
    options?: { async?: boolean; strict?: boolean },
  ): ParsedResult<S> | Promise<ParsedResult<S>> {
    const prevStrict = this.strict;
    if (options?.strict !== undefined) {
      this.strict = options.strict;
    }
    try {
      if (options?.async) {
        return this.parseAsync(buffer);
      } else {
        return this.parseSync(buffer);
      }
    } finally {
      this.strict = prevStrict;
    }
  }

  /**
   * Parses data in synchronous mode.
   * @param buffer - The input data.
   * @returns Parsed result matching the schema.
   */
  public parseSync(buffer: ArrayBuffer): ParsedResult<S> {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.offset = 0;
    return this.parseWithSchemaSync(this.schema);
  }

  /**
   * Parses data in asynchronous mode.
   * @param buffer - The input data.
   * @returns A Promise of parsed result matching the schema.
   */
  public async parseAsync(buffer: ArrayBuffer): Promise<ParsedResult<S>> {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.offset = 0;
    return await this.parseWithSchemaAsync(this.schema);
  }

  /**
   * Recursively parses data in synchronous mode.
   * @param schema - The schema to parse with.
   * @returns Parsed result.
   */
  private parseWithSchemaSync<T extends TLVSchema>(schema: T): ParsedResult<T> {
    const subBuffer = this.buffer.slice(this.offset);

    if (isChoiceSchema(schema)) {
      const { value, consumed } = this.parseChoiceSync(subBuffer, schema);
      this.offset += consumed;
      return value as ParsedResult<T>;
    }

    const { tag, value, endOffset } = BasicTLVParser.parse(subBuffer);
    this.offset += endOffset;

    this.validateTagInfo(tag, schema);

    if (isRepeatedSchema(schema)) {
      let subOffset = 0;
      const results = [] as Array<ParsedResult<typeof schema.item>>;
      const tagNumber = schema.tagNumber ?? 16;
      const enforceDERSetOrdering = this.strict && tagNumber === 17;
      const encodedChildren: Uint8Array[] = [];
      while (subOffset < value.byteLength) {
        const childTLV = BasicTLVParser.parse(value.slice(subOffset));
        encodedChildren.push(
          new Uint8Array(
            value.slice(subOffset, subOffset + childTLV.endOffset),
          ),
        );

        const childParser = new SchemaParser(schema.item, {
          strict: this.strict,
        });
        const parsedChild = childParser.parse(value.slice(subOffset));
        results.push(parsedChild);

        subOffset += childTLV.endOffset;
      }

      if (subOffset !== value.byteLength) {
        throw new Error(
          "Constructed element does not end exactly at the expected length.",
        );
      }

      if (enforceDERSetOrdering) {
        for (let i = 1; i < encodedChildren.length; i++) {
          const a = encodedChildren[i - 1];
          const b = encodedChildren[i];
          const len = Math.min(a.length, b.length);
          let cmp = 0;
          for (let j = 0; j < len; j++) {
            if (a[j] !== b[j]) {
              cmp = a[j] < b[j] ? -1 : 1;
              break;
            }
          }
          if (cmp === 0) {
            cmp = a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
          }
          if (cmp > 0) {
            throw new Error("SET elements are not in DER lexicographic order.");
          }
        }
      }

      return results as ParsedResult<T>;
    }

    if (isConstructedSchema(schema)) {
      let subOffset = 0;
      let fieldsToProcess = [...schema.fields];

      // strictモード時、SET要素の順序をDER仕様で検証
      if (
        schema.tagNumber === 17 &&
        (schema.tagClass === TagClass.Universal ||
          schema.tagClass === undefined) &&
        this.strict
      ) {
        fieldsToProcess = fieldsToProcess.slice().sort((a, b) => {
          const encodeTag = (field: TLVSchema) => {
            const tagClass = field.tagClass ?? TagClass.Universal;
            const tagNumber = field.tagNumber ?? 0;
            const constructed =
              isConstructedSchema(field) || isRepeatedSchema(field)
                ? 0x20
                : 0x00;
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
          };
          return compareUint8Arrays(encodeTag(a), encodeTag(b));
        });

        /**
         * Compare two Uint8Arrays lexicographically.
         * Returns -1 if a < b, 1 if a > b, 0 if equal.
         */
        function compareUint8Arrays(a: Uint8Array, b: Uint8Array): number {
          const len = Math.min(a.length, b.length);
          for (let i = 0; i < len; i++) {
            if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
          }
          if (a.length !== b.length) return a.length < b.length ? -1 : 1;
          return 0;
        }
      }

      const result = {} as {
        [K in (typeof fieldsToProcess)[number] as K["name"]]: ParsedResult<K>;
      };

      for (const field of fieldsToProcess) {
        const evaluation = this.evaluateField(value, subOffset, field);
        if (evaluation === "skip") {
          continue;
        }
        if (evaluation === "default") {
          if (!isPrimitiveSchema(field)) {
            throw new Error(
              `Default value is only supported for primitive fields: ${field.name}`,
            );
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          result[field.name] = field.defaultValue as ParsedResult<typeof field>;
          continue;
        }
        const fieldParser = new SchemaParser(field, { strict: this.strict });
        result[field.name] = fieldParser.parse(value.slice(subOffset));
        subOffset += fieldParser.offset;
      }

      if (subOffset !== value.byteLength) {
        throw new Error(
          "Constructed element does not end exactly at the expected length.",
        );
      }

      return result as ParsedResult<T>;
    } else if (isPrimitiveSchema(schema)) {
      if (schema.decode) {
        const decoded = schema.decode(value);
        if (
          decoded instanceof Promise ||
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
          (decoded as any)?.then instanceof Function
        ) {
          throw new Error(
            `Asynchronous decoder used in synchronous parse for field: ${schema.name}`,
          );
        }
        return decoded as ParsedResult<T>;
      }
      return value as ParsedResult<T>;
    } else {
      throw new Error("Unsupported TLV schema kind for parseSync");
    }
  }

  /**
   * Recursively parses data in asynchronous mode.
   * @param schema - The schema to parse with.
   * @returns A Promise of the parsed result.
   */
  private async parseWithSchemaAsync<T extends TLVSchema>(
    schema: T,
  ): Promise<ParsedResult<T>> {
    const subBuffer = this.buffer.slice(this.offset);

    if (isChoiceSchema(schema)) {
      const { value, consumed } = await this.parseChoiceAsync(subBuffer, schema);
      this.offset += consumed;
      return value as ParsedResult<T>;
    }

    const { tag, value, endOffset } = BasicTLVParser.parse(subBuffer);
    this.offset += endOffset;

    this.validateTagInfo(tag, schema);

    if (isRepeatedSchema(schema)) {
      let subOffset = 0;
      const results = [] as Array<ParsedResult<typeof schema.item>>;
      const tagNumber = schema.tagNumber ?? 16;
      const enforceDERSetOrdering = this.strict && tagNumber === 17;
      const encodedChildren: Uint8Array[] = [];
      while (subOffset < value.byteLength) {
        const childTLV = BasicTLVParser.parse(value.slice(subOffset));
        encodedChildren.push(
          new Uint8Array(
            value.slice(subOffset, subOffset + childTLV.endOffset),
          ),
        );
        const fieldParser = new SchemaParser(schema.item, {
          strict: this.strict,
        });
        const parsedField = await fieldParser.parseAsync(
          value.slice(subOffset),
        );
        results.push(parsedField);
        subOffset += childTLV.endOffset;
      }

      if (subOffset !== value.byteLength) {
        throw new Error(
          "Constructed element does not end exactly at the expected length.",
        );
      }

      if (enforceDERSetOrdering) {
        for (let i = 1; i < encodedChildren.length; i++) {
          const a = encodedChildren[i - 1];
          const b = encodedChildren[i];
          const len = Math.min(a.length, b.length);
          let cmp = 0;
          for (let j = 0; j < len; j++) {
            if (a[j] !== b[j]) {
              cmp = a[j] < b[j] ? -1 : 1;
              break;
            }
          }
          if (cmp === 0) {
            cmp = a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
          }
          if (cmp > 0) {
            throw new Error("SET elements are not in DER lexicographic order.");
          }
        }
      }

      return results as ParsedResult<T>;
    }

    if (isConstructedSchema(schema)) {
      let subOffset = 0;
      let fieldsToProcess = [...schema.fields];

      if (
        schema.tagNumber === 17 &&
        (schema.tagClass === TagClass.Universal ||
          schema.tagClass === undefined) &&
        this.strict
      ) {
        fieldsToProcess = fieldsToProcess.slice().sort((a, b) => {
          const encodeTag = (field: TLVSchema) => {
            const tagClass = field.tagClass ?? TagClass.Universal;
            const tagNumber = field.tagNumber ?? 0;
            const constructed =
              isConstructedSchema(field) || isRepeatedSchema(field)
                ? 0x20
                : 0x00;
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
          };
          return compareUint8Arrays(encodeTag(a), encodeTag(b));
        });

        function compareUint8Arrays(a: Uint8Array, b: Uint8Array): number {
          const len = Math.min(a.length, b.length);
          for (let i = 0; i < len; i++) {
            if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
          }
          if (a.length !== b.length) return a.length < b.length ? -1 : 1;
          return 0;
        }
      }

      const result = {} as {
        [K in (typeof fieldsToProcess)[number] as K["name"]]: ParsedResult<K>;
      };

      for (const field of fieldsToProcess) {
        const evaluation = this.evaluateField(value, subOffset, field);
        if (evaluation === "skip") {
          continue;
        }
        if (evaluation === "default") {
          if (!isPrimitiveSchema(field)) {
            throw new Error(
              `Default value is only supported for primitive fields: ${field.name}`,
            );
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          result[field.name] = field.defaultValue as ParsedResult<typeof field>;
          continue;
        }
        const fieldParser = new SchemaParser(field, { strict: this.strict });
        const parsedField = await fieldParser.parseAsync(
          value.slice(subOffset),
        );
        result[field.name] = parsedField;
        subOffset += fieldParser.offset;
      }

      if (subOffset !== value.byteLength) {
        throw new Error(
          "Constructed element does not end exactly at the expected length.",
        );
      }

      return result as ParsedResult<T>;
    } else if (isPrimitiveSchema(schema)) {
      if (schema.decode) {
        // decode might return a Promise, so it is awaited
        const decoded = schema.decode(value);
        return (await Promise.resolve(decoded)) as ParsedResult<T>;
      }
      return value as ParsedResult<T>;
    } else {
      throw new Error("Unsupported TLV schema kind for parseAsync");
    }
  }

  /**
   * Validates tag information against the expected schema.
   * @param tagInfo - The parsed tag info.
   * @param schema - The schema to validate.
   * @throws Error if tag class, tag number, or constructed status does not match.
   */
  private validateTagInfo(tagInfo: TagInfo, schema: TLVSchema): void {
    if (schema.tagClass !== undefined && schema.tagClass !== tagInfo.tagClass) {
      throw new Error(
        `Tag class mismatch: expected ${schema.tagClass}, but got ${tagInfo.tagClass}`,
      );
    }
    const expectedConstructed =
      isConstructedSchema(schema) || isRepeatedSchema(schema);
    if (expectedConstructed !== tagInfo.constructed) {
      throw new Error(
        `Tag constructed flag mismatch: expected ${expectedConstructed}, but got ${tagInfo.constructed}`,
      );
    }
    if (
      schema.tagNumber !== undefined &&
      schema.tagNumber !== tagInfo.tagNumber
    ) {
      throw new Error(
        `Tag number mismatch: expected ${schema.tagNumber}, but got ${tagInfo.tagNumber}`,
      );
    }
  }

  private parseChoiceSync<
    Options extends readonly ChoiceOption<TLVSchema>[],
  >(
    buffer: ArrayBuffer,
    schema: ChoiceTLVSchema<Options>,
  ): {
    value: ChoiceParsed<Options>;
    consumed: number;
  } {
    const peeked = BasicTLVParser.peekTag(buffer);
    if (!peeked) {
      throw new Error(`Choice field '${schema.name}' is empty`);
    }
    const option = this.findChoiceOption(peeked.tag, schema);
    if (!option) {
      throw new Error(
        `No matching choice option found for tag class=${peeked.tag.tagClass}, number=${peeked.tag.tagNumber}`,
      );
    }
    const optionParser = new SchemaParser(option.schema, {
      strict: this.strict,
    });
    const value = optionParser.parse(buffer);
    return {
      value: {
        type: option.name,
        value: value as ParsedResult<typeof option.schema>,
      } as ChoiceParsed<Options>,
      consumed: optionParser.offset,
    };
  }

  private async parseChoiceAsync<
    Options extends readonly ChoiceOption<TLVSchema>[],
  >(
    buffer: ArrayBuffer,
    schema: ChoiceTLVSchema<Options>,
  ): Promise<{
    value: ChoiceParsed<Options>;
    consumed: number;
  }> {
    const peeked = BasicTLVParser.peekTag(buffer);
    if (!peeked) {
      throw new Error(`Choice field '${schema.name}' is empty`);
    }
    const option = this.findChoiceOption(peeked.tag, schema);
    if (!option) {
      throw new Error(
        `No matching choice option found for tag class=${peeked.tag.tagClass}, number=${peeked.tag.tagNumber}`,
      );
    }
    const optionParser = new SchemaParser(option.schema, {
      strict: this.strict,
    });
    const value = await optionParser.parseAsync(buffer);
    return {
      value: {
        type: option.name,
        value: value as ParsedResult<typeof option.schema>,
      } as ChoiceParsed<Options>,
      consumed: optionParser.offset,
    };
  }

  private findChoiceOption<
    Options extends readonly ChoiceOption<TLVSchema>[],
  >(
    tagInfo: TagInfo,
    schema: ChoiceTLVSchema<Options>,
  ): ChoiceOption<TLVSchema> | undefined {
    return schema.options.find((option) =>
      this.doesTagMatch(tagInfo, option.schema),
    );
  }

  private evaluateField(
    container: ArrayBuffer,
    offset: number,
    field: TLVSchema,
  ): "parse" | "skip" | "default" {
    const optional = field.optional ?? false;
    const hasDefault =
      isPrimitiveSchema(field) && field.defaultValue !== undefined;

    if (offset >= container.byteLength) {
      if (hasDefault) {
        return "default";
      }
      if (optional) {
        return "skip";
      }
      throw new Error(`Missing required field: ${field.name}`);
    }

    const peeked = BasicTLVParser.peekTag(container, offset);
    if (!peeked) {
      if (hasDefault) {
        return "default";
      }
      if (optional) {
        return "skip";
      }
      throw new Error(`Missing required field: ${field.name}`);
    }

    if (!this.doesTagMatch(peeked.tag, field)) {
      if (hasDefault) {
        return "default";
      }
      if (optional) {
        return "skip";
      }
      throw new Error(`Tag mismatch or missing required field: ${field.name}`);
    }

    return "parse";
  }

  private doesTagMatch(tagInfo: TagInfo, schema: TLVSchema): boolean {
    if (isChoiceSchema(schema)) {
      return schema.options.some((option) =>
        this.doesTagMatch(tagInfo, option.schema),
      );
    }
    if (schema.tagClass !== undefined && schema.tagClass !== tagInfo.tagClass) {
      return false;
    }

    const expectedConstructed =
      isConstructedSchema(schema) || isRepeatedSchema(schema);
    if (expectedConstructed !== tagInfo.constructed) {
      return false;
    }

    if (
      schema.tagNumber !== undefined &&
      schema.tagNumber !== tagInfo.tagNumber
    ) {
      return false;
    }

    return true;
  }
}

/**
 * Utility class for creating new TLV schemas.
 */
export class Schema {
  /**
   * Creates a primitive TLV schema definition.
   * @param name - The name of the field.
   * @param decode - Optional decode function.
   * @param options - Optional tag class and tag number.
   * @returns A primitive TLV schema object.
   */
  public static primitive<N extends string, D = ArrayBuffer>(
    name: N,
    decode?: (buffer: ArrayBuffer) => D | Promise<D>,
    options?: {
      tagClass?: TagClass;
      tagNumber?: number;
      optional?: boolean;
      defaultValue?: D;
    },
  ): PrimitiveTLVSchema<D> & { name: N } {
    const { tagClass, tagNumber, optional, defaultValue } = options ?? {};
    return {
      name,
      decode,
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
   * Creates a repeated TLV parser schema.
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
   * Creates a choice schema definition.
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
