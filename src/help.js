import { FINDING_CODES, describeCode } from './findings.js';

function findingCodesTable() {
  return FINDING_CODES.map((code) => {
    const def = describeCode(code);
    return `  ${code.padEnd(30)} ${def.severity}`;
  }).join('\n');
}

export const HELP_TEXT = `wp-block-guard — pre-publish validator for WordPress Gutenberg block markup

PURPOSE
  Checks .html files and .php fragment files that contain WordPress block
  markup ("<!-- wp:name {...} -->" comment-delimited HTML) BEFORE it is
  written into a WordPress post, so a coding agent can catch the failure
  mode where content saves fine but the Block Editor later reports "This
  block contains unexpected or invalid content" and Attempt Block Recovery
  silently deletes part of the page.

  It is a thin, three-layer wrapper around block-runner
  (https://github.com/humanmade/block-runner), which does the actual
  headless-Gutenberg save()-diff check. This tool adds two checks that
  block-runner was empirically found not to perform on its own — see
  "WHY THIS EXISTS" below.

USAGE
  wp-block-guard <file-or-glob...> [options]

  Examples:
    wp-block-guard content/hero.html
    wp-block-guard "content/**/*.html" "patterns/**/*.php"
    wp-block-guard post-body.html --json
    wp-block-guard post-body.html --fix

OPTIONS
  --json         Emit a single machine-readable JSON object on stdout instead
                 of human-readable text. Use this from an agent or CI.
  --strict       Exit 1 if any warnings are present, not only errors.
  --fix          Attempt to canonicalize near-miss markup in place, using
                 block-runner's "fix" command, then re-report. Only applied
                 to files whose only findings are block-runner attribute/
                 class/whitespace mismatches — files with structural errors
                 or embedded PHP interpolation are left untouched and
                 reported as "fix skipped" with a reason. Always re-run
                 without --fix afterward to confirm the result is clean.
  -h, --help     Show this text.
  -v, --version  Show the installed version.

INPUT TYPES
  .html   Static WordPress block markup, validated as-is.
  .php    A pattern/template fragment. A single leading "<?php ... ?>"
          header comment block (the conventional wrapper for a WP pattern
          file) is stripped before validation and re-attached unchanged if
          --fix runs. Any OTHER PHP tag found in the body (interpolation,
          conditionals, loops mixed into the markup) is reported as
          PHP_INTERPOLATION_UNCHECKED and masked out before the rest of the
          file is checked — that content is not statically checkable by
          this tool or by block-runner, and a passing result elsewhere in
          the file is not proof that region is safe.

EXIT CODES
  0   All files passed (no error-severity findings; no warnings if --strict).
  1   One or more error-severity findings (or warnings, under --strict).
  2   Usage error: no files matched, a file could not be read, or an
      unrecoverable internal failure occurred.

JSON OUTPUT SHAPE (--json)
  {
    "ok": boolean,                     // true iff no error-severity findings anywhere
    "summary": { "files": n, "errors": n, "warnings": n, "fixed": n },
    "files": [
      {
        "file": "path/to/file.html",
        "ok": boolean,
        "fixApplied": boolean,
        "fixSkippedReason": string | null,
        "summary": { "errors": n, "warnings": n },
        "findings": [
          {
            "code": "BLOCK_INVALID",       // stable machine-matchable code, see below
            "severity": "error" | "warning" | "info",
            "file": "path/to/file.html",
            "line": 12,                    // 1-based, may be undefined
            "blockName": "core/heading",   // present when the finding is block-scoped
            "message": "human-readable explanation of what is wrong",
            "search": "<h2>Hello</h2>",         // byte-exact source text at fault, or null
            "fix": "human/agent-readable suggestion of what to do about it, or null"
          }
        ]
      }
    ]
  }

FINDING CODES (code — default severity)
${findingCodesTable()}

  BLOCK_INVALID is the actual "unexpected or invalid content" check: the
  stored HTML for that block does not match what its save() function would
  render right now. Everything else is either a check block-runner does not
  perform (PHP_*, STRUCTURAL_*) or a pass-through of block-runner's own
  warnings/failures.

WHY THIS EXISTS (do not skip if deciding whether to trust this output)
  block-runner alone already catches the save()-diff failure that causes
  "unexpected or invalid content" — that is its core, well-tested job. Two
  gaps were found empirically (2026-09-03) that this wrapper closes:

  1. Unbalanced delimiters are not caught by block-runner's own parser: a
     "<!-- wp:heading -->" opened with no matching "<!-- /wp:heading -->"
     was silently reported as one valid block. The STRUCTURAL_* codes in
     this tool catch that class of corruption independently, using a small
     dependency-free scan of the delimiter grammar (balance + attribute-
     JSON validity only, not full block-tree semantics).
  2. PHP tags mixed into markup are silently tolerated by block-runner with
     no distinct signal that it could not check that region. The PHP_* codes
     make that explicit instead of letting a "valid" result imply more than
     it does.

  Full design rationale, empirical test data, and source citations:
  see this project's archive/2026-09-03-wp-gutenberg-validator-cli-design.md
  and archive/2026-09-02-wordpress-gutenberg-markup-validation-research.md.

PREREQUISITES
  Node >= 20 (required by block-runner). block-runner is installed as this
  package's own dependency and is invoked directly (its resolved bin script
  via node), not through "npx", specifically to avoid npx's own package-
  resolution overhead (measured at ~12s/call versus block-runner's own
  ~0.1-0.2s of actual work).

AGENT WORKFLOW (recommended loop)
  1. Generate or edit block markup.
  2. wp-block-guard <file> --json
  3. If ok=false: read each finding's "fix" text, apply the ones you can.
     "search", where it is not null, is the exact text to find in the file —
     use it as the search side of a find-and-replace instead of re-deriving
     the span from "line".
  4. For remaining BLOCK_INVALID-only findings, try wp-block-guard <file> --fix
     then re-run step 2 to confirm.
  5. Only publish to WordPress once ok=true.
`;
