// Re-derive the source position of each block-runner finding.
//
// block-runner's `validate` reports a position per invalid block that is often
// wrong, and wrong in the worst way: it names a *different, valid* block. Its
// `locateBlock()` searches the markup for "<!-- wp:<name>" from a cursor that
// only advances past the previously *invalid* block, so any valid block of the
// same name in between silently absorbs the hit. On
// tests/fixtures/wp-block-guard/valid-then-invalid-same-name.html it reports
// lines 3 and 9 — both valid blocks — for defects that live at lines 6 and 12.
//
// The fix cannot live upstream (block-runner 0.8.0 is the latest published
// version and its internals are not exported), so positions are recomputed
// here from our own tokenizer's byte-exact spans.
//
// The method rests on a fact settled in
// handoff/2026-09-05-block-isolation-verdict-spike.md: a block validated alone
// gets the same verdict as it does in its document. That is not luck —
// Gutenberg's `validateBlock` compares `getSaveContent(blockType,
// block.attributes)` against `block.originalContent`, and `save()` is invoked
// with no block context, so nothing outside a block's own delimiter span feeds
// its validation. So each ambiguous candidate can simply be asked directly.

import { buildBlockTree, flattenBlockTree, lineAt } from './structural.js';

/**
 * A block's own span with its direct children's spans removed.
 *
 * Validating this yields exactly one block, so its verdict is the block's own
 * verdict with no descendants to disentangle. It is sound because Gutenberg
 * validates a block against `save()` called with `innerBlocks = []` and against
 * an `originalContent` that already has inner blocks stripped — removing the
 * children textually reproduces exactly that input.
 *
 * @param {string} content
 * @param {object} node
 * @returns {string}
 */
function shallowMarkup(content, node) {
  let out = '';
  let cursor = node.start;
  for (const child of node.children) {
    out += content.slice(cursor, child.start);
    cursor = child.end;
  }
  return out + content.slice(cursor, node.end);
}

/**
 * The line a finding should point at: the first line of the markup at fault.
 *
 * For a block that is invalid, the text needing correction is the element
 * inside the delimiters, not the delimiter comment — the delimiter carries the
 * attributes block-runner considers correct. See
 * `docs/adr/0005-finding-line-points-at-the-markup-at-fault.md`.
 *
 * @param {string} content
 * @param {object} node
 * @returns {number}
 */
function markupLine(content, node) {
  if (node.innerStart == null) return node.line; // self-closing: the delimiter is all there is
  let i = node.innerStart;
  while (i < node.end && /\s/.test(content[i])) i++;
  return i < node.end ? lineAt(content, i) : node.line;
}

/**
 * Work out which source line each of block-runner's report items belongs to.
 *
 * Returns an array parallel to `items`. An entry is `null` wherever the
 * mapping could not be established with certainty — the caller is expected to
 * fall back to block-runner's own `source.htmlLine` rather than drop the line,
 * so an unresolvable file is no worse off than before this module existed.
 *
 * Only ambiguous block names cost a validation call: a name whose candidate
 * count already equals its item count has a forced mapping, and a name
 * appearing once cannot be confused with anything.
 *
 * @param {object} params
 * @param {string} params.content the markup exactly as handed to block-runner
 * @param {Array<{ block?: string, status?: string }>} params.items report items
 * @param {(markup: string) => Promise<{ ok: boolean, data: object|null }>} params.validateMarkup
 * @returns {Promise<Array<{ line: number }|null>>}
 */
export async function resolveItemLines({ content, items, validateMarkup }) {
  const unresolved = items.map(() => null);
  if (items.length === 0) return unresolved;

  // `validate` only ever emits status "invalid"; anything else means this
  // report came from a command whose items are not one-per-block, and the
  // counting below would not hold.
  if (!items.every((item) => item.status === 'invalid' && item.block)) return unresolved;

  const blocks = flattenBlockTree(buildBlockTree(content)).filter((b) => b.end != null);

  const itemCounts = new Map();
  for (const item of items) itemCounts.set(item.block, (itemCounts.get(item.block) || 0) + 1);

  const invalid = new Set();
  for (const [name, count] of itemCounts) {
    const candidates = blocks.filter((b) => b.blockName === name);

    // Fewer blocks than findings of that name: our tokenizer and block-runner's
    // parser disagree about the document. Do not guess.
    if (candidates.length < count) return unresolved;

    if (candidates.length === count) {
      for (const candidate of candidates) invalid.add(candidate);
      continue;
    }

    for (const candidate of candidates) {
      const result = await validateMarkup(shallowMarkup(content, candidate));
      if (!result.ok || !result.data) return unresolved;
      // The shallow form must reduce to exactly one block, or the span we cut
      // was not what we thought it was.
      if (result.data.summary && result.data.summary.blocks !== 1) return unresolved;
      if ((result.data.items || []).length > 0) invalid.add(candidate);
    }
  }

  // block-runner walks its parsed blocks in pre-order, so its items arrive in
  // document order of the blocks that are genuinely invalid. Line the two up.
  const ordered = blocks.filter((b) => invalid.has(b));
  if (ordered.length !== items.length) return unresolved;
  for (let i = 0; i < items.length; i++) {
    if (ordered[i].blockName !== items[i].block) return unresolved;
  }

  return ordered.map((node) => ({ line: markupLine(content, node) }));
}
