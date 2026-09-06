# Two workflows: `--fix` writes for a human, `--suggest` returns for an agent

Status: accepted 2026-09-06

This tool has **two consumers with opposite rules about writing to disk**, and every flag
belongs to one of them. A human checks with `wp-block-guard <file>` and repairs with
`--fix`, which rewrites the file in place. An agent calls `--suggest --json`, which
computes the identical correction, writes nothing, and returns the whole corrected file as
`suggestedOutput` for the agent to apply as its own edit.

Recording this because the split is not visible from any single code path, and because it
was misread repeatedly — including in the originating ticket's own specification (see
"What this settles"). `CONTEXT.md` defines **Human workflow**, **Agent workflow**, and
**Suggestion**; this ADR records why the surface divides and what follows from it.

## Why an agent must not use `--fix`

Canonicalization is whole-document and best-effort. It reserializes every block, including
the valid ones: re-indenting, alphabetizing delimiter JSON keys, and dropping redundant
attributes such as `"layout":{"type":"default"}`. Measured on
`tests/fixtures/mastermind-ls/parts/title.html`, 26 lines in became 28 out with only 2
lines identical after trimming — 4 real corrections buried in ~24 lines of churn.

For a human that is acceptable: they ran `--fix` on their own file, they can read the
diff, and the churn is theirs. For an agent it is not. An agent that runs `--fix` has
laundered a whole-file rewrite into its change set with nothing to point at in review. The
correction is legitimate; the reformatting alongside it is unattributable.

So the agent path returns the content and lets the caller own the write. This is the
ecosystem norm — writing is its own flag in `gofmt -w`, `prettier --write`, `ruff --fix` —
and `--fix-dry-run` in ESLint is the closest precedent for an opt-out that *replaces* the
writing verb rather than qualifying it.

## What follows from the split

Three consequences that look arbitrary in isolation:

- **`--suggest` is a standalone verb, not a modifier.** `--fix --suggest` is a usage error
  (exit 2) rather than one silently winning: they state opposite intents about disk.
- **`--suggest` requires `--json`.** A suggestion is a whole file, which the human report
  has nowhere sensible to render. Silently dropping it would make the flag look like it had
  worked; exiting 2 says so.
- **`--suggest` reports the file on disk, so a broken file still exits 1.** See below.
- **One suggestion per matched file.** The flag does not narrow the input set, so a wide
  glob returns every corrected file in a single payload. That is the right default for a
  bulk agent and a surprise for anyone expecting a single suggestion, so it is documented
  in the help text rather than left to be discovered.

## `--suggest` does not re-validate

Findings, `ok`, and the exit code describe the input file, identical to a plain run. The
candidate output is never validated and its findings are never reported.

This is the point most likely to be "corrected" by a future reader, so: the `--fix` path
*does* discard stale findings and re-validate, and that is right there, because after the
write the file on disk **is** the candidate. Under `--suggest` nothing is written, so
nothing is stale and there is nothing to refresh. Reporting the candidate's findings would
return `ok: true` and exit 0 for a file that is still broken, and would make the agent's
confirming re-run meaningless — the loop's only proof that its edit worked.

The upside of the same decision: an agent can make `--suggest --json` its **first** call
and receive findings and correction together, with no separate check pass.

## Gating is shared, in both directions

`--suggest` reuses `--fix`'s gates unchanged — embedded PHP interpolation, blocking
structural errors, findings outside block-runner's scope, nothing to fix, and
canonicalization producing no output — and reports the same `fixSkippedReason` strings.

Sharing that field means the agent workflow reports a declined suggestion through a
fix-named field. That is a known wart, kept deliberately: the requirement was the *same*
skip-reason text, and a parallel `suggestSkippedReason` would either duplicate every string
or change `--fix`'s output. Do not add one.

Not relaxed, despite being non-mutating: those gates are about the output being
untrustworthy, not about the write. And **not tightened**: `--fix` writes a file whose
finding the correction cannot resolve (verified on `unfixable-extra-attribute.html`, which
`--fix` rewrites while still reporting `BLOCK_INVALID`), so `--suggest` returns a
suggestion there too. Withholding it unless applying it would clear the finding would be
stricter than `--fix`, not equal to it — and that verification is per-block work, tracked
separately.

Note when following that thread: `docs/adr/0003-no-corrected-markup-in-findings.md`
refuses a per-finding `match` field, but its own body reopens the question and the work to
add one is an accepted bead. Read 0003 as a record of the obstacles a `match` field must
answer to, not as a live prohibition.

## A suggestion is re-conformed to its source

Canonicalization preserves neither line endings nor the trailing newline: measured, a CRLF
input comes back LF throughout, and the final newline is dropped. `--fix` has the same
trailing-newline defect (tracked as its own issue), but there it is one bad write. On the
agent path the agent writes it back by hand, authoring a whole-file line-ending change it
never intended. So a suggestion is normalized to the input's own convention and
trailing-newline state before emission.

## What this settles

The ticket that requested `--suggest` specified the opposite on the re-validation point,
asking that findings describe "what the agent would get". That reading is recorded here as
rejected rather than silently overridden, because it is the intuitive one and will be
proposed again.
