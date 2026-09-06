# wp-block-guard

A pre-publish validator for WordPress Gutenberg block markup. It exists to catch the
editor's "unexpected or invalid content" failure (and the silent content loss "Attempt
Block Recovery" can cause) before an AI agent writes generated markup into a WordPress
post, by running a three-layer check ahead of publish time.

## Language

**Layer**:
One of the three ordered stages of the validation pipeline (Layer 0, 1, 2), each
implemented in its own module and each able to short-circuit the layers after it.
_Avoid_: Stage, phase, step.

**Finding**:
A single reportable result of validation: `{code, severity, line, message, search, fix}`. Every
layer emits findings; they are the only thing the CLI's JSON output and human report
are built from.
_Avoid_: Error (too narrow — a finding may be info/warning/error), issue, diagnostic.

**line**:
The 1-based source line a finding points at, always the first line of the text the finding
is about — the delimiter comment for `STRUCTURAL_*` codes (where the delimiter is the
defect), the element inside it for `BLOCK_INVALID` (where the delimiter is correct and the
markup disagrees with it). Re-derived from our own tokenizer, never taken from
block-runner's `source.htmlLine`, which frequently names a different, valid block — see
`docs/adr/0005-finding-line-points-at-the-markup-at-fault.md`.
_Avoid_: Line number (redundant), position, offset (a byte index, not a line).

**search**:
The byte-exact slice of the input file a finding points at — the text an agent would
look for in order to replace it. Absent (`null`) whenever the tool cannot identify that
text with certainty.
_Avoid_: Source (collides with block-runner's own `source` position object), snippet,
excerpt, offending text.

**Code**:
The stable, namespaced identifier of a finding's kind (e.g. `STRUCTURAL_UNBALANCED_DELIMITER`),
defined once in the `REGISTRY` in `src/findings.js`. An agent is expected to match on
`code`, not parse `message` prose — this is the tool's stable contract.
_Avoid_: Type, kind, error code.

**Severity**:
One of `error | warning | info`. `error` fails validation outright; `warning` only
fails it under `--strict`; `info` is advisory and never fails it.
_Avoid_: Level, priority.

**Block delimiter**:
The `<!-- (/)?wp:name {json}? (/)?-->` HTML comment that marks the boundary of a
Gutenberg block in serialized markup. Layer 1 tokenizes these; Layer 2 (block-runner)
parses them for real.
_Avoid_: Block comment, block tag, marker.

**blockName**:
The name a finding attaches to a block delimiter, always fully-namespaced (e.g.
`core/paragraph`, `my-plugin/card`) regardless of which layer produced the finding.
Gutenberg's own delimiter grammar omits the `core/` namespace when *writing* core
blocks, but this tool's findings normalize it back on for consistency — see
`qualifyBlockName()` in `src/structural.js`.
_Avoid_: Block type, block slug (the bare, unqualified form as written in markup —
distinct from `blockName` as surfaced in a finding).

**PHP fragment**:
A `.php` input file: WordPress pattern-file convention wraps block markup in one
leading `<?php ... ?>` header, which Layer 0 strips before validation and re-attaches
unchanged afterward.
_Avoid_: PHP file (too broad — this tool only handles the specific header-wrapped
pattern-file shape, not arbitrary PHP).

**Embedded PHP**:
A PHP tag found *inside* the block-markup body (not the leading header) — e.g.
interpolation, conditionals, loops mixed into markup. This region cannot be statically
validated; Layer 0 masks it out (same-shaped whitespace, to keep line numbers
accurate) and flags `PHP_INTERPOLATION_UNCHECKED`.
_Avoid_: Inline PHP, dynamic PHP (used loosely in prose but "embedded PHP" is the
canonical term tied to the finding code).

**save() diff**:
The actual check Layer 2 (block-runner) performs: whether a block's stored markup
still matches what its React `save()` function would currently render. A mismatch is
the literal cause of the editor's "invalid content" failure this tool exists to
prevent.
_Avoid_: Validation (too broad — save() diff is specifically what block-runner does,
distinct from Layer 0/1 checks).

**Canonicalization**:
The rewrite of block markup into the exact form a block's `save()` function would
render — what both `--fix` and `--suggest` request. Whole-document and best-effort: it
also reformats blocks that were already valid, and repairs only near-miss markup.
_Avoid_: Fix (ambiguous — a finding's `fix` field is advisory prose written for a human,
not this operation), autofix, repair.

**Near-miss markup**:
Invalid markup that differs from its `save()` output only in ways canonicalization can
mechanically correct — attribute order, generated classes, whitespace. Distinct from
markup carrying something `save()` would never emit (an `aria-hidden` attribute on a
`core/group`, say), which no canonicalization can repair and which `--fix` therefore
leaves standing.
_Avoid_: Minor invalidity, cosmetic difference (both obscure the line that actually
matters — whether a correction exists at all).

**Human workflow**:
A run whose consumer is a person reading the report: `wpbg <file>` to check, `wpbg <file>
--fix` to canonicalize in place. The person is editing the file anyway, so the tool is
free to write to it and the report describes what it did. Paired with the agent workflow
in `docs/adr/0006-two-workflows-fix-writes-suggest-returns.md`, which records why the
two surfaces differ.
_Avoid_: HITL (jargon, and it names a category of process rather than this tool's
surface), interactive mode, manual mode.

**Agent workflow**:
A run whose consumer is a coding agent: `--json` for findings it matches on `code`, and
`--suggest` to obtain a suggestion it applies itself. The agent owns its own change set,
so the tool reports and proposes but does not write.
_Avoid_: CI mode (unrelated axis — CI reads the human workflow's exit code), automated
mode, robot mode.

**Suggestion**:
The canonicalized whole-file content the tool returns instead of writing, for an agent to
apply as its own edit. Absent (`null`) whenever canonicalization is unsafe to attempt or
produces nothing — the same honesty rule as `search`.
_Avoid_: Fix (that is the in-place write), patch, diff (a suggestion is whole content, not
a delta), dry run (describes the write not happening, not the value handed back).
