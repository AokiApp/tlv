// tests/types/parse.types.test.ts
import { describe, it } from "vitest";
import { Schema as PSchema, SchemaParser } from "../../src/parser";
import { AssertTypeCompatible, assertTypeTrue } from "../helpers/utils";

describe("parse-only type test (single large constructed schema)", () => {
  it("compile-time: ParsedResult matches Expected; runtime: parse with errors swallowed", () => {
    const bigSchema = PSchema.constructed(
      "big",
      { tagNumber: 16 },
      [
        PSchema.primitive("integer", { tagNumber: 2 }, (_: ArrayBuffer) => 0),
        PSchema.primitive("utf8string", { tagNumber: 12 }, (_: ArrayBuffer) => ""),
        PSchema.primitive("bool", { tagNumber: 1 }, (_: ArrayBuffer) => true),
        PSchema.primitive("bitstring", { tagNumber: 3 }, (_: ArrayBuffer) => new ArrayBuffer(0)),
        PSchema.primitive("maybe", { optional: true, tagNumber: 12 }, (_: ArrayBuffer) => ""),
        PSchema.repeated("tags", {}, PSchema.primitive("tag", { tagNumber: 2 }, (_: ArrayBuffer) => 0)),
        PSchema.constructed(
          "inner",
          { tagNumber: 16 },
          [
            PSchema.primitive("x", { tagNumber: 2 }, (_: ArrayBuffer) => 0),
            PSchema.primitive("y", { optional: true, tagNumber: 12 }, (_: ArrayBuffer) => ""),
          ],
        ),
      ],
    );

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
    const listSchema = PSchema.constructed(
      "list",
      { tagNumber: 16 },
      [
        PSchema.repeated(
          "items",
          {},
          PSchema.constructed(
            "item",
            { tagNumber: 16 },
            [
              PSchema.primitive("id", { tagNumber: 2 }, (_: ArrayBuffer) => 0),
              PSchema.primitive("name", { optional: true, tagNumber: 12 }, (_: ArrayBuffer) => ""),
            ],
          ),
        ),
      ],
    );

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
    const optionalSchema = PSchema.constructed(
      "optional",
      { tagNumber: 16 },
      [
        PSchema.primitive("a", { optional: true, tagNumber: 12 }, (_: ArrayBuffer) => ""),
        PSchema.primitive("b", { optional: true, tagNumber: 2 }, (_: ArrayBuffer) => 0),
      ],
    );

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
    const simpleSchema = PSchema.constructed(
      "simple",
      { tagNumber: 16 },
      [
        PSchema.primitive("bitstring", { tagNumber: 3 }, (_: ArrayBuffer) => new ArrayBuffer(0)),
        PSchema.repeated("tags", {}, PSchema.primitive("tag", { tagNumber: 2 }, (_: ArrayBuffer) => 0)),
      ],
    );

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
    const deepSchema = PSchema.constructed(
      "outer",
      { tagNumber: 16 },
      [
        PSchema.constructed(
          "middle",
          { tagNumber: 16 },
          [
            PSchema.constructed(
              "inner",
              { tagNumber: 16 },
              [
                PSchema.primitive("n", { tagNumber: 2 }, (_: ArrayBuffer) => 0),
                PSchema.primitive("flag", { optional: true, tagNumber: 1 }, (_: ArrayBuffer) => true),
              ],
            ),
          ],
        ),
      ],
    );

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
    const groupSchema = PSchema.constructed(
      "groupList",
      { tagNumber: 16 },
      [
        PSchema.repeated(
          "groups",
          {},
          PSchema.constructed(
            "group",
            { tagNumber: 16 },
            [
              PSchema.primitive("name", { tagNumber: 12 }, (_: ArrayBuffer) => ""),
              PSchema.repeated(
                "members",
                {},
                PSchema.constructed(
                  "member",
                  { tagNumber: 16 },
                  [
                    PSchema.primitive("id", { tagNumber: 2 }, (_: ArrayBuffer) => 0),
                    PSchema.primitive("active", { optional: true, tagNumber: 1 }, (_: ArrayBuffer) => true),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );

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
    const boolsSchema = PSchema.constructed(
      "bools",
      { tagNumber: 16 },
      [PSchema.repeated("flags", {}, PSchema.primitive("flag", { tagNumber: 1 }, (_: ArrayBuffer) => true))],
    );

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