// tests/type-parse.spec.ts
import { describe, it } from "vitest";
import assert from "assert";
import { Schema as PSchema, SchemaParser } from "@aokiapp/tlv/parser";
import { AssertEqual, assertType } from "./utils";

describe("parse-only type test (single large constructed schema)", () => {
  it("compile-time: ParsedResult matches Expected; runtime: parse with errors swallowed", () => {
    const bigSchema = PSchema.constructed("big", [
      PSchema.primitive("num", (_: ArrayBuffer) => 0),
      PSchema.primitive("text", (_: ArrayBuffer) => ""),
      PSchema.primitive("flag", (_: ArrayBuffer) => true),
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
      num: number;
      text: string;
      flag: boolean;
      maybe?: string;
      tags: number[];
      inner: { x: number; y?: string };
    };

    const parser = new SchemaParser(bigSchema);

    type ParserReturn = ReturnType<typeof parser.parse>;
    type _parserMatches = AssertEqual<ParserReturn, Expected>;
    assertType<_parserMatches>(true);

    try {
      parser.parse(new ArrayBuffer(0));
    } catch {}

    assert(true);
  });
});
