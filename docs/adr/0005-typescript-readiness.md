# ADR 0005 – TypeScript readiness without a big-bang migration

- Status: Accepted, updated 2026-11-24
- Date: 2026-11-20

## Context

The project was a small CommonJS/Node.js application. A full TypeScript rewrite
would risk regressions and slow down feature work. At the same time the codebase
should become easier for humans and AI tools to understand and refactor.

## Decision

Prepare for TypeScript incrementally instead of migrating everything at once:

1. Keep runtime code as CommonJS JavaScript.
2. Add `lib/types.js` and `lib/ports.js` as the single source of truth for
   domain types and application ports, written as JSDoc.
3. Enable `checkJs` through `jsconfig.json` with `strict: false` initially.
4. Migrate module by module to `// @ts-check` and stricter compiler options.
5. Introduce TypeScript only for `domain` and `application` first, then
   `infrastructure`, then `http`.
6. Keep runtime validation at all system boundaries; TypeScript types never
   replace validation.

Update 2026-11-24: steps 2 and 3 were superseded when the backend migration
completed: `lib/types.ts` and `lib/ports.ts` were removed, `jsconfig.json` was
removed, and the backend is now fully typed TypeScript (`nodenext`, `strict:
true`) with tests typed selectively in `test/`.

## Consequences

- IDEs and AI tools get useful type information without a build step.
- The migration can be done file by file.
- Runtime behaviour stays unchanged.
- `strict: true` is a later goal, not the starting point.
