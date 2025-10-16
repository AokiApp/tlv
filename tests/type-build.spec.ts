// tests/type-build.spec.ts
import { describe, it } from "vitest";
import assert from "assert";
import { Schema as BSchema, SchemaBuilder } from "@aokiapp/tlv/builder";
import { AssertEqual, assertType } from "./utils";

describe("build-only type test (single large constructed schema)", () => {
  it("compile-time: BuildData matches Expected; runtime: build with errors swallowed", () => {
    const bigSchema = BSchema.constructed("big", [
      BSchema.primitive("num", (n: number) => new ArrayBuffer(0)),
      BSchema.primitive("text", (s: string) => new ArrayBuffer(0)),
      BSchema.primitive("flag", (b: boolean) => new ArrayBuffer(0)),
      BSchema.primitive("maybe", (v: string) => new ArrayBuffer(0), {
        optional: true,
      }),
      BSchema.repeated(
        "tags",
        BSchema.primitive("tag", (t: number) => new ArrayBuffer(0)),
      ),
      BSchema.constructed("inner", [
        BSchema.primitive("x", (x: number) => new ArrayBuffer(0)),
        BSchema.primitive("y", (y: string) => new ArrayBuffer(0), {
          optional: true,
        }),
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

    const schema = new SchemaBuilder(bigSchema);

    type BuilderParam = Parameters<typeof schema.build>[0];
    type _builderMatches = AssertEqual<BuilderParam, Expected>;
    assertType<_builderMatches>(true);

    try {
      schema.build({} as Expected);
    } catch {}

    assert(true);
  });
});
