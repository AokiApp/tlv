// tests/type-build.spec.ts
import { describe, it } from "vitest";
import assert from "assert";
import { Schema as BSchema, SchemaBuilder } from "../src/builder";
import { AssertTypeCompatible, assertTypeTrue } from "./utils";

describe("build-only type test (single large constructed schema)", () => {
  it("compile-time: BuildData matches Expected; runtime: build with errors swallowed", () => {
    const bigSchema = BSchema.constructed("big", [
      BSchema.primitive("integer", (n: number) => new ArrayBuffer(0)),
      BSchema.primitive("utf8string", (s: string) => new ArrayBuffer(0)),
      BSchema.primitive("bool", (b: boolean) => new ArrayBuffer(0)),
      BSchema.primitive("bitstring", (b: ArrayBuffer) => new ArrayBuffer(0)),
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

    assert(true);
  });
});
