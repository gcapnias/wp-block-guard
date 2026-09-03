# wp-block-guard

Pre-publish validator for WordPress Gutenberg block markup (`.html` files and `.php`
fragments), built for AI coding agents to check their own generated content before
writing it into a WordPress post — catching the "This block contains unexpected or
invalid content" editor failure (and the silent content loss "Attempt Block Recovery"
can cause) *before* it happens, rather than discovering it in the editor.

It is a thin, three-layer wrapper around [`block-runner`](https://github.com/humanmade/block-runner),
which performs the actual headless-Gutenberg `save()`-diff check, plus two layers that
close gaps found empirically in `block-runner` alone (see [Design rationale](#design-rationale)).

## Status

Implemented, not yet fully verified end-to-end. Automated verification (manual smoke
test pass + a vitest suite against fixtures) is in progress — see
[Verification status](#verification-status) below, which will be updated once that
work lands.

## Install

```sh
npm install
```

Requires **Node >= 20** (a `block-runner` requirement). `block-runner` and `fast-glob`
are installed as regular dependencies; nothing else is needed at runtime.

## Usage

```sh
node bin/wp-block-guard.js <file-or-glob...> [options]
```

Or, once published/linked, as the `wp-block-guard` binary (see `bin` field in
`package.json`).

```sh
wp-block-guard content/hero.html
wp-block-guard "content/**/*.html" "patterns/**/*.php"
wp-block-guard post-body.html --json
wp-block-guard post-body.html --fix
```

Run `wp-block-guard --help` for the full reference — it is written to be
self-sufficient for a coding agent encountering the tool for the first time
(options, exit codes, the exact JSON output shape, every finding code and what to do
about it, and the recommended generate → validate → fix → revalidate agent loop).
The source of truth for that text is [`src/help.js`](src/help.js).

### Options

| Flag | Effect |
| --- | --- |
| `--json` | Emit a single machine-readable JSON report on stdout instead of human-readable text. |
| `--strict` | Exit `1` if any warnings are present, not only errors. |
| `--fix` | Canonicalize near-miss markup in place via `block-runner fix`, only for files whose sole findings are block-runner attribute/class/whitespace mismatches. Files with structural errors or embedded PHP interpolation are left untouched and reported as "fix skipped" with a reason. |
| `-h`, `--help` | Show the full help text. |
| `-v`, `--version` | Show the installed version. |

### Exit codes

- `0` — all files passed (no error-severity findings; no warnings either, under `--strict`).
- `1` — one or more error-severity findings (or warnings, under `--strict`).
- `2` — usage error: no files matched, a file could not be read, or an unrecoverable internal failure.

## Architecture

```
bin/wp-block-guard.js      CLI entry point
src/cli.js                 argv parsing, glob expansion, orchestration, exit code
src/pipeline.js            per-file pipeline: Layer 0 -> Layer 1 -> Layer 2 -> optional --fix
src/php-fragment.js        Layer 0: PHP header stripping + embedded-PHP flagging
src/structural.js          Layer 1: dependency-free block-delimiter balance checker
src/block-runner-adapter.js Layer 2: invokes the installed block-runner CLI directly
src/findings.js            finding-code registry (code, severity, message, fix)
src/report.js              aggregates per-file results, formats JSON/human output
src/help.js                --help text (single source of truth, also feeds the finding-code table)
src/index.js               library exports (validateFile, buildReport, formatHuman, ...)
```

### Layer 0 — PHP-fragment extraction and flagging (`src/php-fragment.js`)

For `.php` inputs: strips one leading `<?php ... ?>` header (the conventional wrapper
for a WordPress pattern file), re-attaching it unchanged around validation/`--fix`.
Any *other* PHP tag found in the body (interpolation, conditionals, loops mixed into
the markup) is flagged as `PHP_INTERPOLATION_UNCHECKED` (warning) and masked out
(same-shaped whitespace, so line numbers downstream stay accurate) before the rest of
the file is checked — that content is not statically checkable by this tool or by
block-runner, so a passing result elsewhere in the file must not be read as proof that
region is safe.

### Layer 1 — structural delimiter pre-check (`src/structural.js`)

A small, dependency-free tokenizer that walks `<!-- (/)?wp:name {json}? (/)?-->`
delimiters and checks two things block-runner's own parser was found (empirically) not
to catch: **balance** (every opener has a matching closer, correctly nested) and
**attribute-JSON validity**. On any of `STRUCTURAL_UNBALANCED_DELIMITER`,
`STRUCTURAL_MISMATCHED_CLOSER`, or `STRUCTURAL_INVALID_ATTRS_JSON`, block-runner
validation is skipped entirely (`BLOCK_RUNNER_SKIPPED`) rather than letting it report a
misleading "valid" on corrupted input.

### Layer 2 — block-runner invocation (`src/block-runner-adapter.js`)

Runs the actual `save()`-diff check against headless Gutenberg by spawning the
*installed* `block-runner` package's own CLI script directly via `process.execPath`,
resolved through `block-runner/package.json`'s `bin` field — deliberately **not**
`npx block-runner`, which was measured at ~12 seconds of pure resolution overhead per
call versus ~0.1–0.2s of actual validation work. `validate` uses stdin (`-` with
`--json`); `fix` uses temp files with `--out`, matching the exact invocation shapes
confirmed to work in manual testing.

## Finding codes

Every finding has a stable `code`, a `severity` (`error` | `warning` | `info`), and a
`fix` string an agent can act on directly. Full table and explanation:
run `wp-block-guard --help`, or see the `REGISTRY` in [`src/findings.js`](src/findings.js).

| Code | Severity | Meaning |
| --- | --- | --- |
| `PHP_HEADER_STRIPPED` | info | Leading `<?php ... ?>` header removed before validation, re-attached unchanged. |
| `PHP_INTERPOLATION_UNCHECKED` | warning | PHP tag found mid-markup; that region could not be statically checked. |
| `STRUCTURAL_UNBALANCED_DELIMITER` | error | A block comment was opened but never closed. |
| `STRUCTURAL_MISMATCHED_CLOSER` | error | A closing comment doesn't match the innermost open block. |
| `STRUCTURAL_INVALID_ATTRS_JSON` | error | A block delimiter's attribute JSON does not parse. |
| `STRUCTURAL_NO_BLOCKS` | warning | No block delimiters found at all; content is unconverted Classic/HTML. |
| `BLOCK_RUNNER_SKIPPED` | warning | block-runner validation was skipped due to a blocking structural error above. |
| `BLOCK_INVALID` | error | The actual "unexpected or invalid content" case: stored HTML doesn't match current `save()` output. |
| `BLOCK_RUNNER_WARNING` | warning | Pass-through of a block-runner warning (e.g. unresolved media, fallback block). |
| `BLOCK_RUNNER_FAILURE` | error | block-runner could not be invoked or returned unparseable output. |

## Design rationale

Full research and the empirical evidence behind adopting `block-runner` instead of
building a validator from scratch — including the exact tests that found the two gaps
Layers 0 and 1 close — is in
[`archive/2026-09-03-wp-gutenberg-validator-cli-design.md`](archive/2026-09-03-wp-gutenberg-validator-cli-design.md),
building on the primary-source research in
[`archive/2026-09-02-wordpress-gutenberg-markup-validation-research.md`](archive/2026-09-02-wordpress-gutenberg-markup-validation-research.md)
and [`archive/wp-block-validator/`](archive/wp-block-validator/).

## Verification status

_This section is updated as verification work completes; do not treat the tool as
proven correct until both items below are checked off._

- [x] **Manual smoke test** (help/version output, good/bad/unbalanced/malformed-JSON
      fixtures, `.php` header stripping and embedded-PHP flagging, multi-file runs,
      `--strict`, `--fix`, glob support) — complete. Core validation logic (Layers 0/1/2,
      finding codes, multi-file aggregation, glob support, exit codes 0/1/2) all passed.
      Found 3 real bugs and 1 performance problem — see [Known issues](#known-issues)
      below; the 3 correctness bugs have since been fixed and covered by regression tests
      (see [`tests/README.md`](tests/README.md)).
- [x] **Automated vitest suite** against fixtures in `tests/fixtures/wp-block-guard/`,
      covering the pipeline end-to-end plus unit tests for the pure Layer 0/Layer 1
      functions — complete, 43 tests passing. Full breakdown, fixture-by-fixture coverage:
      see [`tests/README.md`](tests/README.md).

## Known issues

Found by manual smoke testing on 2026-09-03 (Node install: 350 packages, 0
vulnerabilities, clean `npm install`).

Items 1–3 below (found by manual smoke testing) have since been **fixed** and are covered
by regression tests in the automated vitest suite — see [`tests/README.md`](tests/README.md)
for test coverage:

- ~~`--fix` reports stale pre-fix results.~~ Fixed in `src/pipeline.js`: the pipeline now
  re-validates the fixed content before building the returned result.
- ~~Duplicate `PHP_INTERPOLATION_UNCHECKED` findings.~~ Fixed in `src/php-fragment.js`:
  `scanForEmbeddedPhp` now reports one occurrence per embedded PHP tag, not one per token.
- ~~`--strict`'s human-readable output shows `✔ PASS` even when the exit code is `1`.~~
  Fixed in `src/report.js`/`src/cli.js`: `formatHuman()` now takes the `--strict` flag into
  account when deciding each file's printed PASS/FAIL status.
- ~~`blockName` is inconsistently namespaced between `BLOCK_INVALID` and `STRUCTURAL_*`
  findings.~~ Fixed in `src/structural.js`: block-runner's reports are always fully-namespaced,
  while the structural layer's tokenizer parsed the bare delimiter text — see
  `qualifyBlockName()` in `src/structural.js` for why and how findings are now made consistent.
- ~~Multi-file JSON output order does not always match the order files were passed on the
  command line.~~ Not a bug: `src/cli.js` already sorts resolved file paths
  (`files.filter(...).sort()`) before processing, so `files[]` order is deterministic — it was
  just undocumented, which is what made an argument-order comparison look like non-determinism.
  The guarantee: **files are processed and reported in ascending lexicographic order of their
  full resolved path (plain JS string `sort()` — UTF-16 code-unit order, not locale-aware, not
  grouped by directory or basename), never command-line argument order.** Don't rely on
  `files[]` matching the order patterns were passed on the command line.

Remaining open issue:

1. **Performance: ~10.2–10.5s per invocation, steady-state, regardless of file size.**
   `--help`'s stated design goal (see [`src/help.js`](src/help.js)) was to avoid `npx`'s
   ~12s/call resolution overhead by spawning the installed `block-runner` CLI directly;
   in practice, per-invocation cost is still ~10s, only marginally better than the
   `npx` path it was built to avoid. Likely cause: `block-runner`'s own dependency tree
   (`@wordpress/block-editor`, `@wordpress/block-library`, React, react-dom — 350
   packages total) has to load fresh on every process start; this is a `block-runner`
   process-startup cost, not slowness in `wp-block-guard`'s own logic. Also note:
   `npm install` blocked a `block-runner` postinstall script
   (`node scripts/prune-wp-vips.mjs`, intended to prune WordPress/vips-related deps)
   because it isn't covered by `allowScripts` — this may or may not be related to the
   startup cost and should be checked (`npm install-scripts approve block-runner` and
   re-measure) before assuming the cost is unavoidable. For the documented
   "run after every edit" agent loop, ~10s/call is a real usability problem worth
   addressing (e.g. a persistent/warm process, or revisiting whether `block-runner`
   can be used as an in-process library instead of a spawned CLI).

## Roadmap

- `handoff/` will hold implementation handoff documents for follow-on work (e.g. a
  feasibility/implementation report on compiling this tool to a standalone Bun
  executable) once that research completes.
