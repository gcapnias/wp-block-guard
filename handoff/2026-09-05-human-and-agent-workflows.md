# wp-block-guard — the human workflow and the agent workflow

Handoff note, written 2026-09-05. Self-contained by request: every fact needed to work on
or explain these two workflows is stated inline. Nothing here requires reading another
document.

Repository: `E:\Shared\Workspaces\personal\firecrawl-cli` (working branch `develop`; `main`
is the git default but work is committed on `develop`).

---

## 1. What the tool is

`wp-block-guard` is a pre-publish validator for WordPress Gutenberg block markup. It checks
`.html` files and `.php` pattern fragments containing block markup — HTML delimited by
`<!-- wp:name {...} -->` comments — *before* that content is written into a WordPress post.

The failure it exists to catch: content saves without complaint, then the Block Editor later
reports **"This block contains unexpected or invalid content"**, and *Attempt Block Recovery*
silently deletes part of the page. That happens when the stored HTML for a block no longer
matches what the block's `save()` function would render.

It is a three-layer wrapper around a dependency called `block-runner`, which performs the
actual headless-Gutenberg `save()`-diff check in-process (no subprocess, no `npx`):

- **Layer 0 — PHP fragments.** For `.php` input, a single leading `<?php ... ?>` header block
  (the conventional wrapper for a WP pattern file) is stripped before validation and
  re-attached unchanged afterwards. Any *other* PHP tag in the body — interpolation,
  conditionals, loops mixed into markup — is flagged and then masked out (replaced with
  same-shaped whitespace, so line and column numbers stay accurate) before the later layers
  run. This exists because `block-runner` silently tolerates PHP mixed into markup and
  reports it as valid, giving no signal that it could not check that region.
- **Layer 1 — structural delimiter pre-check.** A small dependency-free scan of the delimiter
  grammar: are openers and closers balanced and correctly nested, and is each delimiter's
  attribute JSON parseable. This exists because `block-runner`'s own parser was found to
  accept a `<!-- wp:heading -->` with no matching closer and report it as one valid block.
- **Layer 2 — the `save()`-diff check.** Hands the markup to `block-runner`. This is the real
  "unexpected or invalid content" check.

Layer 1 short-circuits Layer 2: if delimiters are unbalanced or malformed, `block-runner` is
not called at all, because its verdict on structurally broken input is not trustworthy.

**Prerequisite:** Node >= 20.

---

## 2. The two workflows, and why there are two

The central design decision: **`--fix` writes to disk; `--suggest` returns what it would have
written and touches nothing.** One flag per audience.

The reason is not squeamishness about mutation. It is that the underlying correction step
(`canonicalize`) does not surgically repair the broken blocks — it *reserializes the entire
document*. Measured on a real 26-line fixture: 26 lines in, 28 lines out, and **only 2 lines
identical after trimming**. The churn is re-indentation, alphabetized delimiter JSON keys, and
dropped redundant attributes such as `"layout":{"type":"default"}` — in blocks that were never
broken.

For a human that is acceptable: they run `--fix`, eyeball the result, and move on. For an agent
it is not, because the agent has just folded ~20 lines of unrelated reformatting into its own
change set with nothing to point at in review.

### 2a. Human workflow (HITL)

```
wp-block-guard content/hero.html                # check, human-readable output
wp-block-guard content/hero.html --fix          # canonicalize in place, then re-report
wp-block-guard content/hero.html                # re-run to confirm clean
```

The human reads the marked-up text report (`✔ PASS` / `✗ FAIL` per file, then one line per
finding with its `fix` advice), decides whether to accept a whole-file canonicalization, and
runs `--fix` if so. **Always re-run without `--fix` afterwards to confirm the result is clean** —
`--fix` cannot repair every defect, and its own re-report is of the rewritten file.

`--fix` refuses to touch a file when the result would be untrustworthy. It is skipped, with a
reason reported in `fixSkippedReason`, when the file:

- contains embedded PHP interpolation (`Contains embedded PHP interpolation; not safely auto-fixable.`)
- has blocking structural delimiter errors (`Contains structural delimiter errors; not safely auto-fixable.`)
- has findings outside `block-runner`'s scope (`Contains findings outside block-runner's scope; not safely auto-fixable.`)
- has nothing to fix (no error-severity findings — reported as no skip at all, not as a skip)

Those gates are about the *output* being untrustworthy, not about the write, so they apply
identically to `--suggest`.

### 2b. Agent workflow

```
wp-block-guard <file> --suggest --json
```

One call. It reports the findings **and** hands back the correction, so there is no separate
check pass. The recommended loop:

1. Generate or edit block markup.
2. Run `wp-block-guard <file> --suggest --json`.
3. If `ok` is `false`, read each finding's `fix` text and apply what you can. Where a finding's
   `search` field is not `null`, it is the **exact text to find in the file** — use it as the
   search side of a find-and-replace rather than re-deriving the span from `line`.
4. For findings you cannot resolve individually, write `suggestedOutput` back over the file
   **yourself**, then re-run step 2 to confirm `ok` is `true`.
5. Only publish to WordPress once `ok` is `true`.

Two behaviours that surprise agents and are deliberate:

- **Expect exit 1 while the file on disk is still broken.** `findings`, `ok`, and the exit code
  all describe the file *as it exists on disk*, which `--suggest` has not modified. A non-zero
  exit from `--suggest` is the point, not a failure of the call. Do not retry it as though the
  invocation errored.
- **`suggestedOutput` is the whole file**, PHP header included, ready to write back verbatim.
  It is re-conformed to the input's own line endings and trailing-newline state, so writing it
  back does not introduce a line-ending diff.

`--suggest` returns **one suggestion per matched file**. A wide glob therefore returns every
corrected file in a single payload; narrow the pattern if you only mean to act on one.

---

## 3. Flags and parameters, each explained

### Positional argument

| Parameter | Meaning |
| --- | --- |
| `<file-or-glob...>` | One or more file paths or glob patterns. Repeatable. Globs are expanded by the tool, so quote them (`"content/**/*.html"`) to stop the shell expanding them first. Use forward slashes even on Windows — the glob engine requires them, and a backslash path silently matches nothing. Only `.html` and `.php` are meaningful input. Zero matches is a usage error (exit 2), not a pass. |

### Options

| Flag | What it does and when to use it |
| --- | --- |
| `--json` | Emit a single machine-readable JSON object on stdout instead of human-readable text. Use it from an agent or from CI. Human-readable output is the default and is not machine-parseable — do not scrape it. |
| `--strict` | Exit 1 if any *warnings* are present, not only errors. Without it, warnings are reported but do not affect the exit code. Use it as a publish gate where a warning should block. Note it changes only the exit code and the PASS/FAIL wording, not which findings are reported. |
| `--fix` | Attempt to canonicalize near-miss markup **in place**, then re-report against the rewritten file. Applied only to files whose findings are all block-runner attribute/class/whitespace mismatches; otherwise skipped with a reason (see the gate list in §2a). **This is the flag for a human fixing their own file.** It rewrites the whole document, not just the broken blocks. |
| `--suggest` | Compute exactly what `--fix` would write, but **write nothing** — return it as `suggestedOutput` for the caller to apply as its own edit. **This is the flag for an agent.** Requires `--json`. Cannot be combined with `--fix`: they state opposite intents about disk, so combining them is a usage error rather than a silent precedence rule. |
| `-h`, `--help` | Print the full help text, which is the single source of truth for the flag surface and also generates the finding-code table. |
| `-v`, `--version` | Print the installed version. |

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All files passed — no error-severity findings, and no warnings either when `--strict` is set. |
| `1` | One or more error-severity findings (or warnings, under `--strict`). Under `--suggest` this describes the file **on disk**, which was not modified. |
| `2` | Usage error: no files matched, a file could not be read, `--fix` and `--suggest` were combined, `--suggest` was used without `--json`, or an unrecoverable internal failure. |

---

## 4. The JSON contract

```
{
  "ok": boolean,                       // true iff no error-severity findings anywhere
  "summary": { "files": n, "errors": n, "warnings": n, "fixed": n },
  "files": [
    {
      "file": "path/to/file.html",
      "ok": boolean,
      "fixApplied": boolean,           // true only when --fix actually rewrote this file
      "fixSkippedReason": string | null,
      "suggestedOutput": string | null,// --suggest only: the WHOLE corrected file, PHP
                                       // header included, ready to write back as-is.
                                       // null when nothing was suggested (clean file,
                                       // or the same gates that skip --fix).
      "summary": { "errors": n, "warnings": n },
      "findings": [
        {
          "code": "BLOCK_INVALID",     // stable, machine-matchable
          "severity": "error" | "warning" | "info",
          "file": "path/to/file.html",
          "line": 12,                  // 1-based; may be undefined
          "blockName": "core/heading", // present when the finding is block-scoped
          "message": "human-readable explanation of what is wrong",
          "search": "<h2>Hello</h2>",  // byte-exact source text at fault, or null
          "fix": "what to do about it, or null"
        }
      ]
    }
  ]
}
```

**Field order in a finding is part of the contract** — `JSON.stringify` preserves insertion
order, and an agent reads that shape. The order is `code, severity, file, line, blockName,
message, search, fix`, and there is a test pinning it.

**Match on `code`, never on `message` prose.** `code` is the stable contract; message wording
is not.

### `line` semantics

`line` is the first line of the text the finding is *about*, one rule with no per-code
exceptions. In practice that resolves two ways, and the difference falls out of what is
actually wrong:

- For `STRUCTURAL_*` codes the delimiter comment **is** the defect, so `line` is the
  delimiter's line.
- For `BLOCK_INVALID` the delimiter is fine — it carries the attributes Gutenberg treats as
  correct — and the element inside it is what disagrees with `save()`. So `line` is the
  *element's* line. `<!-- wp:heading {"level":2} -->` on line 6 with `<h2>` on line 7 reports
  line 7.
- A self-closing block, and a block whose inner content is entirely whitespace, have no element
  to point at; `line` is the opening delimiter's line.

Positions are **re-derived from the tool's own tokenizer**, never taken from `block-runner`'s
reported position, which frequently names a *different, valid* block: its internal search walks
a cursor that only advances past the previously invalid block, so a valid block of the same name
in between absorbs the hit.

### `search` semantics

`search` is the byte-exact source text a finding points at — the text to find in order to
replace it. It is **byte-exact or absent, never best-effort**: a wrong `search` is worse than a
missing one, because its whole purpose is find-and-replace, and text from a position we are
unsure of points at markup that is not broken.

Every value is a **contiguous** slice of the file as it exists on disk, so it can be found
verbatim.

| Code | Severity | `search` holds | Meaning |
| --- | --- | --- | --- |
| `PHP_HEADER_STRIPPED` | info | the header text | A leading `<?php ... ?>` header was stripped before validation and will be re-attached unchanged. |
| `PHP_INTERPOLATION_UNCHECKED` | warning | the whole `<?...?>` fragment | A PHP tag was found inside the markup region. That content is not statically checkable; a passing result elsewhere in the file is not proof this region is safe. |
| `STRUCTURAL_UNBALANCED_DELIMITER` | error | the opener that is never closed | A block is opened but never closed. |
| `STRUCTURAL_MISMATCHED_CLOSER` | error | the offending delimiter comment | A closing comment does not match the innermost open block, or has no opener at all. |
| `STRUCTURAL_INVALID_ATTRS_JSON` | error | the delimiter comment | A delimiter's attribute blob is not valid JSON. |
| `STRUCTURAL_NO_BLOCKS` | warning | `null` | No `wp:` delimiters found — this content will be stored as unconverted Classic/HTML, not native blocks. |
| `BLOCK_RUNNER_SKIPPED` | warning | `null` | Layer 2 was skipped because Layer 1 found blocking structural errors. Fix those first. |
| `BLOCK_INVALID` | error | the element at fault | **The real check.** The stored HTML does not match what the block's `save()` would render now. |
| `BLOCK_RUNNER_WARNING` | warning | `null` | Pass-through of a `block-runner` warning. Cannot currently fire — the installed version only ever emits invalid-status items. |
| `BLOCK_RUNNER_FAILURE` | error | `null` | `block-runner` could not validate the content at all. |

Two subtleties worth preserving if you touch this code:

- **Slice from the pre-mask body.** Layer 0 blanks embedded PHP to spaces before the later
  layers see it. Masking is length-preserving, so offsets are shared, but a `search` sliced from
  the masked body would not be byte-exact where a PHP fragment sits inside markup being reported
  on — a delimiter's attribute JSON, for instance. All slicing therefore happens in the pipeline,
  which holds both bodies.
- **The reported span must be contiguous.** Block position resolution validates each candidate
  block in a *children-removed* form; that form establishes the verdict but appears nowhere in
  the source, so it cannot be what `search` reports. The reported span is the block's inner
  content whole, nested children included.

Also: the position resolver's fallback is **per-file, not per-finding**. If the mapping cannot
be established with certainty, `search` is `null` for *every* block-runner finding in that file,
not just the ambiguous one — the soundness argument is about the document as a whole.

---

## 5. Where the code lives

```
bin/wp-block-guard.js         CLI entry point
src/cli.js                    argv parsing, glob expansion, orchestration, exit code
src/pipeline.js               per-file pipeline: Layer 0 -> 1 -> 2 -> optional --fix/--suggest
src/php-fragment.js           Layer 0: PHP header stripping + embedded-PHP flagging/masking
src/structural.js             Layer 1: delimiter tokenizer, balance checker, block tree
src/block-locator.js          re-derives each finding's position from our own tokenizer
src/block-runner-adapter.js   Layer 2: calls block-runner in-process
src/findings.js               finding-code registry (code, severity, message, fix)
src/report.js                 aggregates per-file results, formats JSON/human output
src/help.js                   --help text; single source of truth, feeds the code table
src/index.js                  library exports (validateFile, buildReport, formatHuman)
```

Tests: `npm test` (vitest). The suite is slow — `block-runner` boots a real jsdom +
Gutenberg environment, roughly 8 seconds for the first call in a file and single-digit
milliseconds per call thereafter. A cold or contended machine produces spurious 20–30s test
timeouts; re-run before believing a failure. Full suite is currently green at 79 tests.

---

## 6. Open work on these workflows

Three tickets are filed in the local `beads_rust` tracker (`br` CLI, IDs prefixed `wpbg`), all
labelled `needs-triage` and unassigned. Full briefs are on the tickets; the substance is
summarised here so this document stands alone.

**`wpbg-lsf` — verified per-block `match` text for `BLOCK_INVALID`.** `search` gives an agent
the text to find; `match` would give it the text to write, making a *surgical* find-and-replace
possible instead of a whole-file rewrite. Together they are the standard shape for an
agent-applicable fix (a range plus replacement text, as language servers model it), expressed as
text rather than offsets.

The design, probed end to end and confirmed working: for each `BLOCK_INVALID` finding on a
**leaf** block, canonicalize the block's markup, extract the corrected *inner* content and
discard the corrected delimiters, splice the corrected inner content between the block's
**original** delimiters, then re-validate that candidate. Clean ⇒ `match` is the corrected inner
content. Not clean ⇒ `match` is `null`. Discarding the corrected delimiters is what keeps the
edit minimal, and is correct because for `BLOCK_INVALID` the delimiter is by definition right.
The re-validation makes `match` a *verified* claim: `null` means "no correction exists", not "we
did not try".

Measured results: five leaf corrections across four fixtures all spliced and validated clean
(e.g. `<h2>Hello World</h2>` → `<h2 class="wp-block-heading">Hello World</h2>`); one fixture's
correction came back byte-identical to its input and failed the splice validation, correctly
yielding `null` — `aria-hidden="true"` on a `core/group` is something `save()` will never emit.

Two hard constraints found while probing:

- **Parents must yield `match: null` unconditionally.** Validation strips inner blocks, so a
  parent's corrected form comes back with its children *gone* — one probed group with three
  children came back as an empty `<div>`. Splicing that over the block's span destroys three
  blocks.
- **Line endings must be re-conformed to the input's convention.** Canonicalization mangles
  them: three of four probed blocks came back CRLF→LF, and one came back *mixed* (`\n` at the
  delimiters, `\r\n` retained inside), which matches neither convention on a find-and-replace.

Cost is no longer an obstacle: per-block canonicalize plus validate measured **8–32 ms** after
the one-time environment boot. An older rejection of this idea cited ~12 s per block, which was
measured before `block-runner` was moved in-process.

**`wpbg-hdl` — spike: can `match` be produced for a block with children?** Blocked by
`wpbg-lsf`. Decides whether leaf-only is a temporary limitation or permanent. Needs re-inserting
original children into a corrected parent and verifying by re-validating the *whole document*,
since children must survive as blocks. Explicit stop conditions are on the ticket, including:
if the correction changes text *between* children, the seams cannot be mapped without diffing,
which reintroduces the "corrected or merely reformatted?" problem the leaf design avoids.

**`wpbg-6id` — `--suggest`.** ⚠️ **Verify before triaging this one.** It was filed this session
describing `--suggest` as new work, but the shipped `--help` output already documents `--suggest`,
`suggestedOutput`, the `--fix`/`--suggest` mutual exclusion, the `--json` requirement, the
line-ending re-conforming, and the per-file glob behaviour — i.e. the flag appears to already
exist. The ticket is very likely redundant or needs rescoping to whatever remains. Check the
current behaviour first; do not implement from that brief as written.

---

## 7. Suggested skills for the next session

Call these with the `Skill` tool:

- **`tdd`** — if implementing `wpbg-lsf`. Its acceptance criteria are written as behaviours to
  assert (perform the `search`→`match` replacement and re-validate the file; prove `null` for
  parents and for non-resolving corrections; cover a CRLF fixture and an LF fixture), which is
  a natural red-green fit.
- **`prototype`** — if picking up the `wpbg-hdl` spike. It is explicitly a throwaway
  investigation ending in a verdict, not an implementation.
- **`domain-modeling`** — if the outcome changes vocabulary or needs a recorded decision. Both
  `match` landing and the spike resolving as "leaf-only is permanent" are decisions worth
  recording rather than leaving as omissions.
- **`ce-commit`** — for every commit. This repo's convention is an imperative subject naming the
  outcome (what is now possible or fixed), not the file list, and no conventional-commit prefix.
- **`code-review`** — before considering `wpbg-lsf` done, since it emits text an agent will
  apply to files unattended.

Skills to *avoid* here: `firecrawl` and the research skills. The open questions are all
empirical against the local `block-runner` install, and a probe answers them in seconds. The
last such question was settled by measurement after having been wrongly closed on an
out-of-date cost estimate.

## 8. Working agreements observed in this repo

- Commit on `develop`, not `main`.
- Never edit `.beads/` files directly — always use the `br` CLI. Run `br sync --flush-only`
  before any commit touching bead state, and stage `.beads/issues.jsonl` explicitly. Do not
  stage the `.beads/beads.db-lock-*` files; they are stale leftovers.
- Never run bare `bv` — it opens a blocking interactive TUI.
- When adding a bead comment, write the text to a file and pass `--file`. Passing markdown via
  `--message` silently truncates everything from the first `"` character onward.
- Claiming a ticket is permission to investigate, not to implement: write or correct the brief,
  get review, confirm with the user, *then* code.
- `.scratch/` is free-to-use temporary space; `handoff/` holds durable committed artifacts.
