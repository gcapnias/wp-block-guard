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
//
// The same isolation fact is what makes `resolveMatch()` below sound (wpbg-lsf):
// a leaf block canonicalized alone gets the same corrected markup it would get
// canonicalized in its document, so a block's own verified replacement text —
// the `match` half of a `{ search, match }` finding — can be computed here too,
// reusing the node this module already resolves rather than re-walking the tree.

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
 * The span of the markup at fault: the element inside the delimiters, with
 * surrounding whitespace trimmed off both ends.
 *
 * For a block that is invalid, the text needing correction is that element,
 * not the delimiter comment — the delimiter carries the attributes
 * block-runner considers correct, and editing it is usually the wrong repair.
 * See `docs/adr/0005-finding-line-points-at-the-markup-at-fault.md`.
 *
 * A self-closing block, and a block whose inner content is entirely
 * whitespace, have no element to point at; the whole block is the span.
 *
 * The span is contiguous in the source, so slicing it yields text a consumer
 * can find verbatim in the file. That is why it is the block's inner content
 * and not `shallowMarkup()` above, which removes children and so describes
 * text that appears nowhere.
 *
 * @param {string} content
 * @param {object} node
 * @returns {{ start: number, end: number }}
 */
function markupSpan(content, node) {
  if (node.innerStart == null || node.innerEnd == null) return { start: node.start, end: node.end };
  let start = node.innerStart;
  let end = node.innerEnd;
  while (start < end && /\s/.test(content[start])) start++;
  while (end > start && /\s/.test(content[end - 1])) end--;
  return start < end ? { start, end } : { start: node.start, end: node.end };
}

/**
 * Work out which source position each of block-runner's report items belongs to.
 *
 * Returns an array parallel to `items`: the `line` of the markup at fault and
 * the byte offsets bounding it, which a caller holding the original content
 * can slice for the finding's `search` field. Offsets rather than text,
 * because the content handed to block-runner may be the PHP-masked body while
 * `search` must come from the unmasked one — masking is length-preserving, so
 * the offsets are valid in both.
 *
 * An entry is `null` wherever the mapping could not be established with
 * certainty. The caller is expected to fall back to block-runner's own
 * `source.htmlLine` rather than drop the line, so an unresolvable file is no
 * worse off than before this module existed. There is deliberately no
 * equivalent fallback for `search`: text sliced from a position that may name
 * a different block is worse than no text at all
 * (`docs/adr/0002-search-is-byte-exact-or-absent.md`).
 *
 * Only ambiguous block names cost a validation call: a name whose candidate
 * count already equals its item count has a forced mapping, and a name
 * appearing once cannot be confused with anything.
 *
 * The returned entry also carries the block-tree `node` itself (`children`,
 * `start`, `end`, `innerStart`, `innerEnd`) alongside the resolved `line`/
 * `start`/`end` span — `resolveMatch()` below needs the node's own children
 * (to gate leaf-only) and its full span (to isolate the block for
 * canonicalization), and it is already in hand at the point `line`/`start`/
 * `end` are computed, so there is no reason to re-walk the tree for it.
 *
 * @param {object} params
 * @param {string} params.content the markup exactly as handed to block-runner
 * @param {Array<{ block?: string, status?: string }>} params.items report items
 * @param {(markup: string) => Promise<{ ok: boolean, data: object|null }>} params.validateMarkup
 * @returns {Promise<Array<{ line: number, start: number, end: number, node: object }|null>>}
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

  return ordered.map((node) => {
    const span = markupSpan(content, node);
    return { line: lineAt(content, span.start), start: span.start, end: span.end, node };
  });
}

/**
 * Compute the verified replacement text for a leaf `BLOCK_INVALID` finding —
 * the `match` half of a `{ search, match }` `TextEdit`.
 *
 * `null` for a block with children, unconditionally — a settled ceiling
 * (wpbg-hdl), not a pending limitation. Canonicalizing a parent does not
 * strip its children (that is `shallowMarkup()` above, for the unrelated
 * purpose of isolating a *verdict*); it recursively re-serializes every
 * descendant, the way Gutenberg's `canonicalize`/`save()` does for any markup
 * spanning more than one block. Whether a given descendant's bytes survive
 * that re-serialization unchanged depends on whether the source's existing
 * formatting already matches what the serializer would emit for that block
 * type — not on where the defect lives — and that is only knowable by doing
 * the rewrite and diffing it, the exact ambiguity `match` exists to avoid
 * answering by inspection. So a parent's `match` would be a bulk,
 * unverifiable rewrite of its whole subtree masquerading as a `TextEdit`. See
 * docs/adr/0002-search-is-byte-exact-or-absent.md (2026-09-12 amendment) for
 * the full record.
 *
 * For a leaf, canonicalizes the block alone, re-conforms the *whole*
 * canonicalized block to the file's own line-ending convention (not just the
 * extracted inner content — `conformToSource` matches the *input's* trailing-
 * newline state against the *whole file*, and an inner span with its
 * surrounding whitespace already trimmed off would almost always read as
 * "lacks a trailing newline", spuriously earning one back), then extracts the
 * corrected element the same way `search` was extracted from the original
 * (`markupSpan`), splices it into the block's own original delimiters, and
 * verifies the splice actually validates clean before returning it. `null`
 * unless that verification passes: this is a claim an agent applies
 * unattended, not a best-effort guess (docs/adr/0002-search-is-byte-exact-or-absent.md
 * extends the same honesty rule here).
 *
 * @param {object} params
 * @param {object} params.node the block-tree node from `resolveItemLines`'s resolved entry
 * @param {{ start: number, end: number }} params.searchSpan the same span reported as `search`
 * @param {string} params.sourceContent the unmasked file content `node`'s offsets index into
 * @param {string} params.raw the file exactly as read from disk, for line-ending conformance
 * @param {(markup: string) => Promise<string|null>} params.fixMarkup canonicalize a markup string
 * @param {(markup: string) => Promise<{ ok: boolean, data: object|null }>} params.validateMarkup
 * @param {(suggestion: string, raw: string) => string} params.conformToSource
 * @returns {Promise<string|null>}
 */
export async function resolveMatch({ node, searchSpan, sourceContent, raw, fixMarkup, validateMarkup, conformToSource }) {
  if (node.children.length > 0) return null;

  const blockMarkup = sourceContent.slice(node.start, node.end);
  const correctedRaw = await fixMarkup(blockMarkup);
  if (correctedRaw == null) return null;

  const conformedBlock = conformToSource(correctedRaw, raw);

  const correctedNodes = flattenBlockTree(buildBlockTree(conformedBlock)).filter((b) => b.end != null);
  if (correctedNodes.length !== 1) return null;

  const correctedSpan = markupSpan(conformedBlock, correctedNodes[0]);
  const correctedInner = conformedBlock.slice(correctedSpan.start, correctedSpan.end);

  const candidate =
    sourceContent.slice(node.start, searchSpan.start) + correctedInner + sourceContent.slice(searchSpan.end, node.end);

  const result = await validateMarkup(candidate);
  if (!result.ok || !result.data) return null;
  if (result.data.summary && result.data.summary.blocks !== 1) return null;
  if ((result.data.items || []).length > 0) return null;

  return correctedInner;
}
