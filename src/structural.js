// Layer 1 — structural delimiter pre-check.
//
// Gap addressed (see archive/2026-09-03-wp-gutenberg-validator-cli-design.md §2,
// "Gap A"): empirically, block-runner's own parser silently accepted a
// "<!-- wp:heading -->" with no matching closing comment and reported the
// fragment as one valid block. That is the exact class of corruption a
// pre-publish gate must not wave through. This module re-implements just the
// balance/JSON checks from the canonical delimiter grammar
// (https://github.com/WordPress/gutenberg/blob/trunk/packages/block-serialization-default-parser/src/index.ts)
// as a small, dependency-free scanner: find every "<!-- wp:name {...} -->"
// token, track an open/close stack, and flag anything that does not balance
// or whose attribute JSON does not parse. It does not attempt to replicate
// the full parser (inner content extraction, namespaces beyond a single
// "/"), only the two failure classes block-runner was observed to miss.

const WS = /\s/;

function isNameChar(ch) {
  return /[a-zA-Z0-9_-]/.test(ch);
}

function readName(content, start) {
  let p = start;
  if (p >= content.length || !/[a-zA-Z]/.test(content[p])) return null;
  p++;
  while (p < content.length && isNameChar(content[p])) p++;
  // optional single "/namespace" segment, e.g. "my-plugin/card"
  if (content[p] === '/' && /[a-zA-Z]/.test(content[p + 1] || '')) {
    p++;
    p++;
    while (p < content.length && isNameChar(content[p])) p++;
  }
  return { name: content.slice(start, p), end: p };
}

function skipWs(content, p) {
  while (p < content.length && WS.test(content[p])) p++;
  return p;
}

function readBalancedJson(content, start) {
  // start points at '{'. Scans forward respecting quoted strings until the
  // matching '}' at depth 0. Returns { raw, end, valid } — `end` is the index
  // just past the closing brace (or content.length if never balanced).
  let depth = 0;
  let inStr = false;
  let strCh = null;
  let esc = false;
  let p = start;
  for (; p < content.length; p++) {
    const c = content[p];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      strCh = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        p++;
        break;
      }
    }
  }
  if (depth !== 0) {
    return { raw: content.slice(start), end: content.length, valid: false };
  }
  const raw = content.slice(start, p);
  let valid = true;
  try {
    JSON.parse(raw);
  } catch {
    valid = false;
  }
  return { raw, end: p, valid };
}

/**
 * 1-based line number of a byte offset.
 * @param {string} content
 * @param {number} index
 */
export function lineAt(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/**
 * Tokenize every "<!-- (/)?wp:name {json}? (/)?-->" delimiter in content.
 * @param {string} content
 */
export function tokenizeDelimiters(content) {
  const tokens = [];
  let i = 0;
  while (i < content.length) {
    const start = content.indexOf('<!--', i);
    if (start === -1) break;
    let p = skipWs(content, start + 4);
    let closing = false;
    if (content[p] === '/') {
      closing = true;
      p = skipWs(content, p + 1);
    }
    if (content.slice(p, p + 3) !== 'wp:') {
      i = start + 4;
      continue;
    }
    p += 3;
    const nameResult = readName(content, p);
    if (!nameResult) {
      i = start + 4;
      continue;
    }
    const blockName = nameResult.name;
    p = skipWs(content, nameResult.end);

    let attrsRaw = null;
    let attrsValid = true;
    if (content[p] === '{') {
      const jsonResult = readBalancedJson(content, p);
      attrsRaw = jsonResult.raw;
      attrsValid = jsonResult.valid;
      p = skipWs(content, jsonResult.end);
    }

    let selfClosing = false;
    if (content[p] === '/') {
      selfClosing = true;
      p = skipWs(content, p + 1);
    }

    if (content.slice(p, p + 3) !== '-->') {
      // Not a well-formed terminator for this candidate; treat as a
      // non-delimiter comment rather than guessing, to avoid false positives.
      i = start + 4;
      continue;
    }
    const end = p + 3;
    tokens.push({
      blockName,
      closing,
      selfClosing,
      attrsRaw,
      attrsValid,
      start,
      end,
      line: lineAt(content, start),
    });
    i = end;
  }
  return tokens;
}

/**
 * Qualify a block name the way Gutenberg's own delimiter grammar does: core
 * blocks omit the "core/" namespace in their "<!-- wp:name -->" comment
 * (e.g. "<!-- wp:heading -->"), while non-core blocks always write a full
 * "namespace/name" (e.g. "<!-- wp:my-plugin/card -->"). This keeps a bare
 * name (no "/") as parsed internally by the tokenizer/balance-stack (which
 * must keep matching openers/closers by the exact text that was written),
 * but qualifies it to "core/<name>" only where a name is surfaced in a
 * finding — so `blockName` is consistently namespaced with the
 * `BLOCK_INVALID` findings block-runner itself produces (see
 * src/pipeline.js).
 * @param {string} name
 * @returns {string}
 */
export function qualifyBlockName(name) {
  if (!name || name.includes('/')) return name;
  return `core/${name}`;
}

/**
 * Each finding carries the `start`/`end` byte offsets of the delimiter token
 * it is about, so a caller holding the original content can slice the exact
 * delimiter text for the finding's `search` field. This function is
 * deliberately not given the content itself: it is exported and tested against
 * tokens alone, and `src/pipeline.js` — which must slice from the *pre-mask*
 * body, not the masked one the tokenizer saw — is the only place that can do
 * the slicing correctly.
 *
 * `STRUCTURAL_NO_BLOCKS` has no token and so no span.
 *
 * @param {ReturnType<typeof tokenizeDelimiters>} tokens
 * @returns {Array<{ code: string, line: number, blockName?: string, detail?: string, start?: number, end?: number }>}
 */
export function checkStructuralBalance(tokens) {
  const findings = [];
  const stack = [];

  for (const token of tokens) {
    if (token.attrsRaw !== null && !token.attrsValid) {
      const name = qualifyBlockName(token.blockName);
      findings.push({
        code: 'STRUCTURAL_INVALID_ATTRS_JSON',
        line: token.line,
        blockName: name,
        start: token.start,
        end: token.end,
      });
    }

    if (token.selfClosing) continue; // void block: no push, nothing to balance

    if (token.closing) {
      const top = stack[stack.length - 1];
      const name = qualifyBlockName(token.blockName);
      if (!top) {
        findings.push({
          code: 'STRUCTURAL_MISMATCHED_CLOSER',
          line: token.line,
          blockName: name,
          detail: `Closing comment for "${name}" found with no matching opener.`,
          start: token.start,
          end: token.end,
        });
      } else if (top.blockName !== token.blockName) {
        const topName = qualifyBlockName(top.blockName);
        findings.push({
          code: 'STRUCTURAL_MISMATCHED_CLOSER',
          line: token.line,
          blockName: name,
          detail: `Closing comment for "${name}" does not match innermost open block "${topName}" (opened at line ${top.line}).`,
          start: token.start,
          end: token.end,
        });
        stack.pop(); // best-effort recovery so one mistake doesn't cascade into every remaining token
      } else {
        stack.pop();
      }
    } else {
      stack.push(token);
    }
  }

  for (const unclosed of stack) {
    const name = qualifyBlockName(unclosed.blockName);
    findings.push({
      code: 'STRUCTURAL_UNBALANCED_DELIMITER',
      line: unclosed.line,
      blockName: name,
      detail: `Block "${name}" opened at line ${unclosed.line} is never closed.`,
      start: unclosed.start,
      end: unclosed.end,
    });
  }

  if (tokens.length === 0) {
    findings.push({ code: 'STRUCTURAL_NO_BLOCKS', line: 1 });
  }

  return findings;
}

/**
 * Run the full structural pre-check over a markup string.
 * @param {string} content
 */
export function runStructuralLayer(content) {
  return checkStructuralBalance(tokenizeDelimiters(content));
}

/**
 * Pair the flat delimiter list into a nested tree of blocks with byte-exact spans.
 *
 * `tokenizeDelimiters()` returns a flat token list and does no pairing;
 * `checkStructuralBalance()` builds the open/close stack only to discard it.
 * Layer 2 needs that structure kept, because block-runner's own per-block
 * positions cannot be trusted — see
 * `docs/adr/0005-finding-line-points-at-the-markup-at-fault.md` and
 * `src/block-locator.js`, which re-derives positions from these spans.
 *
 * Malformed input is deliberately not handled here: `checkStructuralBalance()`
 * reports it and `src/pipeline.js` skips Layer 2 entirely when it does. An
 * opener that never closes simply keeps `end: null`, and callers drop it.
 *
 * `start`/`end` bound the whole block including both delimiters; `innerStart`
 * and `innerEnd` bound the content between them, and are both `null` for a
 * self-closing block, which has no inner content.
 *
 * @param {string} content
 * @returns {Array<{ blockName: string, line: number, start: number, innerStart: number|null, innerEnd: number|null, end: number|null, children: Array }>}
 *   top-level blocks, each in document order
 */
export function buildBlockTree(content) {
  const roots = [];
  const stack = [];

  for (const token of tokenizeDelimiters(content)) {
    const siblings = stack.length > 0 ? stack[stack.length - 1].children : roots;

    if (token.selfClosing) {
      siblings.push({
        blockName: qualifyBlockName(token.blockName),
        line: token.line,
        start: token.start,
        innerStart: null,
        innerEnd: null,
        end: token.end,
        children: [],
      });
      continue;
    }

    if (token.closing) {
      const open = stack.pop();
      if (open) {
        open.innerEnd = token.start;
        open.end = token.end;
      }
      continue;
    }

    const node = {
      blockName: qualifyBlockName(token.blockName),
      line: token.line,
      start: token.start,
      innerStart: token.end,
      innerEnd: null,
      end: null,
      children: [],
    };
    siblings.push(node);
    stack.push(node);
  }

  return roots;
}

/**
 * Flatten a block tree to pre-order (depth-first) sequence, which for
 * delimiter-based markup is document order — the same order block-runner's
 * `validate` walks its own parsed blocks in.
 *
 * @param {ReturnType<typeof buildBlockTree>} nodes
 * @returns {Array<object>}
 */
export function flattenBlockTree(nodes, out = []) {
  for (const node of nodes) {
    out.push(node);
    flattenBlockTree(node.children, out);
  }
  return out;
}

export const BLOCKING_STRUCTURAL_CODES = [
  'STRUCTURAL_UNBALANCED_DELIMITER',
  'STRUCTURAL_MISMATCHED_CLOSER',
  'STRUCTURAL_INVALID_ATTRS_JSON',
];
