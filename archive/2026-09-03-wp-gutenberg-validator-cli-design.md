# Design Decision: WordPress/Gutenberg Block Markup Validator CLI

**Date:** 2026-09-03
**Supersedes the "build from scratch" plan** in `archive/2026-09-02-wordpress-gutenberg-markup-validation-research.md` and the `archive/wp-block-validator/` research artifacts, based on empirical testing done this session.
**Bottom line: do not build a new validator. Adopt `block-runner` (npm, GPL-2.0-or-later, `humanmade/block-runner`) and add two small supplementary layers around it.** The reasons follow from direct testing, not just README claims.

---

## 1. Why not build a from-scratch CLI

The prior research (`wp-block-validation-prior-art.md` §1) had already surfaced `humanmade/block-runner` as real, active, npm-published prior art with a `convert`/`validate`/`fix`/`skill` command set matching this project's exact requirements. That alone was not sufficient to decide — a README can overclaim. So before designing anything, `block-runner@0.8.0` was installed and run against known-good, known-bad, malformed, and PHP-mixed fixtures. Findings below are from that run, not from documentation.

### Confirmed: it does the actual `save()`-diff check, not just structural linting

Prior research (`wp-block-validation-prior-art.md` §4) established that a merely-structural validator (balanced delimiters, valid JSON) **cannot** catch the specific "unexpected or invalid content" failure the user is fighting — that requires re-running each block's real `save()` and diffing. `block-runner` does this (it bundles `@wordpress/blocks` + `@wordpress/block-library` + `@wordpress/element`, per the earlier npm dependency audit). Confirmed empirically: a `core/heading` missing its `wp-block-heading` class was correctly caught:

```json
{
  "ok": false,
  "items": [{
    "block": "core/heading",
    "status": "invalid",
    "reason": "Expected attributes [ [ 'class', 'wp-block-heading', true ] ], instead saw [].",
    "source": { "path": "bad-heading.html", "htmlLine": 1, "htmlColumn": 1, "offset": 0 }
  }]
}
```

This is exactly the failure mode the user described (block silently invalidated in the editor, content lost on recovery) — reproduced and caught outside a browser, with no jsdom/WordPress instance required by the *caller*.

### Confirmed: `fix` performs a real, safe canonicalization

`block-runner fix bad-heading.html --out bad-heading.fixed.html` rewrote:

```diff
- <!-- wp:heading {"level":2} -->
- <h2>Missing class heading</h2>
+ <!-- wp:heading -->
+ <h2 class="wp-block-heading">Missing class heading</h2>
  <!-- /wp:heading -->
```

(It also dropped `{"level":2}` because level 2 is `core/heading`'s default — correct canonicalization behavior, not data loss.)

### Confirmed: agent-facing documentation already exists and is good

`npx block-runner skill` prints a complete Markdown "agent guide" to stdout — no install required to read it. It opens with exactly the framing this task asked for ("You are an AI agent producing or checking WordPress content... runs locally and deterministically, never calls a model, never needs an API key"), then documents an intent-tree (`assemble`) input format with per-block-type mapping rules (accordion, hero, pricing cards, etc.) and a decision table for choosing `assemble` vs `convert` vs `validate→fix→validate`. `block-runner skill --install` installs this guide into `.claude/skills/block-runner` or `.agents/skills/block-runner` for first-contact use by a coding agent, which is precisely the "documentation on first contact" requirement.

Source: <https://github.com/humanmade/block-runner> (README, CLI table, "Using Block Runner from an AI agent" section). npm: <https://www.npmjs.com/package/block-runner>.

### Given this, a from-scratch Level-2 validator would just be reimplementing block-runner

Building the jsdom/`@wordpress/block-library`/React plumbing described in `jsdom-wordpress-blocks-feasibility.md` and `wp-block-validation-prior-art.md` §4 would reproduce, at nonzero risk (unproven ESM/CJS import behavior, `matchMedia`/`ResizeObserver` shimming), a solved problem. The only justified new work is closing the gaps block-runner actually has — found by testing, in §2 below — plus project wiring, in §3.

---

## 2. Two real gaps found by testing (not from the README)

### Gap A — Malformed/unbalanced block delimiters are NOT caught

Test: a `<!-- wp:heading {"level":2} -->` with **no matching `<!-- /wp:heading -->`**.

```json
{ "ok": true, "summary": { "blocks": 1, "valid": 1, "invalid": 0, "warnings": 0 }, "items": [] }
```

It silently accepted the unbalanced fragment as one valid block — no structural error, no warning. This is a real hole: the prior research's Level 0 check (`@wordpress/block-serialization-default-parser`, confirmed **zero runtime dependencies**, MIT-equivalent) exists specifically to catch this class of corruption and evidently block-runner's own parsing is more forgiving than the raw delimiter grammar. **This must not be silently trusted** — an agent could still ship a document with genuinely unbalanced comments if block-runner is the only gate.

Reference for the correct grammar this should be checked against: `@wordpress/block-serialization-default-parser` source (`packages/block-serialization-default-parser/src/index.ts` on `WordPress/gutenberg` trunk) — regex `<!--\s+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+({...})?...-->`, stack-based `proceed()` state machine. <https://github.com/WordPress/gutenberg/blob/trunk/packages/block-serialization-default-parser/src/index.ts>

### Gap B — PHP tags inside the fragment are silently tolerated, not flagged

Test: a file with a leading `<?php /* header */ ?>` followed by valid block markup.

```json
{ "ok": true, "summary": { "blocks": 2, "valid": 2, "invalid": 0, "warnings": 0 }, "items": [] }
```

No crash — but no distinct finding either. The PHP tag was silently counted as an anonymous second "block" and reported valid. This matters directly for the user's stated `.php`-fragment input case: PHP interpolation (`<?= $var ?>`, conditional blocks, loops) inside markup is **not statically checkable** by any HTML-level validator, block-runner included. Treating it as "valid" is misleading — it means "valid modulo content this tool cannot see." The consequence of *not* flagging this is a false sense of safety on exactly the file type the user explicitly asked to support.

---

## 3. Recommended design: block-runner + two thin wrapper layers

### Layer 0 — PHP-fragment extraction and flagging (new, small, ~30-line script)

Before handing a `.php` file to block-runner:

1. Strip a single leading `<?php ... ?>` header comment block if present (common WordPress pattern-file convention, matching the header-comment style already used in `tools/validate-patterns.php` from prior research — but do **not** reuse that script's blanket "any `<?` = error" rule, since a leading header is normal and expected in `patterns/*.php` files).
2. Scan the *remainder* (the part that will actually be sent to block-runner as markup) for any `<?php`, `<?=`, or `?>` occurrence.
3. If found, emit a distinct finding — not an error, not silently ignored — e.g.:
   ```json
   { "code": "PHP_INTERPOLATION_UNCHECKED", "severity": "warning",
     "message": "PHP tag found inside block markup region; this content cannot be statically validated and was not checked by block-runner.",
     "line": <n> }
   ```
   This gives the coding agent the "why" it needs: not "invalid," but "unverifiable — review by hand or move dynamic logic outside the block boundary."

### Layer 1 — Structural pre-check (new, small, wraps a zero-dependency package)

Run `@wordpress/block-serialization-default-parser`'s tokenizer over the content **before** invoking block-runner, purely to catch delimiter corruption (Gap A). This package has no runtime dependencies (confirmed via `npm view @wordpress/block-serialization-default-parser dependencies` in prior research), so it adds negligible weight and no jsdom/React exposure. Any unbalanced/malformed delimiter found here should short-circuit with a structural error finding before block-runner's own (more lenient) parse ever runs, since a false "valid" from block-runner on genuinely corrupt input is worse than a redundant check.

Reference: <https://www.npmjs.com/package/@wordpress/block-serialization-default-parser>

### Layer 2 — block-runner itself, invoked correctly (no new code, just usage discipline)

- **Install as a project dependency, do not invoke via bare `npx` in a hot loop.** Measured cold-start via `npx block-runner validate ... --json` was **~12 seconds per invocation** (three runs: 11.95s, 11.83s, 12.60s) — almost entirely `npx` package-resolution overhead, not the validator's own compute (user+sys time per run was ~0.1–0.2s). For an agent doing generate→validate→fix→revalidate in a loop, paying 12s per call is disqualifying for "quick." Fix: `npm install --save-dev block-runner` once, then call `./node_modules/.bin/block-runner` (or a package.json script) directly, bypassing `npx`'s resolution step entirely. This should reduce per-call latency to roughly the ~0.1–0.2s of actual work, though this specific number (direct-bin latency) was not independently re-measured this session and should be spot-checked once wired in.
- **Batch, don't loop per-fragment.** `validate` and `fix` accept a glob (`content/**/*.html`), so an agent validating many fragments in one pass should pass a single glob rather than shelling out once per file, to further amortize any residual process-start cost.
- **Use `--json` always** for agent consumption; human-readable output is a separate, non-machine-parseable mode.
- **Use `fix` only as a proposal, not blind auto-apply.** `fix` rewrites near-miss markup via real canonicalization (confirmed safe in the heading test — it corrected the class and normalized default-valued attributes out of the JSON, it did not destroy content). But per the earlier prior-art analysis, canonicalization is unsafe when a parsed node has `blockName: null` with non-empty `innerHTML` (freeform/unparsed content) — the agent should run `validate` first, only invoke `fix` when the `invalid` items are attribute/class-level mismatches on recognized block names, and always re-run `validate` on the fixed output before trusting it.
- **Install the skill once.** Run `npx block-runner skill --install` at project setup, not per-invocation, so the coding agent has the guide (`.claude/skills/block-runner` or `.agents/skills/block-runner`) available on first contact without needing this design doc re-explained to it each session.

### What this explicitly does not add

- No jsdom, no direct `@wordpress/blocks`/`@wordpress/block-library` dependency, no custom `save()`-diff implementation — block-runner owns that surface and is actively maintained (per prior research: CI badge, npm publish via GitHub Actions/OIDC, ~49+ stars).
- No custom-block (`block.json`) registration support. Out of scope per the user's stated problem (core-block content, not a plugin's custom blocks); the advisor review of this session's research also flagged the naive `save: () => null` registration pattern seen in one of the prior brainstorming transcripts as actively wrong (it makes any unregistered custom block trivially "valid") — do not carry that pattern forward if custom-block support is ever added later.

---

## 4. Command surface an agent actually needs (for a project README / onboarding note)

```sh
# one-time setup
npm install --save-dev block-runner
npx block-runner skill --install          # installs the agent guide once

# per-fragment or per-batch, in an agent loop
./node_modules/.bin/block-runner validate "content/**/*.{html,php}" --json
./node_modules/.bin/block-runner fix <file> --out <file>.fixed.html   # only after reviewing validate's findings
./node_modules/.bin/block-runner validate <file>.fixed.html --json    # re-check before publishing
```

Exit codes (confirmed empirically, matching documentation): `0` clean, `1` findings present. (`2` usage/I-O error and `3` headless-Gutenberg boot failure are documented but not independently triggered this session.)

---

## 5. Open items for a follow-up session (not blocking adoption)

- Re-measure block-runner's direct-bin (non-`npx`) cold start once wired into an actual project, to confirm the ~12s figure really is `npx`-resolution overhead and not partially attributable to `registerCoreBlocks()`/React init inside the tool itself.
- Confirm whether block-runner has an official position on Gap A (unbalanced delimiters) — worth filing or searching for an existing issue on `humanmade/block-runner` before assuming Layer 1 is permanently necessary; it may be a known, intentional leniency (e.g., it may rely on its own converter's structural assumptions rather than the strict grammar) rather than an oversight.
- The `--explain` flag was tested and returned byte-identical output to plain `--json` on this simple single-block fixture; it may only add near-miss/rule-attribution content on more complex multi-rule cases (e.g. during `convert`, not `validate`) — not confirmed either way this session.
- `wp-7.1`'s npm dist-tag still does not exist as of this session (`@wordpress/blocks` dist-tags checked 2026-09-03: highest is still `wp-7.0` → `15.13.1`); irrelevant to block-runner adoption directly (it pins its own dependency versions), but relevant if Layer 1's structural parser is ever version-pinned explicitly.

## Sources

- <https://github.com/humanmade/block-runner> — README (CLI table, flags, exit codes, agent-skill section, "Why Block Runner" failure-mode list), fetched via `gh api repos/humanmade/block-runner/contents/README.md` on 2026-09-03.
- <https://www.npmjs.com/package/block-runner> — package registry entry, version 0.8.0 confirmed current at time of testing (up from 0.7.1 recorded in prior research on 2026-08-30).
- <https://www.npmjs.com/package/@wordpress/block-serialization-default-parser> — zero-runtime-dependency structural parser recommended for Layer 1.
- <https://github.com/WordPress/gutenberg/blob/trunk/packages/block-serialization-default-parser/src/index.ts> — canonical delimiter grammar reference.
- Empirical test data (help output, JSON finding shape, fix diff, PHP-fragment behavior, stdin behavior, cold-start timing, malformed-markup behavior, exit codes, `skill` output) — produced this session against `block-runner@0.8.0` installed via `npm install block-runner@0.8.0` in a scratch directory, Node v24.19.0, Windows/Git Bash.
- `archive/2026-09-02-wordpress-gutenberg-markup-validation-research.md` and `archive/wp-block-validator/*.md` — prior-session primary-source research this design builds on (validation algorithm internals, dist-tag lag, competing tools, official WordPress agent-skills status).
