# Prior Art: Validating Gutenberg Block Markup Outside the Browser Editor

Research date: 2026-08-30. Compiled to inform a CLI tool that validates WordPress block markup
(`<!-- wp:... -->` comment-delimited `post_content`) before an AI coding agent writes it into a
WordPress site, in order to avoid the "This block contains unexpected or invalid content" editor
error.

---

## 1. Existing open-source validators (npm / GitHub / WP-CLI)

There is now real (if young) prior art — this space has moved fast in 2026. Nothing is bundled
into WP core or `@wordpress/scripts`, but several independent, working, open-source tools exist:

### humanmade/block-runner (npm: `block-runner`)

- GitHub: **humanmade/block-runner**, GPL-2.0-or-later, ~49 stars / 2 forks / 67 commits — active,
  real code, not a landing page. Published to npm as `block-runner@0.7.1` (`npm view block-runner`
  confirms a real published tarball, CLI bin, 3-week-old release via GitHub Actions/OIDC).
- CLI commands: `convert` (HTML → blocks), `assemble` (intent-tree JSON → blocks), `validate`
  (check markup against "headless Gutenberg"), `fix` (canonicalize near-miss markup), `context`
  (read site config), `skill` (agent integration guide). Library API: `import { canonicalize,
convert, validate } from 'block-runner'`.
- **Confirmed dependency list from npm registry** (`npm view block-runner dependencies`):
  `@wordpress/block-editor@15.23.0`, `@wordpress/block-library@10.1.0`, `@wordpress/blocks@15.23.0`,
  `commander@15.0.0`, `fast-glob@3.3.3`, **`jsdom@29.1.1`**, `wesper@0.0.2`. This is hard, primary
  confirmation that the "jsdom-shim the whole @wordpress stack" pattern is not just a rumor — it is
  exactly what the most mature known open-source tool in this space does today.
- Marketing site (accelerateplugin.com/block-runner) describes it as validating "against what each
  block's `save()` method outputs," verifying attribute schemas/class names/nesting, resolving
  images to media-library attachment IDs, and mapping styles to theme presets. Note: this appears
  to be a _different, newer, actually-open-source_ project than the earlier "Block Runner by Human
  Made" paid/closed offering referenced in prior research — same name, same GitHub org, but this
  repo is publicly readable GPL code with an npm package, which supersedes the "undisclosed
  internals" characterization for this specific tool.

### pluginslab/wp-blockmarkup-mcp

- An MCP server (not a generic CLI) exposing block-schema search/validation tools to AI coding
  assistants such as Claude Code. MIT licensed, ~38 stars, early-stage but active (11 commits, 3
  open issues).
- Indexes "121 core Gutenberg blocks" by parsing block source (Babel AST analysis of `save()`
  functions) into SQLite/FTS5, rather than running the real `@wordpress/block-library` at runtime.
- **Two-tier validation pipeline** (from README, per WebFetch summary): (1) structural validation
  using the official `@wordpress/block-serialization-default-parser` to check comment delimiters
  and JSON attribute parsing; (2) "save function pattern matching" — AST-derived expectations about
  wrapper elements/classes/styles, not a live re-render. Dynamic blocks (PHP-rendered, `save()`
  returns `null`) are validated on attributes only.
- This is architecturally interesting because it validates _without_ executing `@wordpress/blocks`,
  React, or jsdom at all — it pattern-matches against a pre-extracted schema instead of regenerating
  HTML live. Trade-off: it can drift from truth if a block's `save()` implementation changes and the
  index isn't regenerated, and it isn't a canonical WordPress-blessed check.

### ross-mulcahy/gutenberg-block-authoring-skill

- A Claude Code "skill" package (not a generic CLI) targeting WordPress 7.0 specifically. Ships a
  `validate-blocks.js` script plus curated reference examples for 50+ core blocks. GPL/MIT-style
  small repo, 12 stars, 2 commits — early/thin but demonstrates the same felt need.
- The validator checks _known common mistakes_ (mismatched delimiters, invalid JSON, invalid nested
  style-attribute paths like `style.typography.color`, missing required marker classes such as
  `has-custom-font-size`/`has-border-color`/`has-custom-css`, `align` misuse, and WP-7.0-specific
  `metadata.blockVisibility` issues) rather than doing a full save()-diff. This is a heuristic/lint
  layer, not the canonical algorithm.

### sedeg/guter-block

- Surfaced in search results; a smaller/older project with the same theme (name is a pun on
  "Gutenberg"). Not independently verified in depth here beyond appearing in the same search
  results cluster as the above; worth a closer look if building a comparison table, but did not
  warrant a full WebFetch given time budget and the stronger primary hits above.

### WP-CLI ecosystem

- No WP-CLI command or package does block-content validation. Checked `wp-cli/block-command`
  (official-adjacent WP-CLI package): it provides **read/management** commands only — block types,
  patterns, pattern categories, block styles, block bindings, block templates (FSE), and synced
  patterns (reusable blocks) listing/CRUD. **No validation, serialization-check, or content-analysis
  command exists in this package.**
- `wp-cli/scaffold-command`'s `wp scaffold block` only generates new block boilerplate (and is
  itself deprecated in favor of `@wordpress/create-block`); irrelevant to validating existing
  markup.
- No hits for a "wp ability validate"-style command that operates on post_content/block markup
  specifically; the closest namesake found (`wp ability validate`) validates arbitrary "ability"
  input schemas, unrelated to Gutenberg block content.
- **Conclusion for Q1: no core-blessed or WP-CLI-native validator exists.** The closest things to
  "prior art you could depend on" are `block-runner` (real jsdom+block-library approach, published
  to npm, actively maintained) and `wp-blockmarkup-mcp` (lighter AST/pattern-based approach, avoids
  jsdom entirely but sacrifices some fidelity). Both emerged in 2026 specifically to serve AI
  coding agents, corroborating that this is a recognized, recently-attacked problem rather than a
  solved one.

---

## 2. Community discussion: AI-generated block markup breaking the editor

This is now an actively-discussed, named problem in the WordPress ecosystem as of mid/late 2026,
with multiple independent solutions proposed along different axes (validate-before-write,
convert-server-side, and change-the-editor-itself).

### The problem, as framed by practitioners

- Brian Coords (briancoords.com, "Getting the Block Editor Ready for AI") and the Gutenberg Times
  write-up on Block Format Bridge both frame it the same way: "a Gutenberg post is a serialized
  tree structure that happens to be stored as HTML with JSON-carrying comment delimiters" — a
  format "never designed to be written by hand or by an AI inferring its way through a `save()`
  function it can't actually execute." This is the core diagnosis repeated across sources: the
  block editor's validity check requires knowing what a live `save()` render would produce, which
  an LLM cannot compute from first principles, only imitate statistically — hence drift on complex
  nested markup (confirmed independently by Nathan Onn's write-up: "Ask AI to generate a full
  pricing section with nested columns... the output starts to drift").
- The `WordPress/gutenberg` GitHub issue **#7604** ("Block Validation, Deprecation and Migration
  Experience") is the long-running core-team-side discussion of the _validation UX_ problem more
  generally (not AI-specific — it predates the AI-agent framing) but is directly relevant prior
  art: core contributors have long acknowledged that validation is "overly strict" in ways that
  create needless invalidation (e.g., insignificant class/id/attribute differences triggering the
  dialog) and have discussed phased fixes: distinguishing significance levels, threshold-based
  auto-overwrite, visual diffing before choosing Convert/Overwrite, and leaning on revision history
  for safer auto-correction. No final resolution has shipped from that issue as such; it functions
  as background context for _why_ validation is strict enough to break on things like AI drift.

### Three distinct proposed solutions found

1. **Validate-before-write, iteratively** (matches the task's own approach): Nathan Onn's
   `validate-block-markup` — an installable agent "skill" (`npx skills add nathanonn/agent-skills
--skill validate-block-markup`) that "makes WordPress core validation libraries available to AI
   during generation" so the agent can generate → validate → get specific errors → self-correct →
   revalidate before ever writing to the DB. This is essentially a packaging of the exact strategy
   this project is building, already shipped by at least one other author.
2. **Don't ask AI to write blocks at all — convert server-side.** **Block Format Bridge**, an
   open-source WordPress plugin by Chris Huber (Automattic), sidesteps validation entirely: the AI
   is instructed to emit Markdown or plain HTML, and the plugin converts that to blocks server-side
   using established PHP libraries (`html-to-blocks-converter`, `league/commonmark`,
   `league/html-to-markdown`), then runs `do_blocks()`. Exposes `bfd_convert()` and a REST API
   parameter to round-trip posts as Markdown for AI editing. Philosophy: "eliminate the need for AI
   to understand block format intricacies entirely" by moving the hard part into infrastructure.
   This is the "escape hatch" pattern generalized — instead of one Custom HTML block, a full
   format-bridge layer.
3. **Change the editor/format to reduce the surface for drift.** Make WordPress Core blog post
   (make.wordpress.org/core, 2026-07-23, "Editable blocks inside the Custom HTML block") describes
   a WordPress 7.1 feature explicitly framed around AI: block variations can now declare an
   `innerContent` field mixing static (locked/inert) HTML fragments with `null`-placeholder slots
   for editable inner blocks. The post states outright: "a model can generate one Custom HTML block
   mixing arbitrary markup with editable slots — no custom block, no build step — and the output is
   immediately safe to edit." This is WordPress core _itself_ responding to the AI-authoring
   problem by shrinking what needs to validate (only the slots, not the whole tree), using the
   long-standing Custom HTML (`core/html`) block as the literal escape hatch anticipated in the
   research brief.

### wp-cli vs REST API for writing block content

- No source found makes a strong technical case that `wp post create/update` and the REST API
  differ in _validation_ behavior for block content — both ultimately go through `wp_insert_post()`
  and neither validates block markup against `save()` on write; WordPress **only validates blocks
  when the post is subsequently opened in the block editor**, confirmed both by the WordPress.org
  support docs on the error and by Mihai's ("I shipped a WordPress CLI for AI coding agents")
  Medium retrospective, which notes agent-facing WordPress tools commonly hit "content that saves
  fine, then opens in the editor with invalid blocks or silently falls back to the classic editor" —
  i.e., **the write path is not where validation happens; the read/edit path is**, which is exactly
  why a separate pre-write validator (this project's premise) is necessary rather than relying on
  the API to reject bad markup.
- That same retrospective's practical lessons: (a) most real-world WordPress hosting lacks SSH/
  WP-CLI access, so REST-API-based tooling is the more portable default for agent CLIs; (b) a tool
  that "can only manipulate Gutenberg blocks and raw post_content is blind to where most real
  editing happens" (page builders, ACF, etc.) — a caution about scope, not a validation-technique
  finding.
- The official **WordPress/agent-skills** GitHub repo (github.com/WordPress/agent-skills) is a
  WordPress-org-hosted (not just community) set of AI-assistant skills ("Expert-level WordPress
  knowledge for AI coding assistants"), including `wp-block-development` and `wp-block-themes`
  skills. Notably, **neither shipped skill addresses pre-publication markup validation** — they
  teach correct authoring patterns (block.json, attributes, deprecations) but stop short of an
  actual validate-before-write tool, which is a gap this project's CLI would fill even relative to
  WordPress's own official agent-facing tooling as of this writing.

---

## 3. `wp-7.1` dist-tag status (checked 2026-08-30 against the live npm registry)

**`wp-7.1` does NOT exist yet as an npm dist-tag**, despite WordPress 7.1 having already been
**released on 2026-08-19** (per make.wordpress.org/core "WordPress 7.1 Release Day Process" and the
dedicated make.wordpress.org/core/7-1/ roadmap page — RC1 beta cycle started mid-July, RC3/RC4
landed Aug 12/17, final release Aug 19, timed to WordCamp US). As of this check (`npm view
@wordpress/blocks dist-tags --json` and same for `@wordpress/block-library`, `@wordpress/block-
serialization-default-parser`, `@wordpress/block-editor`, run directly against the live registry),
the **highest available `wp-X.Y` dist-tag for every one of these packages is still `wp-7.0`** — there
is an eleven-day lag (as of 2026-08-30) between the WP core release and npm's dist-tag update for
these Gutenberg packages. **Do not assume `wp-7.1` is resolvable; poll for it or fall back to
`wp-7.0` until it appears.**

Confirmed exact resolutions (`dist-tags` field from the registry JSON):

| Package                                         | `wp-7.0` → | `wp-6.9` → | `latest` → |
| ----------------------------------------------- | ---------- | ---------- | ---------- |
| `@wordpress/blocks`                             | `15.13.1`  | `15.6.3`   | `15.27.0`  |
| `@wordpress/block-library`                      | `9.40.2`   | `9.33.11`  | `10.5.0`   |
| `@wordpress/block-serialization-default-parser` | `5.40.1`   | `5.33.1`   | `5.54.0`   |
| `@wordpress/block-editor`                       | `15.13.2`  | —          | —          |

(`next` dist-tag was `16.0.1-next.v.202608281122.0` / `10.5.2-next...` at check time, i.e. a nightly
build two days old — trunk is already numerically past the eventual `wp-7.1` release version, as
expected, but that's the unstable trunk build, not a pinned 7.1 snapshot.)

**Practical implication for this project:** pin to `wp-7.0` today; treat `wp-7.1` as "coming soon,
check periodically" rather than "already available." When it does land, expect it to sit between
the current `wp-7.0` numbers and the current `next` prerelease numbers for each package.

---

## 4. Is there a simpler alternative to jsdom-shimming the whole stack?

Yes — **the actual WordPress validation algorithm is pure string/tokenizer logic with no DOM
dependency**, but reaching _that_ algorithm still requires generating "expected" HTML from a real
`save()` function, which is the part that pulls in React and (for full-fidelity, all-core-blocks
validation) `@wordpress/block-library`. The dependency cost is not uniform — it splits cleanly into
two levels of validation with very different costs. Concretely, from reading the Gutenberg source:

### Level 0/1 — Structural ("is this well-formed comment-delimited block markup?")

- Package: **`@wordpress/block-serialization-default-parser`**
  (`packages/block-serialization-default-parser/src/index.ts` on `WordPress/gutenberg` trunk).
- **Confirmed via `npm view`: this package has _zero_ runtime dependencies** (no `dependencies`
  field at all in its published package.json) — it is genuinely standalone, pure-JS, safe to
  `npm install` on its own with no transitive weight.
- Mechanism: a single regex identifies block delimiter comments —
  `<!--\s+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+({...})?...-->` — capturing an optional
  closing slash, optional namespace, block name, an optional JSON attribute blob, and an optional
  void/self-closing marker; attribute JSON is parsed via a guarded `parseJSON()` that returns
  `null` on invalid JSON rather than throwing. A stack-based state machine (`proceed()`) walks
  token-by-token through states `no-more-tokens` / `void-block` / `block-opener` / `block-closer`,
  pushing/popping "frames" to build nested `innerBlocks`, and accumulating raw HTML between tokens
  into `innerHTML` / `innerContent` (with `null` placeholders marking nested-block positions).
  Freeform (non-block) HTML between comments becomes a block object with `blockName: null`. Output
  shape per block: `{ blockName, attrs, innerBlocks, innerHTML, innerContent }`.
- **This alone answers: are delimiters balanced? Is the attribute JSON valid? Is nesting
  well-formed?** It says _nothing_ about whether the HTML inside a block matches what that block's
  `save()` function would currently produce — i.e., it cannot catch the actual "unexpected or
  invalid content" failure mode, only gross structural corruption (which is a real and useful but
  much weaker check).
- `packages/blocks/src/api/parser` builds on top of this (plus `@wordpress/blocks`'s own
  `parseWithAttributeSchema`/attribute-source matching against a registered block type's
  `attributes` schema from `block.json`) to turn raw parser output into fully-typed block objects
  with attributes extracted from both the JSON blob and HTML sources (`children`/`source: 'attribute'`
  etc. matchers). This step needs the block's **registered attribute schema** (i.e., `block.json`
  or an equivalent in-memory registration) but still not `save()`/React/DOM — schemas are plain JS
  objects with no rendering behavior. So a "does this parse into the attributes I expect" checker
  could plausibly run off nothing but block.json files, without `@wordpress/block-library`'s JS
  save-function code or React at all — this is a second useful, cheap level between 0/1 and 2.

### Level 2 — Full fidelity ("does the saved HTML match what save() currently generates?")

- Location: `packages/blocks/src/api/validation/index.ts` (main entry) plus
  `packages/blocks/src/api/serializer.tsx` (`getSaveElement()` / `getSaveContent()`).
- **The comparison algorithm itself is DOM-free.** `validateBlock()` calls `getSaveContent()` to
  regenerate "expected" HTML, then `isEquivalentHTML()` **tokenizes both strings using
  `simple-html-tokenizer`** (not a DOM parser) and compares token-by-token, ignoring insignificant
  differences: consecutive whitespace collapses via `getTextWithCollapsedWhitespace()` and pure-
  whitespace tokens are skipped; tag/attribute names compare case-insensitively; boolean attributes
  (e.g. `checked`, `disabled`) only need to be _present_, not value-equal; `class` is compared as an
  unordered set; `style` is parsed into a property map with normalized CSS numeric values (e.g.
  `.5` → `0.5`) via `getStyleProperties()` and `fast-deep-equal`; attribute _order_ is irrelevant
  because both sides are converted to lookup objects first. Its only real dependencies are
  `simple-html-tokenizer`, `@wordpress/html-entities`, `fast-deep-equal`, and `@wordpress/
deprecated` — **confirmed no React/DOM import in this file at all.**
- The expensive part is producing the "expected" side: `getSaveContent()` (in `serializer.tsx`,
  note the `.tsx` extension — it's JSX) calls `getSaveElement()`, which invokes the block type's
  registered `save()` implementation (handling both function and class-component save
  implementations, applying the `blocks.getSaveContent.extraProps` filter), producing a **React
  element tree**, which `getSaveContent()` then serializes to a string via **`renderToString`
  imported from `@wordpress/element`** — explicitly _not_ `react-dom/server`. `@wordpress/element`
  itself has almost no direct dependencies (`change-case`, `is-plain-object`, `@wordpress/
deprecated`, `@wordpress/escape-html` — confirmed via `npm view @wordpress/element dependencies`)
  but declares **`react` and `react-dom` as peer dependencies** (`^18 || ^19`, confirmed via
  `npm view @wordpress/element peerDependencies`), meaning its `renderToString` is a thin wrapper
  around React's own server-string-rendering — **pure synchronous string generation from a React
  element tree, requiring no jsdom, no browser DOM, and no `window` object.**
- **So why do real-world tools (block-runner) still bundle jsdom?** Not because the validation
  _algorithm_ needs it, but because `save()` functions live inside `@wordpress/block-library`
  alongside each block's `edit` component and `registerBlockType()` call, and there is no official,
  separately-importable "save-functions-only, no-edit-UI" entry point for the ~90+ core blocks.
  Importing `@wordpress/block-library` in bulk (its usual registration API,
  `registerCoreBlocks()`) pulls in editor-side code that, at minimum during module evaluation or
  first registration, expects browser globals (`matchMedia`, `ResizeObserver`, etc. — as documented
  broadly in the jsdom ecosystem, e.g. `jsdom doesn't support matchMedia yet and should be
polyfilled`) even though full validation never actually needs an interactive `edit()` to run.
  jsdom is therefore a workaround for **import-time coupling of edit+save in block-library's public
  API**, not a genuine requirement of the validation algorithm itself.

### Practical assessment / minimal dependency sets

| Validation level                                                                                     | What it catches                                                                                                                         | Minimal dependencies                                                                                                                                                                                                                                                                                                                                                                                                                                     | Needs jsdom/React/block-library?                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0 — Delimiter/structure**                                                                          | Unbalanced or malformed `<!-- wp:... -->` comments, invalid attribute JSON, malformed nesting                                           | `@wordpress/block-serialization-default-parser` only (zero transitive deps)                                                                                                                                                                                                                                                                                                                                                                              | No                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **1 — Attribute-schema match**                                                                       | Attributes present/typed per `block.json`, HTML-sourced attributes extractable                                                          | Level 0 + block.json files (or a hand-rolled equivalent of `packages/blocks/src/api/parser`'s attribute-matching, which itself needs only plain-object schema data, not save())                                                                                                                                                                                                                                                                          | No                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **2 — Full save()-fidelity** (the actual editor check, catches real "unexpected or invalid content") | Whether saved HTML byte-for-byte-modulo-normalization matches what `save()` would emit _right now_, for this exact WP/Gutenberg version | `@wordpress/blocks` (parser+serializer+validation: `simple-html-tokenizer`, `@wordpress/html-entities`, `fast-deep-equal`) + `@wordpress/element` (⇒ peer `react`/`react-dom`, string-rendering only) + **every core block's registered `save()`**, i.e. realistically all of `@wordpress/block-library` (or a hand-maintained subset of just the `save.js` files per block, decoupled from `edit.js` — not offered as an official import surface today) | React yes (server string-rendering only, no DOM); jsdom **not required by the algorithm**, only currently used as a blunt-instrument fix for block-library's import-time browser-global assumptions; a sufficiently surgical import (only each block's `save`/`block.json`, skip `edit`) could avoid jsdom entirely, but no official "save-only" package exists to do that today, which is exactly the gap block-runner's jsdom dependency papers over |

**Bottom line for question 4:** A standalone, dependency-light _structural_ linter (level 0/1) is
straightforward to reimplement or depend on directly (`@wordpress/block-serialization-default-
parser` is literally zero-dependency and MIT-equivalent-licensed) and would catch corruption /
malformed markup / bad JSON reliably. But it **cannot** catch the specific "unexpected or invalid
content" failure the task cares about, because that check is fundamentally "does this match
save() right now" — which requires knowing the true current output of every core block's `save()`,
and there is no maintained, dependency-light, save()-only artifact separate from `@wordpress/
block-library`. The tokenizer-based comparison itself (level 2's actual diff logic) is cheap and
DOM-free; the expense is entirely in _generating the expected side_, which today unavoidably means
either (a) pulling in real `@wordpress/block-library` + `@wordpress/element` + React (block-runner's
approach, currently shimmed with jsdom for import-time safety rather than genuine runtime DOM need),
or (b) maintaining your own out-of-band mirror of each core block's expected-HTML shape (wp-
blockmarkup-mcp's AST-extraction approach), which trades jsdom weight for staleness risk against
future Gutenberg block-library releases.

---

## 5. `tools/validate-patterns.php`: a WP-CLI-native, in-WordPress structural validator (reference design)

Relocated 2026-08-30 during wp-bv-5zs's triage from `.scratch/validate-patterns-handoff.md` (a
handoff document from a sibling project, describing a script that does not exist in this
repository and was not created here — see wp-bv-5zs for the full evaluation of whether this
approach is relevant to `wpbv`). Recorded here, per this file's existing role as this project's
durable home for validator prior art, so the content survives `.scratch/` cleanup (wp-bv-apf.4).
The original handoff also included repo-specific operational notes (a `/news` page's stray
content, a seed-file directory move, "next agent" instructions) that are specific to the
originating project and are intentionally not reproduced below — only the durable design/reference
material is kept.

### Purpose and execution contract

The script answers: "Can WordPress parse the selected patterns, template parts, page seeds, and
stored page content as well-formed block markup without silently treating non-empty content as
unparsed Classic HTML?" It is a structural gate only — passing proves nothing about CSS, layout,
images, links, responsive behavior, accessibility, or editor appearance.

It must run after WordPress has bootstrapped, via WP-CLI's `eval-file` (not a standalone PHP
process): `wp eval-file tools/validate-patterns.php`. Prerequisites: WordPress installed with the
target theme active, WP-CLI able to bootstrap that install, the script's hardcoded filesystem paths
present, and a WordPress version providing `parse_blocks()`, `serialize_blocks()`, and
`WP_Block_Patterns_Registry`. Exit `0` with a count summary on no findings; exit `1` with one
message per finding on STDERR otherwise. The script itself is non-destructive — it never edits
theme files, seeds, templates, patterns, or database content.

### Complete source (as handed off)

```php
<?php

defined( 'ABSPATH' ) || exit;

$theme       = wp_get_theme();
$theme_slug  = $theme->get( 'TextDomain' );
$patterns_dir = trailingslashit( get_stylesheet_directory() ) . 'patterns';
$parts_dir    = trailingslashit( get_stylesheet_directory() ) . 'parts';
$pages_dir    = trailingslashit( get_stylesheet_directory() ) . 'pages';
$templates_dir = trailingslashit( get_stylesheet_directory() ) . 'templates';
$registry    = WP_Block_Patterns_Registry::get_instance();
$errors      = array();
$pattern_files = glob( $patterns_dir . DIRECTORY_SEPARATOR . '*.php' );
$part_files    = glob( $parts_dir . DIRECTORY_SEPARATOR . '*.html' );
$template_files = glob( $templates_dir . DIRECTORY_SEPARATOR . '*.html' );
$seed_files    = array(
  $pages_dir . DIRECTORY_SEPARATOR . 'language-english.html',
  $pages_dir . DIRECTORY_SEPARATOR . 'greek-for-foreigners.html',
);
$post_content_templates = array();

foreach ( $template_files as $file ) {
  $content = file_get_contents( $file );

  if ( false !== $content && preg_match( '/<!--\s*wp:post-content(?:\s|\/|>)/', $content ) ) {
    $post_content_templates[ basename( $file ) ] = true;
  }
}

$pages = get_posts(
  array(
    'post_type'      => 'page',
    'post_status'    => 'any',
    'posts_per_page' => -1,
    'orderby'        => 'ID',
    'order'          => 'ASC',
  )
);

/**
 * Validate block markup loaded from a pattern registry entry or a theme file.
 */
function mls_validate_block_markup( string $label, string $content, array &$errors ): void {
  if ( '' === trim( $content ) ) {
    $errors[] = $label . ' has no content';
    return;
  }

  if ( false !== strpos( $content, '<?' ) || false !== strpos( $content, '?>' ) ) {
    $errors[] = $label . ' contains PHP tags';
  }

  $blocks = parse_blocks( $content );
  if ( empty( $blocks ) ) {
    $errors[] = $label . ' contains no blocks';
    return;
  }

  if ( serialize_blocks( $blocks ) !== $content ) {
    $errors[] = $label . ' fails parse/serialize round-trip';
  }

  $stack = $blocks;
  while ( $stack ) {
    $block = array_pop( $stack );
    if ( null === ( $block['blockName'] ?? null ) && '' !== trim( $block['innerHTML'] ?? '' ) ) {
      $errors[] = $label . ' contains unparsed markup';
      break;
    }
    if ( ! empty( $block['innerBlocks'] ) ) {
      $stack = array_merge( $stack, $block['innerBlocks'] );
    }
  }
}

foreach ( $pattern_files as $file ) {
  $slug    = $theme_slug . '/' . basename( $file, '.php' );
  $pattern = $registry->get_registered( $slug );

  if ( ! is_array( $pattern ) ) {
    $errors[] = $slug . ' is not registered';
    continue;
  }

  $content = $pattern['content'] ?? '';
  if ( ! is_string( $content ) ) {
    $errors[] = $slug . ' has invalid content';
    continue;
  }

  mls_validate_block_markup( $slug, $content, $errors );
}

foreach ( $part_files as $file ) {
  $label   = $theme_slug . '/parts/' . basename( $file );
  $content = file_get_contents( $file );

  if ( false === $content ) {
    $errors[] = $label . ' could not be read';
    continue;
  }

  mls_validate_block_markup( $label, $content, $errors );
}

foreach ( $pages as $page ) {
  $assigned_template = get_post_meta( $page->ID, '_wp_page_template', true );
  $template_file     = ( '' === $assigned_template || 'default' === $assigned_template )
    ? 'page.html'
    : basename( $assigned_template );
  if ( '.html' !== substr( $template_file, -5 ) ) {
    $template_file .= '.html';
  }
  $label = $theme_slug . '/pages/' . $page->post_name;

  if ( ! isset( $post_content_templates[ $template_file ] ) ) {
    $errors[] = $label . ' uses ' . $template_file . ' without wp:post-content';
    continue;
  }

  mls_validate_block_markup( $label, (string) $page->post_content, $errors );
  if ( false !== strpos( $page->post_content, '<!-- wp:pattern ' ) ) {
    $errors[] = $label . ' still contains pattern references';
  }
}

foreach ( $seed_files as $file ) {
  $label   = $theme_slug . '/pages/' . basename( $file );
  $content = file_get_contents( $file );

  if ( false === $content ) {
    $errors[] = $label . ' could not be read';
    continue;
  }

  mls_validate_block_markup( $label, $content, $errors );
  if ( false !== strpos( $content, '<!-- wp:pattern ' ) ) {
    $errors[] = $label . ' still contains pattern references';
  }
}

if ( $errors ) {
  fwrite( STDERR, implode( PHP_EOL, $errors ) . PHP_EOL );
  exit( 1 );
}

echo sprintf( 'Validated %d theme patterns, %d template parts, %d pages, and %d page seeds.' . PHP_EOL, count( $pattern_files ), count( $part_files ), count( $pages ), count( $seed_files ) );
```

### Algorithm and checks

1. **Establish active theme context** — `wp_get_theme()`'s text domain plus
   `get_stylesheet_directory()` locate `patterns/*.php`, `parts/*.html`, `templates/*.html`, and two
   hardcoded seed files under a `pages/` directory.
2. **Discover templates that render stored page content** — every `templates/*.html` file is
   regex-matched against `/<!--\s*wp:post-content(?:\s|\/|>)/`; the resulting filename set decides
   which database pages have their `post_content` actually rendered by their assigned template
   (empty/`default` `_wp_page_template` maps to `page.html`). Catches an FSE wiring problem: a page
   body can be valid Gutenberg markup and still never render if its template lacks `wp:post-content`.
3. **Validate registered patterns** — for each `patterns/example.php`, look up
   `<theme-text-domain>/example` via `WP_Block_Patterns_Registry::get_registered()`; report "is not
   registered", "has invalid content" (registry content not a string), or structural findings from
   the shared helper. This checks the runtime-registered content, not just the file on disk.
4. **Validate template parts** — each `parts/*.html` file is read directly and passed to the shared
   helper (file content, not a database override or rendered page).
5. **Validate database pages** — every `page` post of any status is loaded; only pages whose
   assigned template is known (step 2) to render `wp:post-content` are checked, for: stored
   `post_content` structure, unparsed markup, parse/serialize stability, and unresolved
   `wp:pattern` references.
6. **Validate explicit seed files** — two hardcoded filenames, not auto-discovered; must be updated
   by hand when seed files move.

### Shared helper (`mls_validate_block_markup()`) checks

1. Empty/whitespace-only content → `has no content`.
2. Any `<?` or `?>` in the content → `contains PHP tags` (leaked PHP source, as opposed to output).
3. `parse_blocks()` returns zero blocks → `contains no blocks`.
4. `serialize_blocks( parse_blocks( $content ) ) !== $content` → `fails parse/serialize round-trip`.
5. Any parsed node with `blockName === null` and non-empty `innerHTML` → `contains unparsed markup`
   (the main guard against accidental Classic HTML/raw text outside a recognized block; intentional
   raw HTML belongs in a `core/html` block).

### Finding-to-repair guide

| Finding | Meaning | Repair |
| --- | --- | --- |
| `is not registered` | A pattern file exists but the expected namespaced pattern is absent at runtime. | Check active theme, filename, text domain, and registration hook. |
| `has invalid content` | Pattern registry content is not a string. | Supply valid `content` or a readable pattern file during registration. |
| `has no content` | The source is empty. | Restore block output or remove the empty source. |
| `contains PHP tags` | PHP source leaked into the content being validated. | Keep PHP in the wrapper and output only block markup. |
| `contains no blocks` | No block records were parsed. | Add valid Gutenberg block comments or correct the source path. |
| `fails parse/serialize round-trip` | WordPress normalizes the source when parsing and serializing it. | Repair delimiters, JSON attributes, nesting, whitespace, or re-save through the Block Editor. |
| `contains unparsed markup` | Non-empty text or HTML exists outside recognized blocks. | Put text in `core/paragraph`; put intentional raw HTML in `core/html`. |
| `uses ... without wp:post-content` | The assigned FSE template does not render stored page content. | Add `<!-- wp:post-content /-->` or assign the correct template. |
| `still contains pattern references` | Stored page or seed content still depends on a reusable pattern. | Expand deliberately and save direct block markup if that is the project policy. |
| `could not be read` | A configured file is missing or unreadable. | Correct the path or restore the file. |

### WordPress APIs used

- `parse_blocks( string $content ): array` — parses a content string into a nested block tree; raw
  non-block content becomes a node with `blockName === null`.
- `serialize_blocks( array $blocks ): string` — serializes a parsed block tree back into markup.
- `WP_Block_Patterns_Registry::get_registered( string $name ): ?array` — retrieves a runtime
  pattern's properties and resolved content.
- `do_blocks( string $content ): string` — parses and renders dynamic blocks.
- `render_block( array $parsed_block ): string` — renders one parsed block.
- `has_blocks( string|WP_Post $content ): bool` — cheap presence check, not a substitute for full
  parsing/round-trip validation.

### Porting notes (from the handoff, condensed)

The implementation is intentionally repository-specific: hardcoded `$pages_dir`/seed list,
theme-text-domain-derived pattern names, `post_status => any`, and a policy decision (baked into
the script, not configurable) that unparsed top-level markup and lingering `wp:pattern` references
are always errors. Suggested deterministic extensions if ever generalized: verify every parsed
block name is registered; render pattern content with `do_blocks()` and report rendering failures;
identify unresolved dynamic blocks; validate selected internal links; validate `theme.json`/template
schemas. The handoff cautions that dynamic-rendering-based extensions (plugins, user content,
network resources) make results environment-dependent, so they should be added carefully.

See wp-bv-5zs for this project's own evaluation of whether this design is relevant to `wpbv`
(source-cited answers on `save()`-fidelity, the Portability axis, unit-of-work shape, and which of
the five shared-helper checks map to `wpbv`'s Finding codes).

---

## Sources

1. https://registry.npmjs.org/@wordpress/blocks (via `npm view @wordpress/blocks dist-tags/peerDependencies/dependencies --json`) — live npm registry dist-tags and dependency data for `@wordpress/blocks`; confirmed `wp-7.0` = 15.13.1, no `wp-7.1` tag as of 2026-08-30.
2. https://registry.npmjs.org/@wordpress/block-library (via `npm view`) — dist-tags for `@wordpress/block-library`; `wp-7.0` = 9.40.2, no `wp-7.1` tag.
3. https://registry.npmjs.org/@wordpress/block-serialization-default-parser (via `npm view`) — confirms zero declared runtime dependencies, dist-tags including `wp-7.0` = 5.40.1, no `wp-7.1`.
4. https://registry.npmjs.org/@wordpress/block-editor (via `npm view`) — `wp-7.0` = 15.13.2, cross-check of dist-tag lag.
5. https://registry.npmjs.org/@wordpress/element (via `npm view`) — dependencies (change-case, is-plain-object, @wordpress/deprecated, @wordpress/escape-html) and peerDependencies (react/react-dom `^18 || ^19`), confirming `renderToString` is a thin peer-dep wrapper, not DOM-based.
6. https://registry.npmjs.org/block-runner (via `npm view block-runner`) — confirms real published npm package `block-runner@0.7.1`, its bin, and its full dependency list including `jsdom@29.1.1`, `@wordpress/block-editor`, `@wordpress/block-library`, `@wordpress/blocks`.
7. https://github.com/humanmade/block-runner — repo overview: GPL-2.0-or-later, CLI commands (`convert`/`assemble`/`validate`/`fix`/`context`/`skill`), library API, ~49 stars, active.
8. https://www.accelerateplugin.com/block-runner/ — marketing description of Block Runner's validation approach (compares against `save()` output, attribute schema/class/nesting checks, media resolution, style mapping, benchmark scores).
9. https://github.com/pluginslab/wp-blockmarkup-mcp — MCP server for AI assistants; two-tier validation pipeline (official parser for structure, AST pattern-matching for save-function expectations); 121 indexed core blocks; MIT, early-stage.
10. https://github.com/ross-mulcahy/gutenberg-block-authoring-skill — Claude Code skill targeting WP 7.0 with a `validate-blocks.js` heuristic linter for common serialization mistakes.
11. https://github.com/WordPress/gutenberg/issues/7604 — "Block Validation, Deprecation and Migration Experience"; long-running core discussion of validation strictness/UX and proposed phased fixes (significance levels, thresholds, visual diffing, revision-aware auto-correction); unresolved.
12. https://make.wordpress.org/core/2026/07/23/editable-blocks-inside-the-custom-html-block/ — official Make WordPress Core post describing the WP 7.1 feature letting Custom HTML blocks mix static markup with editable slots, explicitly framed as helping AI-generated content stay validation-safe.
13. https://gutenbergtimes.com/block-format-bridge-a-practical-solution-for-ai-generated-content-in-wordpress/ — coverage of Chris Huber's (Automattic) Block Format Bridge plugin: converts AI-authored Markdown/HTML to blocks server-side via PHP libraries, sidestepping AI-authored block syntax entirely.
14. https://www.nathanonn.com/ai-html-to-wordpress-blocks/ — author's own account of building `validate-block-markup`, an agent skill that runs WordPress's validation libraries during AI generation in a generate/validate/fix loop; explicitly notes complex nested markup ("full pricing section with nested columns") is where AI output drifts.
15. https://medium.com/respira-love/i-shipped-a-wordpress-cli-for-ai-coding-agents-heres-what-146-days-of-building-taught-me-dab4de264078 — (fetched via search snippets; direct WebFetch returned HTTP 403/paywall) retrospective on building an agent-facing WordPress CLI; notes validation happens on read/edit not on write, hosting environments often lack WP-CLI/SSH access, and tools limited to raw block/post_content miss other builder formats.
16. https://github.com/WordPress/agent-skills — official WordPress.org-hosted repo of AI-assistant skills; contains `wp-block-development` and `wp-block-themes` skills, neither of which currently covers pre-publication block-markup validation.
17. https://github.com/wp-cli/block-command — official-adjacent WP-CLI package; confirmed to offer only listing/management commands (block types, patterns, styles, bindings, templates, synced patterns) with no validation/serialization-check functionality.
18. https://raw.githubusercontent.com/WordPress/gutenberg/trunk/packages/block-serialization-default-parser/src/index.ts — primary source for the comment-delimiter parser: regex-based tokenization, stack-based `proceed()` state machine, `parseJSON()` attribute extraction, output shape `{blockName, attrs, innerBlocks, innerHTML, innerContent}`.
19. https://raw.githubusercontent.com/WordPress/gutenberg/trunk/packages/blocks/src/api/serializer.tsx — primary source for `getSaveElement()`/`getSaveContent()`: invokes a block type's `save()`, produces a React element, serializes via `@wordpress/element`'s `renderToString` (not `react-dom/server` directly) — pure string generation, no DOM required.
20. (validation module) `packages/blocks/src/api/validation/index.ts` on `WordPress/gutenberg` trunk — primary source for `validateBlock()`/`isEquivalentHTML()`/`isEqualTagAttributePairs()`/`getStyleProperties()`: tokenizer-based (`simple-html-tokenizer`) comparison with whitespace collapsing, boolean-attribute presence-only checks, unordered class-set comparison, normalized style-property comparison; no React/DOM imports.
21. https://make.wordpress.org/core/2026/08/17/wordpress-7-1-release-day-process/ and https://make.wordpress.org/core/7-1/ and https://make.wordpress.org/core/2026/06/19/roadmap-to-7-1/ — confirm WordPress 7.1 released 2026-08-19 (RC cycle through mid-August, timed to WordCamp US), establishing the gap between WP core release and npm Gutenberg-package dist-tag availability noted above.
22. https://make.wordpress.org/core/2026/04/22/wordpress-7-0-release-party-updated-schedule/ — confirms WordPress 7.0 released 2026-05-20 (rescheduled from an original April 9 target), the baseline prior release used for dist-tag cross-checking.
