// Layer 0 — PHP-fragment extraction and flagging.
//
// Gap addressed (see archive/2026-09-03-wp-gutenberg-validator-cli-design.md §2,
// "Gap B"): empirically, block-runner silently accepts PHP tags mixed into
// markup and reports the fragment as valid, giving no signal that it could not
// actually check the PHP-interpolated regions. This module makes that explicit:
// a single leading "<?php ... ?>" header (the conventional wrapper for a WP
// pattern file) is stripped and re-attached verbatim around validation/fix, but
// any *other* PHP tag found in the body is flagged as PHP_INTERPOLATION_UNCHECKED
// and masked out (replaced with same-shaped whitespace, preserving line/column
// numbers) before the remainder is handed to the structural and block-runner
// layers, so those layers never silently validate through PHP interpolation
// pretending it is a stable HTML region.

const LEADING_HEADER_RE = /^﻿?\s*<\?php[\s\S]*?\?>\s*\n?/;
const PHP_TAG_TOKEN_RE = /<\?(?:php\b|=)?|\?>/g;
const PHP_TAG_BLOCK_RE = /<\?(?:php\b|=)?[\s\S]*?\?>/g;

/**
 * Split off a single leading "<?php ... ?>" header comment/wrapper, if present.
 * @param {string} content
 * @returns {{ header: string|null, body: string, headerLines: number }}
 */
export function extractPhpHeader(content) {
  const match = LEADING_HEADER_RE.exec(content);
  if (!match) {
    return { header: null, body: content, headerLines: 0 };
  }
  const header = match[0];
  const headerLines = header.split('\n').length - 1;
  return { header, body: content.slice(header.length), headerLines };
}

/**
 * Find every remaining embedded "<?...?>" PHP tag region in a body (after the
 * leading header, if any, has already been removed by extractPhpHeader). Each
 * "<?php ... ?>" / "<?= ... ?>" block is reported once, at its opening token
 * — not once per token (opener and closer are part of the same occurrence).
 *
 * Each occurrence also carries `text`: the whole matched `<?...?>` fragment,
 * which is what a finding's `search` needs. `token` stays the opening tag
 * alone — it is part of this function's existing contract.
 * @param {string} body
 * @returns {Array<{ index: number, line: number, token: string, text: string }>}
 */
export function scanForEmbeddedPhp(body) {
  const occurrences = [];
  const covered = []; // [start, end) ranges already reported as one occurrence

  PHP_TAG_BLOCK_RE.lastIndex = 0;
  let match;
  while ((match = PHP_TAG_BLOCK_RE.exec(body))) {
    const line = body.slice(0, match.index).split('\n').length;
    const openerMatch = /^<\?(?:php\b|=)?/.exec(match[0]);
    occurrences.push({
      index: match.index,
      line,
      token: openerMatch ? openerMatch[0] : match[0],
      text: match[0],
    });
    covered.push([match.index, match.index + match[0].length]);
  }

  // Fallback: an opener with no matching "?>" before EOF is not matched by
  // PHP_TAG_BLOCK_RE at all (it requires a closer). Still report it once, so
  // it isn't silently invisible to this layer.
  const OPENER_RE = /<\?(?:php\b|=)?/g;
  OPENER_RE.lastIndex = 0;
  let openerMatch2;
  while ((openerMatch2 = OPENER_RE.exec(body))) {
    const insideCovered = covered.some(([start, end]) => openerMatch2.index >= start && openerMatch2.index < end);
    if (insideCovered) continue;
    const line = body.slice(0, openerMatch2.index).split('\n').length;
    // No closer before EOF, so there is no fragment to point at beyond the
    // opener itself.
    occurrences.push({ index: openerMatch2.index, line, token: openerMatch2[0], text: openerMatch2[0] });
  }

  occurrences.sort((a, b) => a.index - b.index);
  return occurrences;
}

/**
 * Replace every "<?...?>" region with whitespace of the same shape (newlines
 * preserved, everything else blanked) so downstream line/column numbers for
 * the surrounding markup stay accurate. A "<?php"/"<?=" with no matching "?>"
 * before EOF is left untouched — it will usually surface as a structural or
 * block-runner finding on its own, which is an acceptable fallback for that
 * rare malformed case.
 * @param {string} body
 */
export function maskEmbeddedPhp(body) {
  return body.replace(PHP_TAG_BLOCK_RE, (m) => m.replace(/[^\n]/g, ' '));
}
