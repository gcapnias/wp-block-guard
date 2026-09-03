<?php
require_once ABSPATH . 'wp-admin/includes/image.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
$url = get_template_directory_uri() . '/logo-base.png';
$id = media_sideload_image($url, 0, 'Mastermind LS horizontal logo', 'id');
echo $id;
