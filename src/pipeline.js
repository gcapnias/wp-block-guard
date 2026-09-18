import fs from 'node:fs/promises';
import {
  extractPhpHeader,
  scanForEmbeddedPhp,
  maskEmbeddedPhp,
  findTrailingPhpSection,
  maskTrailingPhp,
  firstPhpOpenerIndex,
} from './php-fragment.js';
import { runStructuralLayer, BLOCKING_STRUCTURAL_CODES } from './structural.js';
import { validateMarkup, fixMarkup } from './block-runner-adapter.js';
import { makeFinding } from './findings.js';
import { resolveItemLines, resolveMatch } from './block-locator.js';

/**
 * Turn block-runner's report items into findings, with positions re-derived
 * from our own tokenizer rather than taken from `item.source.htmlLine`, which
 * routinely names a different, valid block (see src/block-locator.js).
 *
 * Falls back to block-runner's own line wherever the mapping is not certain,
 * so this is never worse than reporting nothing.
 *
 * `search` is sliced from the same re-derived span as `line`, out of
 * `sourceContent` rather than `content` so that a PHP-masked body never
 * reaches the output. It is `null` on the fallback path: a position we do not
 * trust must not be turned into text to find and replace
 * (`docs/adr/0002-search-is-byte-exact-or-absent.md`).
 *
 * `match` (wpbg-lsf) is the verified replacement for `search`, computed only
 * when `suggest` is true — the cost of canonicalizing and re-validating each
 * block in isolation is only worth paying when a caller has asked for a
 * correction to apply. It is `null` for anything but a leaf `BLOCK_INVALID`,
 * so this call site is shared with the plain-validate and `--fix`
 * post-write revalidation paths, both of which always pass `suggest: false`
 * (or omit it) and so never pay the cost or emit a value.
 *
 * @param {Array<object>} items
 * @param {string} content the markup handed to block-runner
 * @param {string} sourceContent the same markup before PHP masking, to slice from
 * @param {string} filePath
 * @param {number} headerLines lines consumed by a stripped PHP header
 * @param {{ suggest?: boolean, raw?: string }} [options]
 */
async function findingsForItems(items, content, sourceContent, filePath, headerLines, options = {}) {
  const { suggest = false, raw } = options;
  const resolved = await resolveItemLines({ content, items, validateMarkup });

  return Promise.all(
    items.map(async (item, index) => {
      const code = item.status === 'warning' ? 'BLOCK_RUNNER_WARNING' : 'BLOCK_INVALID';
      const fallback = item.source && item.source.htmlLine ? item.source.htmlLine : null;
      const line = resolved[index] ? resolved[index].line : fallback;

      const searchSpan = resolved[index] ? { start: resolved[index].start, end: resolved[index].end } : null;

      let match = null;
      if (suggest && code === 'BLOCK_INVALID' && searchSpan) {
        match = await resolveMatch({
          node: resolved[index].node,
          searchSpan,
          sourceContent,
          raw,
          fixMarkup,
          validateMarkup,
          conformToSource,
        });
      }

      return makeFinding(code, {
        file: filePath,
        line: line == null ? undefined : line + headerLines,
        blockName: item.block,
        detail: item.reason,
        search: searchSpan ? sourceContent.slice(searchSpan.start, searchSpan.end) : null,
        match,
      });
    })
  );
}

/**
 * Re-conform a suggestion to the line-ending conventions of the file it was
 * derived from.
 *
 * Canonicalization preserves neither: measured on a CRLF input it returns LF
 * throughout, and it drops the input's trailing newline. An agent applying a
 * suggestion writes it back verbatim, so without this it would author a
 * whole-file line-ending change plus a newline-at-EOF loss it never intended
 * — noise attributable to this tool in a file the agent did not otherwise
 * reformat.
 *
 * The `--fix` write path uses this too (wpbg-8j7): it loses both the trailing
 * newline and the source line-ending convention in exactly the same way, so
 * the write is wrapped with the same call rather than a second normalizer.
 *
 * @param {string} suggestion canonicalized whole-file content
 * @param {string} raw the input file exactly as read from disk
 * @returns {string}
 */
export function conformToSource(suggestion, raw) {
  // Majority wins for a file that mixes both, since a find-and-replace
  // against it is likeliest to be written in its prevailing convention.
  const crlfCount = (raw.match(/\r\n/g) || []).length;
  const lfCount = (raw.match(/(?<!\r)\n/g) || []).length;
  const eol = crlfCount > lfCount ? '\r\n' : '\n';

  let out = suggestion.replace(/\r\n/g, '\n');
  if (eol === '\r\n') out = out.replace(/\n/g, '\r\n');

  // Both directions. Appending unconditionally would add a newline to a file
  // that never had one, which is the same class of unrequested edit.
  const rawEndsWithNewline = /\n$/.test(raw);
  const outEndsWithNewline = /\n$/.test(out);
  if (rawEndsWithNewline && !outEndsWithNewline) out += eol;
  else if (!rawEndsWithNewline && outEndsWithNewline) out = out.replace(/\r?\n$/, '');

  return out;
}

/**
 * Run the full three-layer pipeline (PHP-fragment flagging, structural
 * pre-check, block-runner save()-diff) against one file.
 *
 * @param {string} filePath
 * @param {{ fix?: boolean, suggest?: boolean }} [options]
 */
export async function validateFile(filePath, options = {}) {
  const { fix = false, suggest = false } = options;
  const raw = await fs.readFile(filePath, 'utf8');
  const isPhp = /\.php$/i.test(filePath);

  const findings = [];
  let header = '';
  let headerLines = 0;
  let body = raw;
  // The same content before PHP masking. Masking blanks PHP to spaces, so a
  // `search` sliced from `body` would not be byte-exact where a fragment sits
  // inside markup we report on — a delimiter comment's attribute JSON, say.
  // Masking is length-preserving, so one set of offsets indexes both.
  let unmaskedBody = raw;
  let hasEmbeddedPhp = false;
  // Set only when this file's trailing PHP section (wpbg-zxg) is the *entire*
  // body — no markup precedes it. Read by the structural-findings loop below
  // to suppress STRUCTURAL_NO_BLOCKS, which cannot see *why* the body came up
  // empty and would otherwise report a false "unconverted Classic/HTML"
  // verdict for a file that is legitimately all PHP. Deliberately narrower
  // than "a trailing section exists": a file with real, blockless HTML
  // *followed by* a trailing PHP section still deserves the genuine
  // STRUCTURAL_NO_BLOCKS finding for that HTML.
  let isEntirelyPhp = false;

  // --- Layer 0: PHP fragment extraction and flagging ---
  if (isPhp) {
    // Run the trailing-section scan on the raw file *before* stripping a
    // leading header. extractPhpHeader's header regex is a lazy match for
    // "<?php ... ?>" and can be fooled by the exact same quoted/commented
    // "?>" that this scan is built to see through (e.g. a file whose only
    // "?>" sits inside a string literal): it would then strip a bogus
    // "header" that actually swallows the true opener, hiding it from every
    // later check. If the trailing section this scan finds starts at the
    // file's very first PHP opener, there is no real leading header to
    // extract — skip extractPhpHeader entirely for this file and treat the
    // whole thing as body, rather than widening LEADING_HEADER_RE itself
    // (which would change header/--fix semantics for every pattern file).
    const rawTrailing = findTrailingPhpSection(raw);
    const firstOpenerIndex = firstPhpOpenerIndex(raw);
    const bypassHeader = rawTrailing != null && firstOpenerIndex != null && rawTrailing.index === firstOpenerIndex;

    const extracted = bypassHeader ? { header: null, body: raw, headerLines: 0 } : extractPhpHeader(raw);
    header = extracted.header || '';
    headerLines = extracted.headerLines;
    body = extracted.body;
    unmaskedBody = extracted.body;

    if (header) {
      findings.push(
        // The header text itself, without the blank lines the extraction
        // regex also consumed.
        makeFinding('PHP_HEADER_STRIPPED', { file: filePath, line: 1, search: header.replace(/\s+$/, '') })
      );
    }

    // Re-locate the trailing section relative to `body`: when a header was
    // stripped, `rawTrailing`'s offset (measured against `raw`) no longer
    // lines up with `body`.
    const trailing = bypassHeader ? rawTrailing : findTrailingPhpSection(body);

    // Anything scanForEmbeddedPhp finds at or after the trailing section's
    // start is inside that same to-EOF PHP run, not a second, independent
    // occurrence — filter it out so it is reported once, as
    // PHP_TRAILING_SECTION, not twice.
    const embedded = scanForEmbeddedPhp(body).filter((o) => !trailing || o.index < trailing.index);
    if (embedded.length > 0) {
      hasEmbeddedPhp = true;
      for (const occurrence of embedded) {
        findings.push(
          makeFinding('PHP_INTERPOLATION_UNCHECKED', {
            file: filePath,
            line: occurrence.line + headerLines,
            search: occurrence.text,
          })
        );
      }
      body = maskEmbeddedPhp(body);
    }

    if (trailing) {
      hasEmbeddedPhp = true;
      const beforeTrailing = body.slice(0, trailing.index);
      isEntirelyPhp = beforeTrailing.trim().length === 0;
      const detail = isEntirelyPhp
        ? 'File is entirely PHP; no block markup to validate.'
        : 'File ends in an unclosed "<?php" section; everything from here to EOF is PHP and was not validated as markup.';
      findings.push(
        makeFinding('PHP_TRAILING_SECTION', {
          file: filePath,
          line: trailing.line + headerLines,
          detail,
          search: trailing.token,
        })
      );
      body = maskTrailingPhp(body, trailing.index);
    }
  }

  // --- Layer 1: structural delimiter pre-check ---
  const structuralFindings = runStructuralLayer(body);
  for (const sf of structuralFindings) {
    // structural.js cannot see *why* the body has no blocks; when the whole
    // file is PHP, PHP_TRAILING_SECTION above already explains the absence
    // and STRUCTURAL_NO_BLOCKS's "stored as unconverted Classic/HTML" message
    // would be false for a file containing no HTML at all. Gated on
    // `isEntirelyPhp`, not merely "a trailing section exists": a file with
    // real, blockless HTML *followed by* a trailing PHP section still has a
    // genuine STRUCTURAL_NO_BLOCKS to report for that HTML.
    if (isEntirelyPhp && sf.code === 'STRUCTURAL_NO_BLOCKS') continue;
    findings.push(
      makeFinding(sf.code, {
        file: filePath,
        line: sf.line + headerLines,
        blockName: sf.blockName,
        detail: sf.detail,
        // Sliced from the unmasked body: the structural layer tokenizes the
        // masked one, but the offsets are shared and the output must not carry
        // blanked-out PHP.
        search: sf.start == null ? null : unmaskedBody.slice(sf.start, sf.end),
      })
    );
  }
  const hasBlockingStructuralErrors = structuralFindings.some((f) => BLOCKING_STRUCTURAL_CODES.includes(f.code));

  // --- Layer 2: block-runner save()-diff validation ---
  if (hasBlockingStructuralErrors) {
    findings.push(
      makeFinding('BLOCK_RUNNER_SKIPPED', {
        file: filePath,
        line: 1,
        detail:
          'Skipped block-runner validation because the structural pre-check found unbalanced or malformed delimiters; fix those first.',
      })
    );
  } else {
    const result = await validateMarkup(body);
    if (!result.ok) {
      findings.push(
        makeFinding('BLOCK_RUNNER_FAILURE', {
          file: filePath,
          line: 1,
          detail: result.error,
        })
      );
    } else {
      findings.push(
        ...(await findingsForItems(result.data.items || [], body, unmaskedBody, filePath, headerLines, {
          // Embedded PHP gates --suggest/--fix out entirely further down (the
          // "not safely auto-fixable" skip), so a match computed here would
          // describe a correction the caller was just told is unavailable.
          suggest: suggest && !hasEmbeddedPhp,
          raw,
        }))
      );
    }
  }

  // --- Optional: --fix / --suggest, only when safe (see design doc §3, Layer 2 bullet on `fix`) ---
  // Both request the same canonicalization and share this gating; they differ
  // only in whether the result is written to disk or handed back.
  let fixApplied = false;
  let fixSkippedReason = null;
  let suggestedOutput = null;
  if (fix || suggest) {
    const errorCount = findings.filter((f) => f.severity === 'error').length;
    const onlyBlockRunnerFindings = findings.every((f) =>
      ['PHP_HEADER_STRIPPED', 'BLOCK_INVALID', 'BLOCK_RUNNER_WARNING'].includes(f.code)
    );

    if (hasEmbeddedPhp) {
      fixSkippedReason = 'Contains embedded PHP interpolation; not safely auto-fixable.';
    } else if (hasBlockingStructuralErrors) {
      fixSkippedReason = 'Contains structural delimiter errors; not safely auto-fixable.';
    } else if (errorCount === 0) {
      fixSkippedReason = null; // nothing to fix, not worth reporting as "skipped"
    } else if (!onlyBlockRunnerFindings) {
      fixSkippedReason = 'Contains findings outside block-runner\'s scope; not safely auto-fixable.';
    } else {
      const fixedBody = await fixMarkup(body);
      if (fixedBody == null) {
        fixSkippedReason = 'block-runner "fix" did not produce output.';
      } else if (suggest) {
        // The agent workflow: hand back exactly what --fix would have written
        // and leave the file alone. Deliberately no re-validate — the one in
        // the branch below exists only to refresh findings the write made
        // stale, and nothing was written here. So findings, `ok`, and the exit
        // code keep describing the file on disk, which is what an agent needs:
        // it has not applied the suggestion yet, and its confirming re-run
        // would be meaningless if this call already reported the file clean.
        suggestedOutput = conformToSource(header + fixedBody, raw);
      } else {
        // Conform the body alone, not `header + fixedBody`: conformToSource
        // rewrites EOLs inside its whole input, including the header, which
        // would shift `header.length` and misalign a slice back out of it.
        // `header` is already a slice of `raw` (see extractPhpHeader), so it
        // already carries the file's native EOLs untouched; only `fixedBody`
        // needs re-conforming. `body` is then reassigned to the conformed
        // string, not `fixedBody`, so the re-validate below and the write to
        // disk share one string — block-runner's item offsets, and the
        // `search` text findingsForItems slices from it, must index the same
        // bytes that end up on disk (docs/adr/0002-search-is-byte-exact-or-absent.md).
        const conformedBody = conformToSource(fixedBody, raw);
        await fs.writeFile(filePath, header + conformedBody, 'utf8');
        fixApplied = true;
        body = conformedBody;

        // Re-validate the fixed content so the returned result reflects
        // reality, not the pre-fix findings: block-runner's own findings
        // (BLOCK_INVALID / BLOCK_RUNNER_WARNING) are stale once the file has
        // actually been rewritten.
        const staleCodes = ['BLOCK_INVALID', 'BLOCK_RUNNER_WARNING', 'BLOCK_RUNNER_FAILURE'];
        for (let i = findings.length - 1; i >= 0; i--) {
          if (staleCodes.includes(findings[i].code)) findings.splice(i, 1);
        }

        const revalidated = await validateMarkup(body);
        if (!revalidated.ok) {
          findings.push(
            makeFinding('BLOCK_RUNNER_FAILURE', {
              file: filePath,
              line: 1,
              detail: revalidated.error,
            })
          );
        } else {
          // No masking on this path — --fix is skipped outright for a file with
          // embedded PHP — so the rewritten body is its own unmasked source.
          findings.push(
            ...(await findingsForItems(revalidated.data.items || [], body, body, filePath, headerLines))
          );
        }
      }
    }
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;

  return {
    file: filePath,
    ok: errorCount === 0,
    fixApplied,
    fixSkippedReason,
    suggestedOutput,
    findings,
    summary: { errors: errorCount, warnings: warningCount },
  };
}
