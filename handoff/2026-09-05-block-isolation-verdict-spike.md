# Spike (wpbg-4n7): does a block validated in isolation match its in-document verdict?

**Date:** 2026-09-05
**Bead:** `wpbg-4n7`
**Answer:** **Yes — unconditionally, and by construction rather than by coincidence.**

A block extracted at its exact delimiter span and validated alone receives the same verdict
and the same reason as it does inside its document. This held for every block in both
fixtures tested, and the reason it holds is visible in Gutenberg's own source: the
validation inputs are all intrinsic to the block.

---

## 1. Why it holds — the structural argument

This is the part that makes the answer safe to build on. `validateBlock`
(`node_modules/@wordpress/blocks/build/api/validation/index.cjs:370`):

```js
function validateBlock(block, blockTypeOrName = block.name) {
  ...
  generatedBlockContent = getSaveContent(blockType, block.attributes);
  const isValid = isEquivalentHTML(block.originalContent, generatedBlockContent, logger);
  ...
}
```

Validation compares exactly two things:

| input | where it comes from |
|---|---|
| `getSaveContent(blockType, block.attributes)` | the block's **own** name and its **own** delimiter attribute JSON |
| `block.originalContent` | the block's **own** inner HTML, with descendant blocks stripped out |

Note `getSaveContent` is called with **two** arguments. Its third parameter is
`innerBlocks`, so it defaults to `undefined` and then to `[]` in
`getSaveElement(blockTypeOrName, attributes, innerBlocks = [])`
(`build/api/serializer.cjs:93`). Which in turn calls:

```js
let element = save({ attributes, innerBlocks });
```

**`save()` receives no context parameter.** Block context (`usesContext` /
`providesContext`) is an editor and server-render mechanism; it never reaches `save()`.
Ancestor attributes — `layout`, `align`, theme-level values — therefore cannot influence a
descendant's saved markup, which was the bead's primary suspected source of divergence.

Both inputs are properties of the block itself, and both are preserved byte-for-byte when
the block's delimiter-to-closer span is sliced out. Identical inputs, identical verdict.

This also explains an observation from `wpbg-djb`: `originalContent` for a container comes
back as `<div class="...">\n\n</div>` with inner blocks blanked. It *must*, in order to be
comparable against a `save()` invoked with `innerBlocks = []`.

## 2. Method

`tokenizeDelimiters()` (`src/structural.js`) gives byte-exact `start`/`end` for every
delimiter but does no pairing — `checkStructuralBalance()` builds that stack and discards
it. The spike harness (`.scratch/spike-4n7.mjs`) re-runs that pass and keeps it, producing
a block tree with exact spans.

For each block it validates `content.slice(start, end)` alone. A block's **own** verdict is
derived as its subtree's items minus its direct children's subtree items, which avoids
relying on `item.source` positions — those are unreliable (`wpbg-djb`). The reconciliation
compares the multiset of own-verdicts against the document's items, keyed on
`(block, reason)`.

## 3. Fixture A — `tests/fixtures/mastermind-ls/parts/title.html`

The fixture the bead names. Document verdict: `{"blocks":8,"valid":4,"invalid":4}`.

| line | depth | block | isolated summary | own verdict | matches document |
|---|---|---|---|---|---|
| 1 | 0 | `core/group` page-hero | `8 blocks, 4 invalid` | **invalid** | yes |
| 3 | 1 | `core/group` hero-blob-1 | `1 block, 0 invalid` | valid | yes |
| 6 | 1 | `core/group` word-cloud-bg | `2 blocks, 2 invalid` | **invalid** | yes |
| 8 | 2 | `core/paragraph` | `1 block, 1 invalid` | **invalid** | yes |
| 14 | 1 | `core/group` page-hero-inner | `4 blocks, 1 invalid` | valid | yes |
| 16 | 2 | `core/paragraph` eyebrow | `1 block, 1 invalid` | **invalid** | yes |
| 19 | 2 | `core/post-title` (self-closing) | `1 block, 0 invalid` | valid | yes |
| 20 | 2 | `core/paragraph` sub | `1 block, 0 invalid` | valid | yes |

Reconciliation: 4 document items, 4 isolated own-verdicts, **0 missing, 0 extra**.

This covers two of the three cases the bead asked about specifically:

- **Nesting depth** — depths 0, 1 and 2 all agree, and these spans came from the tokenizer
  rather than being hand-written.
- **A block whose parent is invalid** — the paragraph at line 8 sits inside the invalid
  `word-cloud-bg` group. Same verdict, same reason, isolated or not.

## 4. Fixture B — context inheritance (`.scratch/inherit-probe.html`)

Fixture A contains no blocks that plausibly inherit from an ancestor, so this probe was
built for the third case: `core/columns`/`core/column` (width to `flex-basis`),
`core/buttons`/`core/button`, and `core/list`/`core/list-item`. One child was deliberately
corrupted (a `core/column` missing its `flex-basis` style).

Document verdict: `{"blocks":10,"valid":9,"invalid":1}`.

| line | depth | block | isolated summary | own verdict | matches document |
|---|---|---|---|---|---|
| 1 | 0 | `core/columns` | `5 blocks, 1 invalid` | valid | yes |
| 3 | 1 | `core/column` 33.33% | `2 blocks, 0 invalid` | valid | yes |
| 5 | 2 | `core/paragraph` | `1 block, 0 invalid` | valid | yes |
| 10 | 1 | `core/column` 66.66% (corrupted) | `2 blocks, 1 invalid` | **invalid** | yes |
| 12 | 2 | `core/paragraph` centered | `1 block, 0 invalid` | valid | yes |
| 19 | 0 | `core/buttons` | `2 blocks, 0 invalid` | valid | yes |
| 21 | 1 | `core/button` | `1 block, 0 invalid` | valid | yes |
| 26 | 0 | `core/list` | `3 blocks, 0 invalid` | valid | yes |
| 28 | 1 | `core/list-item` | `1 block, 0 invalid` | valid | yes |
| 31 | 1 | `core/list-item` | `1 block, 0 invalid` | valid | yes |

Reconciliation: **0 missing, 0 extra**.

The corrupted `core/column` is the load-bearing row: it is invalid in the document and
invalid alone, with the same reason, despite `core/column` being exactly the kind of block
one would expect to depend on its parent.

## 5. Does extraction need to include the parent's delimiters?

**No.** Section 1 is the reason — nothing outside the block's own span feeds its
validation. Fixture B confirms it empirically for parent/child pairs designed to inherit.

This matters because including parent delimiters would have reintroduced the
overlapping-span problem that makes sequential find-and-replace unsafe. It does not arise.

## 6. Cost

Measured in-process (post-`wpbg-km9` adapter), one Node process:

| | first call (jsdom + Gutenberg boot) | subsequent |
|---|---|---|
| Fixture A, 8 blocks | ~7.9s (the document validate) | min 0ms, median 9ms, max 61ms — **128ms total for all 8** |
| Fixture B, 10 blocks | — | min 1ms, median 2ms, max 8ms — **29ms total for all 10** |

Validating every block of a file individually is a rounding error against the one-time
boot already being paid.

## 7. Caveats and limits

- **Fallback blocks always validate.** `validateBlock` returns `[true, []]` immediately for
  the freeform and unregistered-type handlers. Consistent in both modes, so it does not
  cause divergence, but such blocks carry no verdict either way.
- **Dynamic blocks have no `save()`.** `getSaveElement` returns `null` when
  `blockType.save` is absent, so server-rendered blocks are never invalid. Again consistent
  in both modes.
- **The span must be delimiter-exact.** Slicing loosely could leave stray text that parses
  into a synthesized `core/freeform` block. `tokenizeDelimiters()` plus the pairing pass
  gives exact bounds; nothing looser should be used.
- **Harness caveat.** Own-verdict derivation subtracts child items keyed on
  `(block, reason)`. A parent and child producing a byte-identical name *and* reason could
  mis-assign. Not observed in either fixture, and it would not change the reconciliation
  totals, only which row a verdict is attributed to.
- **Not tested:** `core/html` (block-runner skips it before validating), media-bearing
  blocks that trigger resolution, and blocks inside `core/query`/`core/post-template`.

## 8. Consequences

### For `wpbg-x8v` (the `match` field — currently closed wontfix)

The bead's stated reopen condition is met. Cost was the original objection and it is gone;
correctness was what remained, and isolation is sound.

A follow-up probe canonicalized three invalid blocks from Fixture A in isolation:

| block | result |
|---|---|
| `core/paragraph` line 8 | **repaired** in 34ms — `style="margin-top:0;margin-bottom:0"` added, summary `1 valid, 0 invalid` |
| `core/paragraph` line 16 | **repaired** in 12ms — `style="margin-top:0;margin-bottom:1.25rem"` added |
| `core/group` line 6 (word-cloud-bg) | **not repaired** — `aria-hidden="true"` has no attribute to hold it; stays invalid |

So per-block correction genuinely produces corrected markup for the repairable subset, and
the whole-document reformatting problem disappears when the input is a single block.

Two new obstacles surfaced that `wpbg-x8v` must account for, and neither was known when it
was closed:

1. **Canonicalize decodes HTML entities.** The line-8 paragraph's numeric character
   references came back as literal CJK/Cyrillic/Greek characters. Semantically equivalent,
   but not byte-preserving — a `match` value would rewrite content the user did not ask to
   change.
2. **Not every invalid block is repairable.** The `aria-hidden` group confirms the
   already-documented case. `match` would have to be `null` for those, not absent.

### For `wpbg-djb` (block-runner position misattribution)

This spike unblocks the downstream fix. Since a block's verdict can be established
independently, the correct item-to-block mapping can be recovered without parsing
block-runner's `reason` prose and without patching the dependency: validate each candidate
span, learn which blocks are genuinely invalid, then map to `items` in document order
(items are emitted in `flattenBlocks` pre-order, which is document order).

### For `docs/adr/0003-no-corrected-markup-in-findings.md`

Its "settle that before reopening" line now points at a real answer: **isolation is sound.**
The ADR's cost-based reasoning is superseded; its remaining valid objections are entity
decoding and the unrepairable subset.

---

## Reproduction

The scripts were run from `.scratch/` (gitignored, so nothing there survives). They are
inlined below so the method outlives the session that produced it.

### A. The harness — `spike-4n7.mjs <file>`

Produces the tables in sections 3 and 4. Run as `node .scratch/spike-4n7.mjs <file>` from
the repo root.

```js
import fs from 'node:fs';
import { validate } from 'block-runner';
import { tokenizeDelimiters, qualifyBlockName } from '../src/structural.js';

// tokenizeDelimiters() returns a flat token list and does no pairing;
// checkStructuralBalance() builds a stack and discards it. This is that pass, kept.
function buildTree(content) {
  const tokens = tokenizeDelimiters(content);
  const roots = [];
  const stack = [];
  for (const t of tokens) {
    if (t.selfClosing) {
      const node = { name: qualifyBlockName(t.blockName), line: t.line, start: t.start, end: t.end, children: [] };
      (stack.length ? stack[stack.length - 1].children : roots).push(node);
      continue;
    }
    if (!t.closing) {
      const node = { name: qualifyBlockName(t.blockName), line: t.line, start: t.start, end: null, children: [] };
      (stack.length ? stack[stack.length - 1].children : roots).push(node);
      stack.push(node);
    } else {
      const node = stack.pop();
      if (node) node.end = t.end;
    }
  }
  return roots;
}

function flatten(nodes, out = [], depth = 0) {
  for (const n of nodes) { out.push({ ...n, depth }); flatten(n.children, out, depth + 1); }
  return out;
}

const key = (it) => `${it.block}||${it.reason}`;
function sub(a, b) { // multiset difference a \ b
  const out = [...a];
  for (const x of b) { const i = out.findIndex((y) => key(y) === key(x)); if (i !== -1) out.splice(i, 1); }
  return out;
}

const file = process.argv[2];
const content = fs.readFileSync(file, 'utf8');
const all = flatten(buildTree(content));

const doc = await validate(content);
console.log(`DOCUMENT summary=${JSON.stringify(doc.summary)}`);

const results = new Map();
for (const n of all) {
  const r = await validate(content.slice(n.start, n.end));
  results.set(n, { items: r.items, summary: r.summary });
}

// own verdict = subtree items minus direct children's subtree items,
// so nothing depends on item.source positions (unreliable — see wpbg-djb)
const nodeOf = new Map(all.map((n) => [`${n.start}`, n]));
const ownAll = [];
for (const n of all) {
  let childItems = [];
  for (const c of n.children) childItems = childItems.concat(results.get(nodeOf.get(`${c.start}`)).items);
  const own = sub(results.get(n).items, childItems);
  ownAll.push(...own);
  console.log(
    `${String(n.line).padStart(4)}  d${n.depth}  ${n.name.padEnd(20)}  ` +
    `${JSON.stringify(results.get(n).summary).padEnd(42)}  ` +
    `${own.length === 0 ? 'valid' : 'INVALID: ' + own[0].reason.slice(0, 60)}`
  );
}

const missing = sub(doc.items, ownAll);
const extra = sub(ownAll, doc.items);
console.log(`missing=${missing.length} extra=${extra.length}`);
console.log(`VERDICT: ${missing.length === 0 && extra.length === 0 ? 'ISOLATION MATCHES DOCUMENT' : 'DIVERGENCE'}`);
```

### B. Fixture B — the context-inheritance probe

The load-bearing evidence for section 4. Parent/child pairs chosen because the child
plausibly depends on the parent: `core/column` carries a width that becomes `flex-basis`,
`core/button` and `core/list-item` only ever appear inside their containers. The second
`core/column` is deliberately corrupted — its `flex-basis` style is missing.

```html
<!-- wp:columns {"isStackedOnMobile":false} -->
<div class="wp-block-columns is-not-stacked-on-mobile">
<!-- wp:column {"width":"33.33%"} -->
<div class="wp-block-column" style="flex-basis:33.33%">
<!-- wp:paragraph -->
<p>Left</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->
<!-- wp:column {"width":"66.66%"} -->
<div class="wp-block-column">
<!-- wp:paragraph {"align":"center"} -->
<p class="has-text-align-center">Right</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->
</div>
<!-- /wp:columns -->
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button {"className":"is-style-fill"} -->
<div class="wp-block-button is-style-fill"><a class="wp-block-button__link wp-element-button">Go</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
<!-- wp:list {"ordered":false} -->
<ul class="wp-block-list">
<!-- wp:list-item -->
<li>One</li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li class="bogus">Two</li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
```

### C. The per-block canonicalize probe (section 8)

Same `buildTree`/pairing pass, then for each chosen block:

```js
const r = await canonicalize(content.slice(span.start, span.end));
console.log(JSON.stringify(r.summary), r.output);
```

Run against `tests/fixtures/mastermind-ls/parts/title.html` for the blocks opening at
lines 6, 8 and 16.
