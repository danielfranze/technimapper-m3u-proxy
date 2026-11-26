# ADR 0007 – Frontend TypeScript with plain `tsc` (no bundler)

- Status: Accepted
- Date: 2026-11-25
- Supersedes: ADR-0005 (frontend part)

## Context

The frontend is vanilla JavaScript in `public/app/`: `main.js`, `api.js` and
`lib/{model,view,presenter,dom}.js` (~1,400 lines). It is checked with
`checkJs` + JSDoc (`tsconfig.frontend.json`), which already gives `strict`
type safety without a build step. In practice, however, the JSDoc annotations
are verbose (`@typedef`, `@template`, `@type` casts), API response shapes are
maintained by hand, and the backend is fully TypeScript. The question is
whether to switch the frontend to TypeScript as well.

Constraints:

- No framework, no SPA rewrite; the frontend stays small and modular.
- Static assets are served by Express from `public/`; the UI must work without
  a Node process on the client (obviously).
- Node.js 26, ESM only, no CommonJS.
- No `any`; strict compiler flags stay enabled.
- No user-visible behaviour changes during the migration.
- Keep tooling minimal; this is a self-hosted single-maintainer project.

## Decision

1. **Sources move to `frontend/**/*.ts`; output stays static.** `tsc` emits
   ES2022 ESM to `public/app/js/`. No bundler (no esbuild, Vite, Rollup or
   webpack): six modules do not justify a second toolchain, and unbundled ESM
   keeps module boundaries and browser debugging intact.
2. **Keep `.js` extensions in import specifiers.** TypeScript does not rewrite
   specifiers, and browsers need `./lib/model.js`. In TS sources we write
   `import { model } from './lib/model.js'`; `tsc` resolves that to
   `model.ts` and emits it unchanged. This is validated by the compiler and by
   the E2E tests, not by convention alone.
3. **One frontend tsconfig, two modes.** `tsconfig.frontend.json` gets
   `rootDir: frontend`, `outDir: public/app/js`, `noEmitOnError`,
   `sourceMap`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, DOM libs,
   `types: []` and the existing strict flags. `allowJs`/`checkJs` are removed.
   `npm run check:frontend` runs it with `--noEmit`; `npm run build:frontend`
   emits.
4. **Build is split, not replaced.**
    - `build:backend` → `tsc -p tsconfig.json` (today's `npm run build`)
    - `build:frontend` → `tsc -p tsconfig.frontend.json`
    - `build` → both, in that order
    - `check` stays backend-only; `check:frontend` stays separate so CI can
      label failures precisely.
5. **Keep `frontend/lib/dom.ts`.** The helpers are not a JSDoc workaround; they
   are the explicit DOM contract (`byId` fails fast, `maybeInputById` returns
   `null`, `queryAll` returns a real array). They translate 1:1 to TypeScript.
6. **Tests import TypeScript sources; E2E tests the emitted artifact.**
   Unit tests use `tsx` and get exact types from the source. The E2E suite
   starts the real server, loads `public/app/js/main.js` and therefore proves
   that the emitted module graph works in a browser. A page-error listener is
   added to the smoke test.
7. **Generated output is not committed.** `public/app/js/` is gitignored and
   dockerignored. `index.html` points to `app/js/main.js`; the Docker builder
   runs `npm run build` and copies `public/` (including the generated files)
   into the runtime image.
8. **Coverage excludes the frontend**, as it already excludes `public/**`:
   `--test-coverage-exclude=frontend/**`. Backend thresholds stay unchanged.

## Target layout

```
frontend/
  main.ts            # event wiring
  api.ts             # typed endpoint wrappers
  lib/
    dom.ts           # typed DOM access
    model.ts         # state + pure logic
    view.ts          # DOM rendering
    presenter.ts     # business logic
public/
  index.html         # <script type="module" src="app/js/main.js">
  app/
    styles.css       # unchanged
    js/              # generated, gitignored
      main.js
      api.js
      lib/{dom,model,view,presenter}.js
public/fonts/        # unchanged
```

## Migration plan

### Phase 1 – Pipeline prototype (≈0.5 day)

- Add `frontend/` with `main.ts`, `api.ts`, `lib/dom.ts` as a thin proof:
  compile, serve, confirm the browser loads the emitted ESM graph.
- Add `build:frontend` / `build:backend`; verify `tsc --noEmit` and emit do
  not interfere (`outDir` + `--noEmit`).
- Keep the current JS frontend live until Phase 2 is green.

### Phase 2 – Mechanical conversion, bottom-up (≈1 day)

Convert one module per commit, without behaviour changes:

1. `dom.ts` – pure signatures, no logic changes.
2. `model.ts` – `Mapping`, `Filter`, `CopySource`, `DuplicateGroup`,
   `Model` as exported types; `localStorage` access stays guarded.
3. `api.ts` – `ConfigResponse`, `SaveSettingsResponse`, `FetchChannelsResponse`,
   `SaveMappingResponse`, `ImportConfigResponse`; generic `postJson<T>` /
   `getJson<T>`; `JSON.parse` stays `unknown` behind the typed wrapper.
4. `view.ts` – replace JSDoc casts with real types; `Record<CopySource, …>`
   becomes a real record type; keep the DOM helpers.
5. `presenter.ts` – type the API results and the `askUnsaved` dialog flow.
6. `main.ts` – typed event wiring; `eventTarget()` keeps the
   `EventTarget → Element | null` narrowing in one place.

After each step: `npm run check:frontend`, affected unit tests, and a quick
manual/E2E smoke test for `view`/`presenter`/`main`.

### Phase 3 – Static paths and build integration (≈2 h)

- Move generated output under `public/app/js/`; update `index.html`.
- `.gitignore` and `.dockerignore`: ignore `public/app/js/`.
- `npm test` builds frontend before tests (it already builds the backend).
- `scripts/coverage.js`: exclude `frontend/**`.
- Docker: no structural change; `npm run build` now emits both. Verify the
  runtime image contains `public/app/js/main.js` and not `frontend/`.

### Phase 4 – Tests (≈2 h)

- Update imports in `frontend-mvp.test.ts`, `ui-dirty.test.ts`,
  `ui-format.test.ts`, `ui-copy.test.ts`, `ui-ids.test.ts` to
  `../frontend/...` (`.ts` specifiers, `tsx` runtime).
- Add `"lib": ["ES2022", "DOM", "DOM.Iterable"]` to `test/tsconfig.json`;
  a probe against the current suite showed no conflicts with `@types/node`.
- Source-text tests (`ui-dropdown`, `ui-format`, `ui-copy`) read from `frontend/`.
- Replace the `node --check` syntax test with a build-artifact test:
  `public/app/js/main.js` exists, is ESM, and `index.html` references it.
- E2E: fail the smoke test on `pageerror`; existing UI flows already prove the
  wiring works.

### Phase 5 – CI, release and docs (≈1 h)

- CI/release already call `check:frontend`; it now checks TS. `npm test`
  builds both halves.
- README: new `frontend/` entry, `app/js` as generated output, updated build
  commands.
- CHANGELOG: one entry; the migration landed in `2.0.0`.
- ADR 0007 → Accepted; ADR 0005 gets a one-line pointer for the frontend part.

## Consequences

### Positive

- One language and one type system across backend and frontend.
- No more hand-written JSDoc typedefs in the frontend; response shapes and
  state are regular interfaces.
- The compiler still catches the same class of bugs (`checkJs` already did),
  but refactorings and renames become cheaper.
- Static hosting, ESM and the existing Express setup stay unchanged.
- The build remains `tsc`-only; no new runtime or dev dependency.

### Negative

- The "no build step" property is gone: `public/app/js/` must exist before
  `npm start`, tests or Docker builds.
- `npm test` gets slightly slower (one extra `tsc` invocation).
- Generated JS is served without content hashes; cache busting relies on
  ETag/Last-Modified (acceptable at this scale).
- Two configs (`tsconfig.json`, `tsconfig.frontend.json`) must stay aligned on
  strict flags.

### Neutral

- `tsc` does not bundle, so the browser makes six module requests. For a
  LAN/self-hosted UI this is irrelevant; if it ever matters, a bundler can be
  added later without changing the source layout.
- API response types remain trusted at the boundary; runtime validation stays
  on the backend (the frontend talks to its own origin only).

## Alternatives considered

1. **Keep `checkJs` + JSDoc (status quo).** Zero build cost and already
   strict. Rejected if annotation overhead and hand-maintained API types are
   the actual pain; keep it if the frontend stays this small and the JSDoc
   noise is tolerable.
2. **Bundler (esbuild/Vite).** One output file, minification, hashed names.
   Rejected for now: extra dependency and configuration for six files, and it
   hides the module graph that makes the current code easy to inspect.
3. **Sources inside `public/app/` and emit next to them.** Rejected: mixes
   source and generated files under the served root and makes the deployment
   artifact less obvious.
4. **Node type stripping for the frontend.** Not possible: browsers cannot
   execute TypeScript. Node 26's native TS support only helps tests and
   tooling.

## Acceptance criteria

- `npm run check`, `npm run check:frontend`, `npm run check:tests`, `npx tsc --noEmit -p e2e`.
- `npm run lint`, `npm run format:check`, `npm run knip` (CI `error`; `knip` `ignoreExportsUsedInFile`). `npm run types:openapi` + `git diff --exit-code frontend/generated/api.generated.d.ts`.
- `@ts-ignore`/`@ts-expect-error` (no `@ts-ignore`; `@ts-expect-error` only when needed).
- `npm test` passes with the same test count as before; no test is deleted
  except the now-redundant syntax check, which is replaced by an artifact
  test.
- `npm run test:e2e` passes; the smoke test reports no `pageerror`.
- `npm run coverage` meets the existing thresholds (frontend excluded).
- The Docker image serves the UI and all E2E flows from the built frontend.
- No `any`, no `@ts-ignore`, no `allowJs`/`checkJs` in the frontend config.
- `public/app/js/` is not tracked by git.

## Rollback

The change is self-contained: revert the migration commit(s), restore
`public/app/*.js`, and the previous `checkJs` configuration is valid again.
No persisted data, API contract or runtime dependency changes.
