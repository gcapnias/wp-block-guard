# Research Report: WordPress/Gutenberg HTML→Block Markup Conversion & Validation

**Date:** 2026-09-02
**Session focus:** User wants to convert HTML to WordPress block markup and validate it programmatically (via a coding agent) *before* publishing to a WordPress site, so malformed markup never reaches the Gutenberg editor and triggers "unexpected or invalid content" / silent content loss on "Attempt Block Recovery."
**Method:** Firecrawl developer index (`firecrawl developer`) + targeted scrapes. All sources below are primary (official docs, GitHub issues/PRs/READMEs) unless marked `[web]`.

## Problem framing

WordPress stores block content as HTML annotated with special comment delimiters (`<!-- wp:name {"attr":1} -->`). The Block Editor validates saved markup by re-running each block's `save()` function and diffing the result against the stored HTML. Any mismatch (wrapper classes, attribute types, whitespace, inner block placement) invalidates the block. On the Site/Post editor this surfaces as "This block contains unexpected or invalid content," and the recovery UI can silently delete content rather than fix it. This is the mechanism the user is trying to avoid by validating *before* upload.

## Key primary sources

### Canonical spec for block markup

- **Markup representation of a block** (Gutenberg docs) — defines delimiter syntax, `wp:` prefix rules, JSON attribute object, self-closing form for dynamic blocks, and states the `save()`-output diff is what triggers validation errors.
  <https://github.com/wordpress/gutenberg/blob/HEAD/docs/getting-started/fundamentals/markup-representation-block.md>
  (mirrored at <https://developer.wordpress.org/block-editor/getting-started/fundamentals/markup-representation-block/>)
- **Static or Dynamic rendering of a block** — explains that when a block's `save` is `null`, the editor *skips* markup validation entirely (relevant if the user's content pipeline can lean on dynamic blocks to sidestep validation risk).
  <https://github.com/wordpress/gutenberg/blob/HEAD/docs/getting-started/fundamentals/static-dynamic-rendering.md>
- **Gutenberg FAQ** — confirms `wp.blocks.parse(postContent)` (JS) and `parse_blocks($post_content)` (PHP) as the canonical ways to parse block markup back into a data structure.
  <https://github.com/wordpress/gutenberg/blob/HEAD/docs/getting-started/faq.md>

### The actual validation function used internally

- **`validateBlock()`** (from `@wordpress/blocks`, part of the Gutenberg monorepo, npm-installable) — "Returns an object with `isValid` property... A block is considered valid if, when serialized with assumed attributes, the content matches the original value." This is the literal function the Block Editor calls; scriptable in Node against a parsed block tree. Source citation found via mirrored docs handbook:
  <https://github.com/kasparsd/wp-docs-md/blob/HEAD/docs/wp-handbooks.md>
- **PR wordpress/gutenberg#38794** — deprecates the older, less-reliable `isValidBlockContent()` in favor of `validateBlock()` (the older function ignored `innerBlocks` and could give false results). Good context if scripting against the validator directly.
  <https://github.com/wordpress/gutenberg/pull/38794> (referenced from issue <https://github.com/wordpress/gutenberg/issues/38794>)
- **PR wordpress/gutenberg#914** — original mechanism: if a block declares a schema, the schema validates the HTML inside its delimiters; on failure the block downgrades to `core/freeform` (Classic/Custom HTML) rather than hard-failing.
  <https://github.com/wordpress/gutenberg/issues/914>

### The gap: no first-class way to convert HTML→blocks outside a browser

- **PR wordpress/gutenberg#82013** (open, not merged) — states plainly: *"There is still no way to turn HTML into blocks outside the browser. Every importer, CLI command and content pipeline either hand-writes block delimiters or reimplements `rawHandler()`."* Proposes making `block.json` declare conversion rules (`transforms` field) so PHP counterparts (`gutenberg_html_to_blocks()`, `gutenberg_html_to_block_markup()`, `gutenberg_switch_block_type()`, `gutenberg_get_block_attributes_from_html()`, `gutenberg_get_block_conversion_support()`) can do this without a browser. Includes a comparison table showing where third-party reimplementations (see below) diverge from real browser `rawHandler()` output (e.g. malformed `<table>` handling differs). **Not usable today** — track for future.
  <https://github.com/wordpress/gutenberg/issues/82013>
  Related upstream issue: <https://github.com/wordpress/gutenberg/issues/13163>

### Third-party tools that fill the gap today (all have git repos, all CLI/script-usable — none guaranteed byte-identical to the browser's real converter, per #82013's comparison table)

- **`chubes4/html-to-blocks-converter`** (PHP/Composer, GPL-2.0) — converts raw HTML to Gutenberg block arrays using WordPress Core's HTML API. Plugin mode (auto-hooks `wp_insert_post()` and REST reads) or **package mode** (`composer require chubes4/html-to-blocks-converter`, call `html_to_blocks_raw_handler()` directly — scriptable standalone, no live site needed for the conversion step). Has an `html_to_blocks_unsupported_html_fallback` filter.
  <https://github.com/chubes4/html-to-blocks-converter>
- **`alleyinteractive/wp-block-converter`** — ships an actual **WP-CLI command** for bulk HTML→Gutenberg block conversion, built on `wp-bulk-task`.
  <https://packagist.org/packages/alleyinteractive/wp-block-converter>
  (GitHub org: <https://github.com/alleyinteractive>)
- **`jverneaut/html-to-gutenberg`** — a Webpack plugin that compiles authored HTML into real block plugin source (`edit.js`, `render.php`, `block.json`, `index.js`). Different use case than converting arbitrary content HTML — this is for *building custom blocks from HTML templates*, not converting one-off post content. Noted for completeness; probably not the right tool for the user's "convert this article's HTML before publishing" workflow.
  <https://github.com/jverneaut/html-to-gutenberg>
- **`Automattic/static-site-importer`** and **`Automattic/studio` issue #3952** — named in #82013 as other reimplementations of `rawHandler()`. Not independently verified this session; worth a follow-up look.
  <https://github.com/Automattic/static-site-importer>
  <https://github.com/Automattic/studio> (issue #3952)
- **`wp-cli/block-command`** issue #11 — also named in #82013 as a reimplementation point. The `wp-cli/block-command` package itself manages block types/patterns/styles/bindings/templates via WP-CLI generally (not specifically HTML→block conversion).
  <https://github.com/wp-cli/block-command>
  <https://developer.wordpress.org/cli/commands/block/>

### A validator/query library with built-in block validation (JS/TS)

- **`fluent-wp-client`** — exposes `set(blocks, blockSchemas)` etc. for structural + round-trip + schema validation of block trees, plus standalone helpers `parseWordPressBlocks`, `serializeWordPressBlocks`, `validateWordPressBlocks`, and a Zod schema (`parsedBlockSchema`) for validating LLM/AI-generated block JSON output specifically.
  <https://github.com/juvojustin/fluent-wp-client> (doc citation: docs/gutenberg-content.mdx)

### Official WordPress "agent skill" for this exact problem (NOT YET MERGED — checked live via GitHub API against `trunk`, confirmed absent)

- **Issue wordpress/agent-skills#57** — proposal for a `wp-block-post-content` skill: "Guides an AI agent in generating, editing, and validating the raw WordPress block comment markup... that gets stored in post content." Documents the exact failure mode the user is worried about: an agent (via WordPress Studio MCP / WP-CLI / `wp_insert_post`) generates markup that renders fine on the front end but is invalid in the editor, and "Attempt Block Recovery" silently drops content (example given: a header row with logo+nav+CTA — the nav block gets dropped entirely on recovery).
  <https://github.com/wordpress/agent-skills/issues/57>
- **PR wordpress/agent-skills#60** — implements the above: `skills/wp-block-post-content/SKILL.md`, `references/core-block-markup-reference.md`, `references/wp-block-validation.md`, `scripts/validate-markup.mjs`, plus eval scenarios. **Status as of this session: open, unmerged.** Verified directly against `https://api.github.com/repos/WordPress/agent-skills/contents/skills` on `trunk` — `wp-block-post-content` is not present in the current skill list (confirmed skills present: blueprint, wordpress-router, wp-abilities-api, wp-abilities-audit, wp-abilities-verify, wp-block-development, wp-block-themes, wp-interactivity-api, wp-patterns, wp-performance, wp-phpstan, wp-playground, wp-plugin-development, wp-plugin-directory-guidelines, wp-project-triage, wp-rest-api, wp-wpcli-and-ops, wpds). **Worth re-checking periodically** — this is the single most on-point tool for the user's stated need, from the source most likely to track the real validation contract.
  <https://github.com/WordPress/agent-skills/pull/60>
  Repo: <https://github.com/wordpress/agent-skills>

### A known, currently-open failure mode worth being aware of when generating markup

- **Issue wordpress/gutenberg#76526** (open) — plain HTML comments (not matching `<!-- wp:* -->`) placed *inside* block delimiters (e.g. inside `templates/*.html` or `patterns/*.php`, or inside a `core/group` block) get treated as literal inner content, not stripped, and can cause "unexpected or invalid content" errors or, worse, have block content silently deleted when the user clicks "Resolve." Maintainer `dmsnell` confirmed via `parse_blocks()` that non-block comments are literal content, not specially parsed. Practical implication: **strip stray HTML comments from source HTML before conversion**, or explicitly wrap intentional ones in `<!-- wp:html -->...<!-- /wp:html -->`.
  <https://github.com/wordpress/gutenberg/issues/76526>

### Dead end / not useful for this goal

- **`wpblockdocs.com/validator`** (<https://www.wpblockdocs.com/validator>) — a browser-only paste-and-validate tool. No API, no repo (site by "House of Giants," not open source), validation logic ships client-side in a JS bundle invisible to a scrape of the static page. **Diagnosis only — does not fix markup**, just returns errors/warnings/suggestions. Not usable from a CLI or agent pipeline. Ruled out this session.

## Recommended approach (not yet implemented — decision point for next session)

1. Convert HTML → block markup using `chubes4/html-to-blocks-converter` in package mode (`html_to_blocks_raw_handler()`), since it can run standalone without a live WordPress instance for the conversion step.
2. Validate the result before publishing, either:
   - a Node script calling `@wordpress/blocks`' `validateBlock()` directly, or
   - round-tripping through a disposable `wp-env` instance: insert via WP-CLI, read back with `parse_blocks()`, and diff.
3. Pre-clean source HTML to strip/wrap stray HTML comments per gutenberg#76526 before conversion, since none of the third-party converters are confirmed to handle that correctly.
4. Re-check `wordpress/agent-skills` PR #60 / issue #57 periodically — if merged, it likely supersedes steps 1–3 with a purpose-built, community-vetted skill including its own `validate-markup.mjs`.
5. Do not use `wpblockdocs.com/validator` for anything automated.

No code has been written yet this session — this was pure research/discovery via the Firecrawl developer index. Nothing in this repo (`firecrawl-cli`) currently references or implements any of this; this is net-new context for whatever WordPress content pipeline the user is building elsewhere.

## Suggested skills for the next agent

- **`firecrawl-developer-index`** — if further primary-source research is needed (e.g. verifying `Automattic/static-site-importer` and `wp-cli/block-command#11`, which were named but not independently verified this session; or re-checking whether `wordpress/agent-skills#60` has merged).
- **`research`** — if the next step is to formally investigate and write up a specific one of the open threads above (e.g. a deep-dive comparison of `chubes4/html-to-blocks-converter` vs `alleyinteractive/wp-block-converter` output fidelity) as a standalone repo artifact.
- **`prototype`** — if the next step is to sanity-check the recommended approach (steps 1–3 above) against real malformed HTML before committing to it as the pipeline design.
