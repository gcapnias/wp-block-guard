<?php
/**
 * Create the pages required by the language detail templates.
 *
 * Existing page content is never overwritten. The migration runs once when
 * WordPress loads this version of the theme and may normalize targeted titles.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Read a theme-owned language page body.
 */
function mls_get_language_page_body_content( string $filename ): string {
	$path = get_template_directory() . '/pages/' . $filename;

	if ( ! is_readable( $path ) ) {
		return '';
	}

	$content = file_get_contents( $path );

	return is_string( $content ) ? $content : '';
}

/**
 * Normalize a targeted language page title without changing its content.
 */
function mls_maybe_update_language_page_title( WP_Post $page, string $title ): bool {
	if ( $title === $page->post_title ) {
		return true;
	}

	$result = wp_update_post(
		array(
			'ID'         => $page->ID,
			'post_title' => $title,
		),
		true
	);

	return ! is_wp_error( $result );
}

/**
 * Ensure the language detail routes exist.
 */
function mls_maybe_create_language_pages(): void {
	$schema_version = '4';

	if ( $schema_version === get_option( 'mls_european_language_pages_schema' ) ) {
		return;
	}

	$parent = get_page_by_path( 'languages', OBJECT, 'page' );

	if ( ! $parent instanceof WP_Post ) {
		return;
	}

	$pages = array(
		'english'  => 'English',
		'french'   => 'French',
		'german'   => 'German',
		'spanish'  => 'Spanish',
		'italian'  => 'Italian',
		'russian'  => 'Russian',
		'chinese'  => 'Chinese (Mandarin)',
		'japanese' => 'Japanese',
		'turkish'  => 'Turkish',
		'arabic'   => 'Arabic',
	);

	foreach ( $pages as $slug => $title ) {
		$existing_page = get_page_by_path( 'languages/' . $slug, OBJECT, 'page' );

		if ( $existing_page instanceof WP_Post ) {
			if ( ! mls_maybe_update_language_page_title( $existing_page, $title ) ) {
				return;
			}

			continue;
		}

		$result = wp_insert_post(
			array(
				'post_title'   => $title,
				'post_name'    => $slug,
				'post_parent'  => $parent->ID,
				'post_content' => 'english' === $slug ? mls_get_language_page_body_content( 'language-english.html' ) : '',
				'post_status'  => 'publish',
				'post_type'    => 'page',
			),
			true
		);

		if ( is_wp_error( $result ) ) {
			return;
		}
	}

	$greek_page = get_page_by_path( 'greek-for-foreigners', OBJECT, 'page' );

	if ( $greek_page instanceof WP_Post ) {
		if ( ! mls_maybe_update_language_page_title( $greek_page, 'Greek for Foreigners' ) ) {
			return;
		}
	} else {
		$result = wp_insert_post(
			array(
				'post_title'   => 'Greek for Foreigners',
				'post_name'    => 'greek-for-foreigners',
				'post_content' => mls_get_language_page_body_content( 'greek-for-foreigners.html' ),
				'post_status'  => 'publish',
				'post_type'    => 'page',
			),
			true
		);

		if ( is_wp_error( $result ) ) {
			return;
		}
	}

	update_option( 'mls_european_language_pages_schema', $schema_version );
}
add_action( 'init', 'mls_maybe_create_language_pages', 20 );
