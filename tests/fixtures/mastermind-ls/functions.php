<?php
defined('ABSPATH') || exit;

require_once get_template_directory() . '/inc/language-page-patterns.php';
require_once get_template_directory() . '/inc/language-page-routes.php';

add_action('enqueue_block_assets', function () {
	wp_enqueue_style(
		'mastermind-ls-fonts',
		'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&family=Source+Sans+3:wght@400;500;700;900&family=Source+Serif+4:ital,wght@0,400;0,500;1,400&display=swap',
		[],
		null
	);
	wp_enqueue_style(
		'mastermind-ls-main',
		get_template_directory_uri() . '/assets/css/main.css',
		['mastermind-ls-fonts'],
		wp_get_theme()->get('Version')
	);
});

add_action('wp_footer', function () {
	echo '<script>
(function(){
	var els = document.querySelectorAll(".reveal");
	if (!els.length) return;
	var io = new IntersectionObserver(function(entries){
		entries.forEach(function(e){
			if(e.isIntersecting){
				e.target.classList.add("visible");
				io.unobserve(e.target);
			}
		});
	}, { threshold: 0.12 });
	els.forEach(function(el){ io.observe(el); });
	var h = document.querySelector(".site-header");
	var hWrap = document.querySelector(".wp-site-blocks > header");
	function onScroll(){ var s = window.scrollY > 10; if(h) h.classList.toggle("scrolled", s); if(hWrap) hWrap.classList.toggle("scrolled", s); }
	window.addEventListener("scroll", onScroll, { passive: true });
})();
</script>';
});

/**
 * Register page subtitle meta for block editor bindings.
 */
function mls_register_page_subtitle_meta(): void
{
	register_post_meta(
		'page',
		'page_subtitle',
		array(
			'default'      => '11 γλώσσες, επίσημες εξετάσεις, εξατομικευμένη διδασκαλία. Βρείτε τη γλώσσα που σας ταιριάζει.',
			'show_in_rest' => true,
			'single'       => true,
			'type'         => 'string',
			'auth_callback' => static function (): bool {
				return current_user_can('edit_pages');
			},
		)
	);
}
add_action('init', 'mls_register_page_subtitle_meta');

/**
 * Add stable hooks for language-detail page styling and integrations.
 *
 * @param string[] $classes Existing body classes.
 * @return string[]
 */
function mls_language_page_body_classes(array $classes): array
{
	if (is_page('greek-for-foreigners')) {
		$classes[] = 'language-page';
		$classes[] = 'language-page-greek-for-foreigners';
	}

	if (is_page('language-english')) {
		$classes[] = 'language-page';
		$classes[] = 'language-page-english';
	}

	$page              = get_queried_object();
	$language_page_ids = array('english', 'french', 'german', 'spanish', 'italian', 'russian', 'chinese', 'japanese', 'turkish', 'arabic');

	if ($page instanceof WP_Post && 'page' === $page->post_type && in_array($page->post_name, $language_page_ids, true)) {
		$parent = get_post($page->post_parent);

		if ($parent instanceof WP_Post && 'languages' === $parent->post_name) {
			$classes[] = 'language-page';
			$classes[] = 'language-page-' . sanitize_html_class($page->post_name);
		}
	}

	return $classes;
}
add_filter('body_class', 'mls_language_page_body_classes');
