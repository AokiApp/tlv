# what you should do

Read @/examples/crcl/spec.md @/README.md @/examples/crcl/SHINSEI.der @/examples/crcl/parse-crcl-by-schema.ts

Try to understand how the schema is defined according to the spec, and how the schema parser works.

Try to implement example code in @/examples/crcl/parse-crcl-by-schema.ts

Run `npx tsx examples/crcl/parse-crcl-by-schema.ts` to see the result.

Implement missing functions in @src

Do the implement-run-test cycle.

Don't stop working until you can successfully parse the SHINSEI.der file by schema parser.

Please make sure that your work is 本質的ly correct and not doing the wrong thing , such as just making the tests pass without understanding the code.

# Note

Some types like SET OF are not implemented yet. Previous implementation skipped them. You might need to implement them if needed.

# Caution

Please be careful and conservative when you change the existing interfaces and behaviors. It's ok to add new features, but don't break the existing ones.

# When you want to do experiments rather than serious work

You can create a new file and try things out.

parse-crcl-by-schema.ts is the main example file. The main purpose is not to find bugs in the library, but to show how to use the library. So please try to keep it clean and simple.
Instead, you can create a new file like examples/crcl/experiment.ts and do experimental works.

Also, you are allowed to inject console.log in the library code for debugging purpose. But please make sure to remove them when you finish your work.

# what you should do in brief

understand what to do
for(;;) {
npx tsx
implement example file
implement missing functions in src if needed
if (success && your work is 本質的ly correct && ! doing the wrong thing (e.g. always pass) ) break;
check if you did not calling attempt_completion() too early
}

call attempt_completion

You can:

- make new functions in src
- add debugging console.log in src as long as you remove them later
- create debugging/experiment purpose files in examples/crcl
- demonstrate whether shinsei parsing work in parse-crcl-by-schema.ts (not the debugging/experiment purpose)
