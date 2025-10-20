// tests/types/build.types.test.ts
import { describe, it } from "vitest";
import { Schema as BSchema, SchemaBuilder } from "../../src/builder";
import { AssertTypeCompatible, assertTypeTrue } from "../helpers/utils";

describe("build-only type test (single large constructed schema)", () => {
  it("compile-time: BuildData matches Expected; runtime: build with errors swallowed", () => {
    const bigSchema = BSchema.constructed("big", {}, [
      BSchema.primitive(
        "integer",
        { tagNumber: 0x02 },
        (n: number) => new ArrayBuffer(0),
      ),
      BSchema.primitive(
        "utf8string",
        { tagNumber: 0x0c },
        (s: string) => new ArrayBuffer(0),
      ),
      BSchema.primitive(
        "bool",
        { tagNumber: 0x01 },
        (b: boolean) => new ArrayBuffer(0),
      ),
      BSchema.primitive(
        "bitstring",
        { tagNumber: 0x03 },
        (b: ArrayBuffer) => new ArrayBuffer(0),
      ),
      BSchema.primitive(
        "maybe",
        { optional: true, tagNumber: 0x15 },
        (v: string) => new ArrayBuffer(0),
      ),
      BSchema.repeated(
        "tags",
        {},
        BSchema.primitive(
          "tag",
          { tagNumber: 0x16 },
          (t: number) => new ArrayBuffer(0),
        ),
      ),
      BSchema.constructed("inner", {}, [
        BSchema.primitive(
          "x",
          { tagNumber: 0x10 },
          (x: number) => new ArrayBuffer(0),
        ),
        BSchema.primitive(
          "y",
          { optional: true, tagNumber: 0x11 },
          (y: string) => new ArrayBuffer(0),
        ),
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

    const schema = new SchemaBuilder(bigSchema);

    type BuilderParam = Parameters<typeof schema.build>[0];
    type _builderMatches = AssertTypeCompatible<BuilderParam, Expected>;
    assertTypeTrue<_builderMatches>(true);

    try {
      schema.build({
        integer: 42,
        inner: { y: "hello", x: 7 },
        utf8string: "test",
        bool: true,
        bitstring: new ArrayBuffer(1),
        tags: [1, 2, 3],
      });
    } catch {}
  });

  it("compile-time: repeated constructed items type inference; runtime: build sample", () => {
    const listSchema = BSchema.constructed("list", {}, [
      BSchema.repeated(
        "items",
        {},
        BSchema.constructed("item", {}, [
          BSchema.primitive(
            "id",
            { tagNumber: 0x10 },
            (n: number) => new ArrayBuffer(0),
          ),
          BSchema.primitive(
            "name",
            { optional: true, tagNumber: 0x11 },
            (s: string) => new ArrayBuffer(0),
          ),
        ]),
      ),
    ]);

    type ExpectedList = { items: { id: number; name?: string }[] };

    const listBuilder = new SchemaBuilder(listSchema);

    type ListParam = Parameters<typeof listBuilder.build>[0];
    type _listMatches = AssertTypeCompatible<ListParam, ExpectedList>;
    assertTypeTrue<_listMatches>(true);

    try {
      listBuilder.build({ items: [{ id: 1 }, { id: 2, name: "b" }] });
    } catch {}
  });

  it("compile-time: only optional fields accept empty object; runtime: build empty", () => {
    const optionalSchema = BSchema.constructed("optional", {}, [
      BSchema.primitive(
        "a",
        { optional: true, tagNumber: 0x0c },
        (s: string) => new ArrayBuffer(0),
      ),
      BSchema.primitive(
        "b",
        { optional: true, tagNumber: 0x02 },
        (n: number) => new ArrayBuffer(0),
      ),
    ]);

    type ExpectedOptional = { a?: string; b?: number };
    const optionalBuilder = new SchemaBuilder(optionalSchema);

    type OptionalParam = Parameters<typeof optionalBuilder.build>[0];
    type _optionalMatches = AssertTypeCompatible<
      OptionalParam,
      ExpectedOptional
    >;
    assertTypeTrue<_optionalMatches>(true);

    try {
      optionalBuilder.build({});
    } catch {}
  });

  it("compile-time: simple schema with ArrayBuffer and empty repeated array", () => {
    const simpleSchema = BSchema.constructed("simple", {}, [
      BSchema.primitive(
        "bitstring",
        { tagNumber: 0x03 },
        (b: ArrayBuffer) => new ArrayBuffer(0),
      ),
      BSchema.repeated(
        "tags",
        {},
        BSchema.primitive(
          "tag",
          { tagNumber: 0x16 },
          (t: number) => new ArrayBuffer(0),
        ),
      ),
    ]);

    type ExpectedSimple = { bitstring: ArrayBuffer; tags: number[] };
    const simpleBuilder = new SchemaBuilder(simpleSchema);

    type SimpleParam = Parameters<typeof simpleBuilder.build>[0];
    type _simpleMatches = AssertTypeCompatible<SimpleParam, ExpectedSimple>;
    assertTypeTrue<_simpleMatches>(true);

    try {
      simpleBuilder.build({ bitstring: new ArrayBuffer(0), tags: [] });
    } catch {}
  });

  it("compile-time: deep nested constructed types; runtime: build sample", () => {
    const deepSchema = BSchema.constructed("outer", {}, [
      BSchema.constructed("middle", {}, [
        BSchema.constructed("inner", {}, [
          BSchema.primitive(
            "n",
            { tagNumber: 0x02 },
            (x: number) => new ArrayBuffer(0),
          ),
          BSchema.primitive(
            "flag",
            { optional: true, tagNumber: 0x01 },
            (b: boolean) => new ArrayBuffer(0),
          ),
        ]),
      ]),
    ]);

    type ExpectedDeep = { middle: { inner: { n: number; flag?: boolean } } };
    const deepBuilder = new SchemaBuilder(deepSchema);

    type DeepParam = Parameters<typeof deepBuilder.build>[0];
    type _deepMatches = AssertTypeCompatible<DeepParam, ExpectedDeep>;
    assertTypeTrue<_deepMatches>(true);

    try {
      deepBuilder.build({ middle: { inner: { n: 1 } } });
    } catch {}
  });

  it("compile-time: nested repeated with optional inner fields; runtime: build sample", () => {
    const groupSchema = BSchema.constructed("groupList", {}, [
      BSchema.repeated(
        "groups",
        {},
        BSchema.constructed("group", {}, [
          BSchema.primitive(
            "name",
            { tagNumber: 0x0c },
            (s: string) => new ArrayBuffer(0),
          ),
          BSchema.repeated(
            "members",
            {},
            BSchema.constructed("member", {}, [
              BSchema.primitive(
                "id",
                { tagNumber: 0x02 },
                (n: number) => new ArrayBuffer(0),
              ),
              BSchema.primitive(
                "active",
                { optional: true, tagNumber: 0x01 },
                (b: boolean) => new ArrayBuffer(0),
              ),
            ]),
          ),
        ]),
      ),
    ]);

    type ExpectedGroup = {
      groups: { name: string; members: { id: number; active?: boolean }[] }[];
    };
    const groupBuilder = new SchemaBuilder(groupSchema);

    type GroupParam = Parameters<typeof groupBuilder.build>[0];
    type _groupMatches = AssertTypeCompatible<GroupParam, ExpectedGroup>;
    assertTypeTrue<_groupMatches>(true);

    try {
      groupBuilder.build({
        groups: [{ name: "g1", members: [{ id: 1 }, { id: 2, active: true }] }],
      });
    } catch {}
  });

  it("compile-time: repeated primitive booleans; runtime: build sample", () => {
    const boolsSchema = BSchema.constructed("bools", {}, [
      BSchema.repeated(
        "flags",
        {},
        BSchema.primitive(
          "flag",
          { tagNumber: 0x01 },
          (b: boolean) => new ArrayBuffer(0),
        ),
      ),
    ]);

    type ExpectedBools = { flags: boolean[] };
    const boolsBuilder = new SchemaBuilder(boolsSchema);

    type BoolsParam = Parameters<typeof boolsBuilder.build>[0];
    type _boolsMatches = AssertTypeCompatible<BoolsParam, ExpectedBools>;
    assertTypeTrue<_boolsMatches>(true);

    try {
      boolsBuilder.build({ flags: [true, false, true] });
    } catch {}
  });
});
