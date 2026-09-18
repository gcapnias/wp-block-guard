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
//
// A third case (wpbg-zxg): a "<?php"/"<?=" opener with no matching "?>" at all
// runs to EOF exactly as the PHP interpreter treats it — everything after it
// is PHP source, not candidate markup. `findTrailingPhpSection` detects that
// with a small hand-rolled state machine (not the regex above, and not a
// closer/opener *count*: both "<?php" and "?>" appear inside string literals,
// comments, and heredocs, so a naive scan or counter is fooled by e.g.
// `echo "?>";` into believing the section already closed). The state machine
// tracks single/double-quoted strings, line comments, block comments, and
// heredoc/nowdoc bodies as PHP itself does, so a quoted "?>" is not mistaken
// for the real closer.

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
 * Replace every balanced "<?...?>" region with whitespace of the same shape
 * (newlines preserved, everything else blanked) so downstream line/column
 * numbers for the surrounding markup stay accurate. A "<?php"/"<?=" with no
 * matching "?>" before EOF is left untouched by this function — that is
 * `findTrailingPhpSection` / `maskTrailingPhp`'s job (wpbg-zxg): PHP itself
 * runs such an opener to EOF, so masking it is a distinct, whole-tail
 * operation, not a fourth case of "balanced region".
 * @param {string} body
 */
export function maskEmbeddedPhp(body) {
  return body.replace(PHP_TAG_BLOCK_RE, (m) => m.replace(/[^\n]/g, ' '));
}

const OPENER_ONLY_RE = /<\?(?:php\b|=)?/g;

/**
 * Index of the first "<?php"/"<?=" opener anywhere in content, or null if
 * there is none. Exposed so a caller (src/pipeline.js) can tell whether a
 * `findTrailingPhpSection` result IS that very first opener — i.e. the
 * file's only PHP is one big unclosed section, so any "header" a bare regex
 * match thinks it found ahead of it must be spurious — without re-deriving
 * opener detection itself.
 * @param {string} content
 * @returns {number | null}
 */
export function firstPhpOpenerIndex(content) {
  const m = /<\?(?:php\b|=)?/.exec(content);
  return m ? m.index : null;
}

/**
 * Find a trailing, unclosed PHP section: a "<?php"/"<?=" opener for which no
 * matching "?>" exists anywhere after it before EOF, as the PHP interpreter
 * itself would parse it — not by counting "<?"/"?>" tokens (both appear
 * inside string literals, comments, and heredocs; `echo "?>";` would
 * false-close a counter) but by walking the body the way the PHP tokenizer
 * does: track single/double-quoted strings (with backslash escapes), "//"
 * and "#" line comments (which PHP itself ends at end-of-line **or** "?>",
 * whichever comes first — so a real "?>" inside a line comment does close
 * the tag), "/* *\/" block comments, and heredoc/nowdoc bodies (terminated
 * by a line starting with the declared identifier), none of which admit a
 * "?>" found inside them as a real closer.
 *
 * Only the *first* unclosed opener is reported: once one is found, PHP itself
 * is already running to EOF from that point, so anything after it —
 * including further "<?php"/"?>"-shaped text — is inside that same trailing
 * run, not a second occurrence.
 *
 * @param {string} body
 * @returns {{ index: number, line: number, token: string } | null}
 */
export function findTrailingPhpSection(body) {
  const n = body.length;
  let i = 0;

  while (i < n) {
    OPENER_ONLY_RE.lastIndex = i;
    const opener = OPENER_ONLY_RE.exec(body);
    if (!opener) return null;

    const openerIndex = opener.index;
    const openerToken = opener[0];
    let p = openerIndex + openerToken.length;
    let closed = false;

    while (p < n) {
      const ch = body[p];

      if (ch === "'" || ch === '"') {
        const quote = ch;
        p++;
        while (p < n && body[p] !== quote) {
          if (body[p] === '\\') p++;
          p++;
        }
        p++; // past closing quote (or past EOF if unterminated)
        continue;
      }

      if (ch === '/' && body[p + 1] === '*') {
        const end = body.indexOf('*/', p + 2);
        if (end === -1) {
          p = n;
          break;
        }
        p = end + 2;
        continue;
      }

      if ((ch === '/' && body[p + 1] === '/') || ch === '#') {
        // PHP: a "//" or "#" comment ends at end-of-line OR "?>", whichever
        // comes first — so a real "?>" here does close the tag.
        let lineEnd = body.indexOf('\n', p);
        if (lineEnd === -1) lineEnd = n;
        const closerInLine = body.indexOf('?>', p);
        if (closerInLine !== -1 && closerInLine < lineEnd) {
          p = closerInLine; // loop back around; next iteration sees the "?>"
        } else {
          p = lineEnd;
        }
        continue;
      }

      if (body.startsWith('<<<', p)) {
        const heredocEnd = skipHeredoc(body, p);
        if (heredocEnd == null) {
          p = n;
          break;
        }
        p = heredocEnd;
        continue;
      }

      if (ch === '?' && body[p + 1] === '>') {
        p += 2;
        closed = true;
        break;
      }

      p++;
    }

    if (!closed) {
      const line = body.slice(0, openerIndex).split('\n').length;
      return { index: openerIndex, line, token: openerToken };
    }

    i = p;
  }

  return null;
}

/**
 * Advance past a heredoc/nowdoc body (`<<<ID` / `<<<'ID'` / `<<<"ID"`,
 * starting at `start`), returning the index just after its terminating
 * `ID`, or `null` if no terminator is found before EOF.
 * @param {string} body
 * @param {number} start index of the leading "<<<"
 * @returns {number | null}
 */
function skipHeredoc(body, start) {
  let q = start + 3;
  while (/[ \t]/.test(body[q] || '')) q++;
  let quote = null;
  if (body[q] === "'" || body[q] === '"') {
    quote = body[q];
    q++;
  }
  const idStart = q;
  while (/[A-Za-z0-9_]/.test(body[q] || '')) q++;
  const id = body.slice(idStart, q);
  if (!id) return null;
  if (quote && body[q] === quote) q++;

  let nl = body.indexOf('\n', q);
  if (nl === -1) return null;
  const rest = body.slice(nl + 1);
  const terminatorRe = new RegExp(`^[ \\t]*${id}\\b`, 'm');
  const match = terminatorRe.exec(rest);
  if (!match) return null;
  return nl + 1 + match.index + match[0].length;
}

/**
 * Mask a trailing unclosed PHP section (as found by `findTrailingPhpSection`)
 * from its opener through EOF, using the same same-shaped-whitespace
 * technique as `maskEmbeddedPhp` (blank everything, preserve newlines) so
 * line/column numbers for markup *above* the section are untouched.
 * @param {string} body
 * @param {number} index start of the trailing section
 * @returns {string}
 */
export function maskTrailingPhp(body, index) {
  return body.slice(0, index) + body.slice(index).replace(/[^\n]/g, ' ');
}
