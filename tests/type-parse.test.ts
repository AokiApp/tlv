// tests/type-parse.spec.ts
import { describe, it } from "vitest";
import { Schema as PSchema, SchemaParser } from "../src/parser";
import { AssertTypeCompatible, assertTypeTrue } from "./utils";

describe("parse-only type test (single large constructed schema)", () => {
  it("compile-time: ParsedResult matches Expected; runtime: parse with errors swallowed", () => {
    const bigSchema = PSchema.constructed("big", [
      PSchema.primitive("integer", (_: ArrayBuffer) => 0, { tagNumber: 2 }),
      PSchema.primitive("utf8string", (_: ArrayBuffer) => "", { tagNumber: 12 }),
      PSchema.primitive("bool", (_: ArrayBuffer) => true, { tagNumber: 1 }),
      PSchema.primitive("bitstring", (_: ArrayBuffer) => new ArrayBuffer(0), { tagNumber: 3 }),
      PSchema.primitive("maybe", (_: ArrayBuffer) => "", { optional: true, tagNumber: 12 }),
      PSchema.repeated(
        "tags",
        PSchema.primitive("tag", (_: ArrayBuffer) => 0, { tagNumber: 2 }),
      ),
      PSchema.constructed("inner", [
        PSchema.primitive("x", (_: ArrayBuffer) => 0, { tagNumber: 2 }),
        PSchema.primitive("y", (_: ArrayBuffer) => "", { optional: true, tagNumber: 12 }),
      ], { tagNumber: 16 }),
    ], { tagNumber: 16 });
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

  });

  it("compile-time: repeated constructed items type inference; runtime: parse sample", () => {
    const listSchema = PSchema.constructed("list", [
      PSchema.repeated(
        "items",
        PSchema.constructed("item", [
          PSchema.primitive("id", (_: ArrayBuffer) => 0, { tagNumber: 2 }),
          PSchema.primitive("name", (_: ArrayBuffer) => "", { optional: true, tagNumber: 12 }),
        ], { tagNumber: 16 }),
      ),
    ], { tagNumber: 16 });

    type ExpectedList = { items: { id: number; name?: string }[] };

    const listParser = new SchemaParser(listSchema);

    type ListReturn = ReturnType<typeof listParser.parse>;
    type _listMatches = AssertTypeCompatible<ListReturn, ExpectedList>;
    assertTypeTrue<_listMatches>(true);

    try {
      listParser.parse(new ArrayBuffer(0));
    } catch {}

  });

  it("compile-time: only optional fields accept empty result", () => {
    const optionalSchema = PSchema.constructed("optional", [
      PSchema.primitive("a", (_: ArrayBuffer) => "", { optional: true, tagNumber: 12 }),
      PSchema.primitive("b", (_: ArrayBuffer) => 0, { optional: true, tagNumber: 2 }),
    ], { tagNumber: 16 });

    type ExpectedOptional = { a?: string; b?: number };
    const optionalParser = new SchemaParser(optionalSchema);

    type OptionalReturn = ReturnType<typeof optionalParser.parse>;
    type _optionalMatches = AssertTypeCompatible<
      OptionalReturn,
      ExpectedOptional
    >;
    assertTypeTrue<_optionalMatches>(true);

    try {
      optionalParser.parse(new ArrayBuffer(0));
    } catch {}

  });

  it("compile-time: simple schema with ArrayBuffer and repeated numbers", () => {
    const simpleSchema = PSchema.constructed("simple", [
      PSchema.primitive("bitstring", (_: ArrayBuffer) => new ArrayBuffer(0), { tagNumber: 3 }),
      PSchema.repeated(
        "tags",
        PSchema.primitive("tag", (_: ArrayBuffer) => 0, { tagNumber: 2 }),
      ),
    ], { tagNumber: 16 });

    type ExpectedSimple = { bitstring: ArrayBuffer; tags: number[] };
    const simpleParser = new SchemaParser(simpleSchema);

    type SimpleReturn = ReturnType<typeof simpleParser.parse>;
    type _simpleMatches = AssertTypeCompatible<SimpleReturn, ExpectedSimple>;
    assertTypeTrue<_simpleMatches>(true);

    try {
      simpleParser.parse(new ArrayBuffer(0));
    } catch {}

  });

  it("compile-time: deep nested constructed types; runtime: parse sample", () => {
    const deepSchema = PSchema.constructed("outer", [
      PSchema.constructed("middle", [
        PSchema.constructed("inner", [
          PSchema.primitive("n", (_: ArrayBuffer) => 0, { tagNumber: 2 }),
          PSchema.primitive("flag", (_: ArrayBuffer) => true, {
            optional: true,
            tagNumber: 1,
          }),
        ], { tagNumber: 16 }),
      ], { tagNumber: 16 }),
    ], { tagNumber: 16 });

    type ExpectedDeep = { middle: { inner: { n: number; flag?: boolean } } };
    const deepParser = new SchemaParser(deepSchema);

    type DeepReturn = ReturnType<typeof deepParser.parse>;
    type _deepMatches = AssertTypeCompatible<DeepReturn, ExpectedDeep>;
    assertTypeTrue<_deepMatches>(true);

    try {
      deepParser.parse(new ArrayBuffer(0));
    } catch {}

  });

  it("compile-time: nested repeated with optional inner fields; runtime: parse sample", () => {
    const groupSchema = PSchema.constructed("groupList", [
      PSchema.repeated(
        "groups",
        PSchema.constructed("group", [
          PSchema.primitive("name", (_: ArrayBuffer) => "", { tagNumber: 12 }),
          PSchema.repeated(
            "members",
            PSchema.constructed("member", [
              PSchema.primitive("id", (_: ArrayBuffer) => 0, { tagNumber: 2 }),
              PSchema.primitive("active", (_: ArrayBuffer) => true, {
                optional: true,
                tagNumber: 1,
              }),
            ], { tagNumber: 16 }),
          ),
        ], { tagNumber: 16 }),
      ),
    ], { tagNumber: 16 });

    /**
     * groupList ::= SEQUENCE {
     *   groups ::= SEQUENCE OF {
     *     name ::= UTF8String
     *     members ::= SEQUENCE OF {
     *       id ::= INTEGER
     *       active ::= BOOLEAN OPTIONAL
     *     }
     *   }
     * }
     */

    type ExpectedGroup = {
      groups: { name: string; members: { id: number; active?: boolean }[] }[];
    };
    const groupParser = new SchemaParser(groupSchema);

    type GroupReturn = ReturnType<typeof groupParser.parse>;
    type _groupMatches = AssertTypeCompatible<GroupReturn, ExpectedGroup>;
    assertTypeTrue<_groupMatches>(true);

    try {
      groupParser.parse(new ArrayBuffer(0));
    } catch {}

  });

  it("compile-time: repeated primitive booleans; runtime: parse sample", () => {
    const boolsSchema = PSchema.constructed("bools", [
      PSchema.repeated(
        "flags",
        PSchema.primitive("flag", (_: ArrayBuffer) => true, { tagNumber: 1 }),
      ),
    ], { tagNumber: 16 });

    type ExpectedBools = { flags: boolean[] };
    const boolsParser = new SchemaParser(boolsSchema);

    type BoolsReturn = ReturnType<typeof boolsParser.parse>;
    type _boolsMatches = AssertTypeCompatible<BoolsReturn, ExpectedBools>;
    assertTypeTrue<_boolsMatches>(true);

    try {
      boolsParser.parse(new ArrayBuffer(0));
    } catch {}

  });
});
