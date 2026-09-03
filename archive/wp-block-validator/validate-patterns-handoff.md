# Handoff: WordPress block-markup validator

## Purpose

This handoff is self-contained for an agent or human who does not have access to the originating repository documentation. It explains and includes the current source of `tools/validate-patterns.php`, a WordPress-native structural validator for Full Site Editing (FSE) and Gutenberg block markup.

The validator answers:

> Can WordPress parse the selected patterns, template parts, page seeds, and stored page content as well-formed block markup without silently treating non-empty content as unparsed Classic HTML?

It is a structural gate, not a visual regression test. Passing does not prove correct CSS, layout, images, links, responsive behavior, accessibility, or editor appearance.

## Execution contract

The script must run after WordPress has been bootstrapped. It is intended for WP-CLI's `eval-file`, not a standalone PHP process.

Repository command on Windows WordPress Studio:

```text
studio.bat wp eval-file tools/validate-patterns.php
```

Equivalent command in a generic project:

```text
wp eval-file tools/validate-patterns.php
```

Prerequisites:

- WordPress is installed and the target theme is active.
- WP-CLI can bootstrap that installation.
- The script's configured filesystem paths exist.
- The WordPress version provides `parse_blocks()`, `serialize_blocks()`, and `WP_Block_Patterns_Registry`.

Exit behavior:

- `0`: no findings; a count summary is printed.
- `1`: one or more findings; one message per finding is written to STDERR.

The script is non-destructive. It does not edit theme files, seed files, templates, patterns, or database content.

## Complete current source

This is the complete source currently present in the repository. It is included here so the validator can be adapted without access to the original file.

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

## Algorithm and checks

### 1. Establish the active theme context

`wp_get_theme()` supplies the active theme's text domain. `get_stylesheet_directory()` supplies the active stylesheet directory. The script then derives:

- `patterns/*.php`
- `parts/*.html`
- `templates/*.html`
- two explicit seed files under `$pages_dir`

The active theme matters: checking a different theme directory can produce false confidence about the Site Editor.

### 2. Discover templates that render stored page content

Every theme template is read and matched against this expression:

```php
'/<!--\s*wp:post-content(?:\s|\/|>)/'
```

The resulting template filename set is used to decide which database pages have their `post_content` rendered by the template. The script treats an empty or `default` `_wp_page_template` value as `page.html`, and adds `.html` when metadata omits the extension.

This catches an FSE wiring problem: a page body may be valid Gutenberg markup but never appear if its template does not contain `wp:post-content`.

### 3. Validate registered patterns

For each `patterns/example.php`, the expected registered name is:

```text
<active-theme-text-domain>/example
```

The script calls `WP_Block_Patterns_Registry::get_registered()` and reports:

- `is not registered` when no matching runtime pattern exists;
- `has invalid content` when the registry does not return a string; or
- any structural markup findings from the shared helper.

Reading the registry is important because it validates the content WordPress knows at runtime, including pattern content loaded through the theme's registration process.

### 4. Validate template parts

Each `parts/*.html` file is read directly and passed to the shared helper. This checks the file itself, not a database override or rendered page.

### 5. Validate database pages

The script loads every `page` post, including every post status because it uses `'post_status' => 'any'`. It validates only pages assigned to a template known to contain `wp:post-content`.

For each applicable page it checks:

- stored `post_content` block structure;
- unparsed markup;
- parse/serialize stability; and
- unresolved `wp:pattern` references.

The database label has the form `<text-domain>/pages/<post-slug>`. This is a label, not a filesystem path.

### 6. Validate explicit seed files

The current file names are:

```text
language-english.html

```

They are not discovered automatically. The seed list must be updated when adding or moving seed files.

## Shared helper behavior

`mls_validate_block_markup()` applies these checks:

1. Empty or whitespace-only content produces `has no content`.
2. Any `<?` or `?>` produces `contains PHP tags`. Pattern PHP wrappers are allowed, but their registered output must contain block markup rather than PHP source.
3. `parse_blocks()` must return at least one block record, otherwise the result is `contains no blocks`.
4. `serialize_blocks( parse_blocks( $content ) )` must exactly equal the original string. A mismatch produces `fails parse/serialize round-trip`.
5. The nested parsed tree is walked. A record with `blockName === null` and non-empty `innerHTML` produces `contains unparsed markup`.

The null block-name check is the main protection against accidental Classic HTML. A document containing only `sdsdsd`, or raw HTML outside a block comment, can render in a browser but is not a fully formed Gutenberg document. Intentional raw HTML should be inside a `core/html` block.

## Finding-to-repair guide

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

## FSE/Gutenberg repair workflow

1. Run the validator and preserve the first failing label.
2. Map the label to its owner: pattern, template part, database page, or seed file.
3. For database pages, inspect both `_wp_page_template` and `post_content`. Fixing one does not automatically fix the other.
4. Reduce the markup to the smallest failing section.
5. Check matching opening/closing block comments, self-closing syntax, valid JSON attributes, reverse-order nesting, and block-compatible HTML.
6. Wrap all intended text or raw HTML in an appropriate block.
7. Re-save the section in the Block Editor when possible, then compare the serialized result with the source.
8. Re-run the validator.
9. Run the Site Editor browser regression test.
10. Visit the affected frontend route at desktop and mobile widths.

Useful structural rules:

```html
<!-- wp:paragraph -->
<p>Text belongs inside a block.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"section-intro"} -->
<p class="section-intro">Attributes are JSON.</p>
<!-- /wp:paragraph -->

<!-- wp:spacer {"height":"40px"} /-->
```

Use `core/html` for intentionally raw HTML:

```html
<!-- wp:html -->
<div class="intentional-custom-markup">...</div>
<!-- /wp:html -->
```

## Diagnostic WP-CLI snippets

These examples are read-only and do not save database changes.

Inspect a registered pattern:

```text
wp eval "$registry = WP_Block_Patterns_Registry::get_instance(); $pattern = $registry->get_registered('my-theme/pattern-name'); echo $pattern['content']; exit;"
```

In a PowerShell command where `$` expansion matters, escape the dollar signs or use a quoted script file.

Render a known block string:

```text
wp eval "echo do_blocks('<!-- wp:paragraph --><p>Check</p><!-- /wp:paragraph -->'); exit;"
```

Inspect a parsed tree:

```text
wp eval "$content = '<!-- wp:paragraph --><p>Check</p><!-- /wp:paragraph -->'; var_export(parse_blocks($content)); exit;"
```

Render one parsed block while isolating a runtime problem:

```text
wp eval "$blocks = parse_blocks('<your block markup>'); echo render_block($blocks[0]); exit;"
```

## WordPress APIs used and related capabilities

- `parse_blocks( string $content ): array` parses a complete content string into a nested block tree. Raw non-block content is represented with a null `blockName`.
- `serialize_blocks( array $blocks ): string` serializes parsed block records back into content markup.
- `WP_Block_Patterns_Registry::get_registered( string $name ): ?array` retrieves a runtime pattern's properties and resolved content.
- `do_blocks( string $content ): string` parses and renders dynamic blocks.
- `render_block( array $parsed_block ): string` renders one parsed block.
- `has_blocks( string|WP_Post $content ): bool` is a cheaper preliminary presence check, but does not replace full parsing and round-trip validation.

Official references:

- <https://developer.wordpress.org/reference/functions/parse_blocks/>
- <https://developer.wordpress.org/reference/functions/serialize_blocks/>
- <https://developer.wordpress.org/reference/classes/wp_block_patterns_registry/>
- <https://developer.wordpress.org/reference/functions/do_blocks/>

## Porting to another project

The current implementation is intentionally repository-specific. Before reusing it:

1. Replace the hard-coded `$pages_dir` and seed list with project configuration, or remove seed validation from the generic tool.
2. Keep pattern and part paths based on `get_stylesheet_directory()` so the active theme is tested.
3. Construct expected pattern names from the active theme text domain, unless the project has a different registration convention.
4. Decide whether all post statuses should be included or only published pages.
5. Decide whether unparsed top-level markup is always an error for the project.
6. Decide whether page content should forbid pattern references. This is a policy choice, not a universal Gutenberg rule.
7. Consider replacing the global function with a uniquely namespaced function or class if multiple tools load in one WP-CLI process.
8. Keep the structural validator non-destructive.
9. Add a separate runtime/visual layer for rendering, browser checks, accessibility, links, media, and responsive layout.

Potential deterministic extensions:

- verify every parsed block name is registered;
- render pattern content with `do_blocks()` and report rendering failures;
- identify unresolved dynamic blocks;
- validate selected internal links; and
- validate selected `theme.json` or template schemas.

These should be added carefully because plugins, user content, network resources, and dynamic rendering can make results environment-dependent.

## Current repository state

The source repository has also moved the ten HTML page seed files from the theme's `pages/` directory into `assets/pages/`. The current validator source above still points `$pages_dir` at the active theme's `pages/` directory, so its seed checks currently report missing `language-english.html` and `greek-for-foreigners.html`. The theme `pages/` directory is not required by WordPress.

The validator also reports a pre-existing database page whose stored content is raw `sdsdsd` under the `/news` slug. Do not overwrite or delete that database content without an explicit editorial decision.

The repository's expanded guide is `docs/pattern-validation.md`, but this handoff intentionally contains the operational content and complete source needed by a recipient without repository access.

## Verification state

- The handoff is saved outside the repository at `C:\Users\georg\AppData\Local\Temp\validate-patterns-handoff.md`.
- The expanded repository guide passed Markdown diagnostics and `git diff --check`.
- The Site Editor Playwright regression test previously passed once.
- The validator's latest known output contains the moved-seed path findings and the `/news` raw-content finding.

## Suggested skills

The next agent should call:

- `wp-block-themes` for FSE templates, template parts, patterns, and Site Editor behavior.
- `wp-wpcli-and-ops` for WP-CLI validation and content operations.
- `playwright-cli` for Site Editor and frontend verification.
- `writing-for-agents` when revising this handoff or other agent-facing documentation.
- `codebase-design` if extracting the validator into a reusable module or separating generic validation from project-specific policy.

## Recommended continuation

Read this handoff as the primary context. If the task is to make the repository green after the page move, update the seed path/configuration first, run the validator, and report the independent `/news` editorial finding separately. Preserve unrelated worktree changes and do not commit local database files.
