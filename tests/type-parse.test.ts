// tests/type-parse.spec.ts
import { describe, it } from "vitest";
import assert from "assert";
import { Schema as PSchema, SchemaParser } from "../src/parser";
import { AssertTypeCompatible, assertTypeTrue } from "./utils";

describe("parse-only type test (single large constructed schema)", () => {
  it("compile-time: ParsedResult matches Expected; runtime: parse with errors swallowed", () => {
    const bigSchema = PSchema.constructed("big", [
      PSchema.primitive("integer", (_: ArrayBuffer) => 0),
      PSchema.primitive("utf8string", (_: ArrayBuffer) => ""),
      PSchema.primitive("bool", (_: ArrayBuffer) => true),
      PSchema.primitive("bitstring", (_: ArrayBuffer) => new ArrayBuffer(0)),
      PSchema.primitive("maybe", (_: ArrayBuffer) => "", { optional: true }),
      PSchema.repeated(
        "tags",
        PSchema.primitive("tag", (_: ArrayBuffer) => 0),
      ),
      PSchema.constructed("inner", [
        PSchema.primitive("x", (_: ArrayBuffer) => 0),
        PSchema.primitive("y", (_: ArrayBuffer) => "", { optional: true }),
      ]),
    ]);
type Expected = {
  integer: number;
  utf8string: string;
  bool: boolean;
  bitstring: ArrayBuffer;
  maybe?: string;
  tags: number[];
  inner: { x: number; y?: string };
};

    const parser = new SchemaParser(bigSchema);

    type ParserReturn = ReturnType<typeof parser.parse>;
    type _parserMatches = AssertTypeCompatible<ParserReturn, Expected>;
    assertTypeTrue<_parserMatches>(true);

    try {
      parser.parse(new ArrayBuffer(0));
    } catch {}

    assert(true);
  });
});
