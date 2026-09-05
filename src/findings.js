// Finding-code registry. Each code has a fixed severity, a message builder, and
// a fix builder. Keeping these declarative in one place is what lets the CLI's
// --help text and the JSON `code` field stay a single stable contract: an
// agent can match on `code` without parsing prose, per
// archive/2026-09-03-wp-gutenberg-validator-cli-design.md §3.

const REGISTRY = {
  PHP_HEADER_STRIPPED: {
    severity: 'info',
    message: () =>
      'Leading "<?php ... ?>" header comment block was stripped before validation and will be re-attached unchanged if --fix runs.',
    fix: () => null,
  },

  PHP_INTERPOLATION_UNCHECKED: {
    severity: 'warning',
    message: () =>
      'A PHP tag was found inside the block-markup region (not just a leading header). This content cannot be statically validated and was masked out before checking.',
    fix: () =>
      'Move dynamic PHP logic outside block boundaries, or review this section by hand. A passing result elsewhere in this file is not proof this region is safe.',
  },

  STRUCTURAL_UNBALANCED_DELIMITER: {
    severity: 'error',
    message: (o) => `Block "${o.blockName}" is opened but never closed.`,
    fix: () =>
      'Add the matching "<!-- /wp:<name> -->" closing comment, or make the block self-closing ("<!-- wp:<name> {...} /-->") if it has no inner content.',
  },

  STRUCTURAL_MISMATCHED_CLOSER: {
    severity: 'error',
    message: (o) => o.detail || `Closing comment for "${o.blockName}" does not match an open block.`,
    fix: () =>
      'Check nesting order: a closing comment must close the innermost currently-open block, in reverse order of opening.',
  },

  STRUCTURAL_INVALID_ATTRS_JSON: {
    severity: 'error',
    message: (o) => `Block "${o.blockName}" has a delimiter attribute blob that is not valid JSON.`,
    fix: () =>
      'Fix the JSON between the block name and "-->": double-quoted keys and strings, no trailing commas, balanced braces.',
  },

  STRUCTURAL_NO_BLOCKS: {
    severity: 'warning',
    message: () =>
      'No "<!-- wp:... -->" delimiter comments were found. This content will be stored as unconverted Classic/HTML, not native blocks.',
    fix: () =>
      'Convert the source with block-runner\'s "convert" command, or wrap intentional raw HTML explicitly in "<!-- wp:html -->...<!-- /wp:html -->".',
  },

  BLOCK_RUNNER_SKIPPED: {
    severity: 'warning',
    message: (o) => o.detail,
    fix: () => 'Resolve the structural errors reported for this file, then re-run validation.',
  },

  BLOCK_INVALID: {
    severity: 'error',
    message: (o) =>
      `Block "${o.blockName}" content does not match what its save() function would currently render: ${o.detail}`,
    fix: () =>
      'Run this tool with --fix to canonicalize near-miss markup (attribute/class/whitespace differences), then re-validate before publishing.',
  },

  BLOCK_RUNNER_WARNING: {
    severity: 'warning',
    message: (o) => `Block "${o.blockName}": ${o.detail}`,
    fix: () => 'Review the warning; typically unresolved media or a fallback-to-Custom-HTML block.',
  },

  BLOCK_RUNNER_FAILURE: {
    severity: 'error',
    message: (o) => `block-runner could not validate this content: ${o.detail}`,
    fix: () =>
      'Confirm "block-runner" is installed (npm install --save-dev block-runner) and that Node >= 20 is in use.',
  },
};

export const FINDING_CODES = Object.keys(REGISTRY);

export function describeCode(code) {
  return REGISTRY[code] || null;
}

/**
 * @param {string} code one of FINDING_CODES
 * @param {{file?: string, line?: number, blockName?: string, detail?: string, search?: string|null}} overrides
 *   `search` is the byte-exact source text the finding is about, so a consumer
 *   can find-and-replace it. It is byte-exact or absent, never a best-effort
 *   approximation — see `docs/adr/0002-search-is-byte-exact-or-absent.md`.
 */
export function makeFinding(code, overrides = {}) {
  const def = REGISTRY[code];
  if (!def) {
    throw new Error(`Unknown finding code: ${code}`);
  }
  return {
    code,
    severity: def.severity,
    file: overrides.file,
    line: overrides.line,
    blockName: overrides.blockName,
    message: def.message(overrides),
    search: overrides.search == null ? null : overrides.search,
    fix: def.fix(overrides),
  };
}
