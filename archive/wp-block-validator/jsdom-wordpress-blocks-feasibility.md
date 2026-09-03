# Feasibility: running `@wordpress/blocks` + `@wordpress/block-library` headless in Node via jsdom

Research pass #1, conducted while grilling the initial design for `wp-block-validator`.

## Question

Can `@wordpress/blocks` and `@wordpress/block-library` — npm packages built for the browser-based
Gutenberg editor — run inside plain Node.js by shimming `global.window`/`document`/etc. with
`jsdom`, well enough to call `parse()`, `getBlockType()`, and `blockType.save({ attributes })` for
markup validation?

## Findings

**1. Known pattern, but unofficial and fragile.**
A community blog post (Nelio Software) demonstrates running these packages in Node using
`browser-env` (a jsdom-based global shim), not raw jsdom directly — the closest public precedent
found. No WordPress-core-blessed version of this exists.

Known gaps/gotchas:

- `window.matchMedia` is not implemented by jsdom and must be manually stubbed.
- `ResizeObserver` is not implemented in jsdom at all
  ([jsdom/jsdom#3368](https://github.com/jsdom/jsdom/issues/3368), open since 2022) — needs a
  polyfill (`resize-observer-polyfill` or `jsdom-testing-mocks`).
- `block-library` registration populates the `core/blocks` / `core/block-editor` `@wordpress/data`
  stores as an import side effect, so `getBlockType()` requires those modules to have actually been
  imported/registered first — order of imports matters.
- No confirmed issues specifically with `wp.i18n` or `wp.element`/React in this exact setup, but
  these are standard concerns raised in WordPress core discussions about using block-library code
  outside the editor.

**2. ESM/CJS packaging ambiguity is a live, unresolved issue.**
Most `@wordpress/*` packages ship `build-module` (ESM) output without a `"type": "module"` marker
in their `package.json` ([WordPress/gutenberg#73363](https://github.com/WordPress/gutenberg/issues/73363)).
Bundlers (Webpack/Babel) tolerate this; Node's native ESM loader can misinterpret it. A plain Node
script using native `import` may hit "Must use import to load ES Module" or syntax errors. No
official fix as of the issue's last update. This is a direct implementation risk for a CLI written
as a plain Node ESM script.

**3. No official/core-blessed alternative tool.**
WordPress core's own test suites validate block content via real browser E2E tests (Playwright),
not headless jsdom — there is no first-party CLI for this.

The closest third-party tool is **Block Runner** by Human Made
(<https://www.accelerateplugin.com/block-runner/>), a paid/GPL-2.0 tool that claims to validate
AI/design-tool-generated markup "against headless Gutenberg." Its internal implementation (jsdom vs.
real headless browser) is not publicly disclosed.

**4. Version pinning: `wp-X.Y` npm dist-tags.**
npm publishes dist-tags matching WordPress core releases, e.g.:

- `@wordpress/blocks@wp-6.8` → `14.8.2`
- `@wordpress/blocks@wp-6.9` → `15.6.3`
- `@wordpress/blocks@wp-7.0` → `15.13.1`

Official guidance (developer.wordpress.org release docs) recommends installing via
`npm install @wordpress/blocks@wp-6.8` (or whichever target version) rather than pinning an
arbitrary semver range, since these packages' validation behavior (default classes, wrapper markup)
changes across WP releases.

Latest published version at time of research: `@wordpress/blocks@15.27.0`.

## Implications for `wp-block-validator` design

- Treat the jsdom-shim approach as **unproven for our exact use case** — budget time to prove it
  works at all (matchMedia + ResizeObserver polyfills, import order) before building CLI features
  on top of it.
- Pin dependencies via the `wp-X.Y` dist-tag matching the target WordPress version, not a semver
  range.
- Watch for ESM import failures from `@wordpress/*` packages; may need to fall back to a bundler
  (esbuild/tsup) to produce the CLI rather than running raw `tsc`-compiled ESM output directly in
  Node.

## Sources

- <https://www.neliosoftware.com/blog/> (Nelio Software — running Gutenberg blocks in Node via `browser-env`)
- <https://github.com/jsdom/jsdom/issues/3368> (`ResizeObserver` not implemented)
- <https://github.com/WordPress/gutenberg/issues/73363> (ESM `build-module` output lacks `"type": "module"`)
- <https://www.accelerateplugin.com/block-runner/> (Block Runner, third-party validator)
- <https://www.npmjs.com/package/@wordpress/blocks>
- <https://registry.npmjs.org/@wordpress/blocks>
- <https://developer.wordpress.org/block-editor/> (package release/versioning docs)
