<?php
/**
 * Reusable renderers and approved content for language detail page patterns.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Return approved language-page content.
 *
 * @param string $language Language route slug.
 * @return array<string, mixed>
 */
function mls_get_language_page_data( string $language ): array {
	$common_formats = array(
		array(
			'title' => 'Ομαδικά & Mini-groups',
			'text'  => 'Σταθερός ρυθμός μάθησης και συστηματική εξάσκηση προφορικού λόγου με συμμαθητές.',
		),
		array(
			'title' => 'Ιδιαίτερα 1-to-1',
			'text'  => 'Το μάθημα προσαρμόζεται στον στόχο, στο διαθέσιμο ωράριο και στις ανάγκες του μαθητή.',
		),
		array(
			'title' => 'Online ή δια ζώσης',
			'text'  => 'Επιλογή φοίτησης online ή στη σχολή στη Βάρη, σύμφωνα με το πρόγραμμα του μαθητή.',
		),
		array(
			'title' => 'Fast-Track / Exam Prep',
			'text'  => 'Στοχευμένη προετοιμασία με practice tests, διαχείριση χρόνου και οργανωμένο πλάνο μελέτης.',
		),
	);

	$languages = array(
		'greek-for-foreigners' => array(
			'greek_name'      => 'Ελληνικά',
			'english_name'    => 'Greek for Foreigners',
			'native_name'     => 'Ελληνικά',
			'intro'           => 'Build practical Greek for daily life and integration in Greece. Tell us your goals, current level and availability in English, and we will guide you towards a suitable learning path.',
			'words'           => array( 'Γεια σας', 'Hello', 'Καλημέρα', 'Welcome', 'Ευχαριστώ', 'Work', 'Σπουδές', 'Community', 'Καθημερινότητα', 'Greek' ),
			'filters'         => array(
				'Levels: A0–A1 · A2–B1 · B2+',
				'Goals: Daily life · Integration · Work · Study',
				'Formats: Group · Mini-group · 1-to-1 · Online or in person',
			),
			'levels'          => array(
				array( 'level' => 'A0–A1', 'title' => 'Survival Greek', 'meta' => 'Essential speaking and listening for transport, shopping, appointments, introductions and polite everyday exchanges.' ),
				array( 'level' => 'A2–B1', 'title' => 'Everyday & Work', 'meta' => 'Broader vocabulary, clearer pronunciation and practical spoken and written communication for work and community life.' ),
				array( 'level' => 'B2+', 'title' => 'Academic & Professional Greek', 'meta' => 'Structured speaking and writing for presentations, reading, professional correspondence and study-related communication.' ),
				array( 'level' => 'A1–C2', 'title' => 'Certificate preparation', 'meta' => 'Preparation for the Certificate of Attainment in Greek, matched to your starting point and target level.' ),
			),
			'benefits'        => array(
				array( 'title' => 'Daily life & integration', 'text' => 'Handle common errands and appointments, join everyday conversations with more confidence and understand useful language for local routines.' ),
				array( 'title' => 'Work & community', 'text' => 'Communicate more clearly with colleagues and customers, build workplace vocabulary and take part more comfortably in community life.' ),
				array( 'title' => 'Study & long-term goals', 'text' => 'Develop reading and structured writing, prepare for academic communication and plan a recognised certification goal.' ),
			),
			'audiences'       => array(
				array( 'title' => 'New arrivals & families', 'tagline' => 'Essential Greek for settling in', 'text' => 'Build useful language for transport, shopping, appointments, introductions and everyday family routines.' ),
				array( 'title' => 'Professionals', 'tagline' => 'Work and social integration', 'text' => 'Develop practical speaking and writing for colleagues, customers, workplace routines and community life.' ),
				array( 'title' => 'Students & residents', 'tagline' => 'Study and long-term use', 'text' => 'Strengthen reading, writing and spoken communication for academic, professional and everyday needs in Greece.' ),
				array( 'title' => 'Certificate candidates', 'tagline' => 'Certificate of Attainment in Greek', 'text' => 'Prepare for the official Certificate of Attainment in Greek from A1 to C2 with a path based on your current level.' ),
			),
			'placement_items' => array(
				'Current speaking, listening, reading and writing',
				'Daily-life, work, integration, study or certificate goals',
				'Preferred format and realistic weekly availability',
			),
			'formats'         => array(
				array( 'title' => 'Group or mini-group', 'text' => 'Practise useful conversations with other learners and follow a shared path for the same course level.' ),
				array( 'title' => 'One-to-one', 'text' => 'Focus on your own communication priorities and discuss a more flexible lesson arrangement.' ),
				array( 'title' => 'Online, in person or blended', 'text' => 'Ask about current online, school-based or blended availability for your level.' ),
				array( 'title' => 'Schedule guidance', 'text' => 'Share work shifts and family commitments, then confirm current morning, daytime or evening options before enrolling.' ),
			),
			'exams'           => array(
				array( 'name' => 'Certificate of Attainment in Greek (A1–C2)', 'text' => 'Targeted preparation for the official certificate, including mock tests, timed practice, exam strategies and individual feedback.' ),
				array( 'name' => 'Registration guidance', 'text' => 'Guidance is available for the registration process, the appropriate level and selecting an exam date.' ),
			),
			'outcomes'        => array(
				'Use Greek with more confidence for daily tasks, appointments and community participation.',
				'Communicate more clearly for work, study and professional correspondence.',
				'Follow a structured preparation path towards the Certificate of Attainment in Greek at the appropriate level.',
			),
			'faqs'            => array(
				array( 'question' => 'Can I contact the school in English?', 'answer' => 'Yes. You can explain your goals, current Greek and availability in English when you make your inquiry.' ),
				array( 'question' => 'Can I start if I do not speak Greek yet?', 'answer' => 'Yes. The A0–A1 Survival Greek path covers essential language for first everyday interactions. Placement guidance confirms the right starting point.' ),
				array( 'question' => 'Are online and in-person lessons available?', 'answer' => 'Online, in-person at MLS Vari and blended study formats may be available. Ask which current option suits your level and schedule.' ),
				array( 'question' => 'How can lessons fit around shift work or family commitments?', 'answer' => 'Share your realistic weekly availability during your first conversation. The school can then guide you through current morning, daytime or evening options and the most suitable format.' ),
				array( 'question' => 'Do you prepare learners for the Certificate of Attainment in Greek?', 'answer' => 'Yes. Preparation can cover levels A1–C2 with mock tests, timed practice, exam strategies and individual feedback based on your starting point.' ),
				array( 'question' => 'Does the school provide visa or legal advice?', 'answer' => 'No. The Greek program provides language learning and course guidance, not immigration or legal services.' ),
			),
			'copy'             => array(
				'hero_subtitle'       => 'Greek for everyday life, work and study',
				'hero_primary_cta'    => 'Book placement guidance',
				'hero_secondary_cta'  => 'Contact us in English',
				'levels_label'        => 'Levels and learning paths',
				'levels_heading'      => 'Find the Greek course level that matches your goal',
				'levels_intro'        => 'Your starting point is confirmed through placement guidance. The paths below cover first contact with Greek through confident academic or professional use.',
				'level_cta'           => 'Ask about this level ›',
				'benefits_label'      => 'Built around your life in Greece',
				'benefits_heading'    => 'Practical goals, clear English support',
				'benefits_intro'      => 'This page and your first conversation are available in English, so you can explain what you need before your Greek lessons begin.',
				'audience_label'      => 'Who it is for',
				'audience_heading'    => 'Greek learning paths for life, work, study and certification',
				'placement_label'     => 'Placement and schedule guidance',
				'placement_heading'   => 'Start with a plan that fits your current Greek and your week',
				'placement_text'      => 'Tell us in English what you can already do in Greek, why you want to learn and when you are normally available. We will guide you towards an appropriate level, study format and current timetable options.',
				'placement_list_title' => 'Your starting conversation',
				'placement_cta'       => 'Book placement guidance ›',
				'formats_label'       => 'Flexible study formats',
				'formats_heading'     => 'Choose a format that works around work and family',
				'formats_intro'       => 'Group, mini-group and one-to-one learning may be available online, in person at MLS Vari or in a blended format. Contact the school for the current options at your level.',
				'format_cta'          => 'Ask about formats and schedules ›',
				'exams_label'         => 'Exam pathways & outcomes',
				'exams_heading'       => 'Prepare for the Certificate of Attainment in Greek',
				'exam_cta'            => 'Ask about certificate preparation ›',
				'faq_label'           => 'Frequently asked questions',
				'faq_heading'         => 'Before you start Greek lessons',
				'cta_heading'         => 'Ready to find your Greek learning path?',
				'cta_text'            => 'Contact Mastermind Language School in English. Share your goals and schedule, and ask for placement guidance and current course availability.',
				'cta_primary'         => 'Book placement guidance',
				'cta_secondary'       => 'Contact us in English',
			),
		),
		'french'  => array(
			'greek_name'   => 'Γαλλικά',
			'english_name' => 'French',
			'native_name'  => 'Français',
			'intro'        => 'Γαλλικά για παιδιά, εφήβους και ενήλικες, από τα πρώτα βήματα μέχρι σπουδές, εργασία και προετοιμασία DELF, DALF, TCF ή TEF.',
			'words'        => array( 'Bonjour', 'Français', 'Merci', 'DELF', 'DALF', 'Voyage', 'Études', 'Travail', 'Parler', 'Écouter' ),
			'filters'      => array(
				'Μορφή: Ομαδικά · Mini-groups · 1-to-1 · Online ή δια ζώσης',
				'Στόχος: Γενικά Γαλλικά · Εργασία/Σπουδές · DELF/DALF · TCF/TEF',
				'Ρυθμός: Κανονικό · Fast-Track · Θερινό εντατικό',
			),
			'levels'       => array(
				array( 'level' => 'A1.1', 'title' => 'Πρώτα βήματα', 'meta' => '2 ώρες την εβδομάδα · Cours Préparatoire / αρχάριοι' ),
				array( 'level' => 'A1.2', 'title' => 'Βασική επικοινωνία', 'meta' => '2 ώρες την εβδομάδα · ανάπτυξη προφορικού λόγου' ),
				array( 'level' => 'A2', 'title' => 'Καθημερινή χρήση', 'meta' => '2,5 ώρες την εβδομάδα · λεξιλόγιο και γραμματική' ),
				array( 'level' => 'B1 — B2', 'title' => 'Ανεξάρτητη χρήση', 'meta' => '2,5 ώρες την εβδομάδα ανά επίπεδο · πορεία προς εξετάσεις' ),
			),
			'benefits'     => array(
				'Επικοινωνιακή διδασκαλία με σενάρια για καθημερινότητα, ταξίδια, σπουδές και εργασία.',
				'Για τα παιδιά, παιχνίδια, τραγούδια και ομαδικές δραστηριότητες κάνουν τη γλώσσα φυσικό μέρος του μαθήματος.',
				'Η χρήση των Γαλλικών ξεκινά από το εισαγωγικό επίπεδο Cours Préparatoire / A1.',
			),
			'audiences'    => array(
				array( 'title' => 'Παιδιά & Έφηβοι', 'tagline' => 'Βάσεις και σωστή προφορά', 'text' => 'Σταδιακή πορεία από το εισαγωγικό επίπεδο προς B1/B2, με δραστηριότητες προσαρμοσμένες στην ηλικία.' ),
				array( 'title' => 'Ενήλικες', 'tagline' => 'Καθημερινότητα και εργασία', 'text' => 'Εξάσκηση στην επικοινωνία για ταξίδια, επαγγελματικές ανάγκες και προσωπικούς στόχους.' ),
				array( 'title' => 'Φοιτητές & Επαγγελματίες', 'tagline' => 'Σπουδές και επαγγελματική χρήση', 'text' => 'Ακαδημαϊκή γραφή, παρουσιάσεις και επαγγελματική αλληλογραφία σύμφωνα με τον στόχο.' ),
				array( 'title' => 'Υποψήφιοι Εξετάσεων', 'tagline' => 'DELF · DALF · TCF · TEF', 'text' => 'Οργανωμένη προετοιμασία για τον κατάλληλο εξεταστικό δρόμο και το επιθυμητό επίπεδο.' ),
			),
			'exams'        => array(
				array( 'name' => 'DELF', 'text' => 'Διαδρομή πιστοποίησης για επίπεδα A1 έως B2.' ),
				array( 'name' => 'DALF', 'text' => 'Προετοιμασία για προχωρημένους στόχους C1 και C2.' ),
				array( 'name' => 'TCF / TEF', 'text' => 'Στοχευμένη προετοιμασία όταν ο στόχος απαιτεί αξιολόγηση γλωσσικού επιπέδου.' ),
			),
			'outcomes'     => array(
				'Μεγαλύτερη άνεση σε speaking και listening μέσα από στοχευμένες ασκήσεις.',
				'Σταθερή ανάπτυξη λεξιλογίου και γραμματικής για καθημερινή, ακαδημαϊκή ή επαγγελματική χρήση.',
				'Σαφής πορεία προς τον επόμενο στόχο CEFR και την κατάλληλη εξέταση.',
			),
			'faqs'         => array(
				array( 'question' => 'Υπάρχει online φοίτηση;', 'answer' => 'Ναι. Το πρόγραμμα μπορεί να οργανωθεί online ή δια ζώσης, ανάλογα με το τμήμα και το ωράριο.' ),
				array( 'question' => 'Κάνετε προετοιμασία για DELF και DALF;', 'answer' => 'Ναι. Η προετοιμασία οργανώνεται σύμφωνα με το επίπεδο και τον εξεταστικό στόχο, με εξάσκηση στη μορφή της εξέτασης.' ),
				array( 'question' => 'Μπορεί να ξεκινήσει ένα παιδί χωρίς προηγούμενη γνώση;', 'answer' => 'Ναι. Η εισαγωγική πορεία ξεκινά από Cours Préparatoire / A1 και προσαρμόζεται στην ηλικία και στις ανάγκες του παιδιού.' ),
			),
		),
		'german'  => array(
			'greek_name'   => 'Γερμανικά',
			'english_name' => 'German',
			'native_name'  => 'Deutsch',
			'intro'        => 'Γερμανικά για παιδιά, εφήβους και ενήλικες, με στόχους καθημερινής επικοινωνίας, εργασίας, σπουδών και προετοιμασίας Goethe ή ÖSD.',
			'words'        => array( 'Hallo', 'Deutsch', 'Danke', 'Goethe', 'ÖSD', 'Studium', 'Arbeit', 'Sprechen', 'Hören', 'Lernen' ),
			'filters'      => array(
				'Μορφή: Ομαδικά · Mini-groups · 1-to-1 · Online ή δια ζώσης',
				'Στόχος: Γενικά Γερμανικά · Εργασία/Σπουδές · Goethe/ÖSD',
				'Ρυθμός: Κανονικό · Fast-Track · Θερινό εντατικό',
			),
			'levels'       => array(
				array( 'level' => 'A1.1', 'title' => 'Εισαγωγικό επίπεδο', 'meta' => '2 ώρες την εβδομάδα · πρώτη επαφή με τη γλώσσα' ),
				array( 'level' => 'A1.2', 'title' => 'Βασική επικοινωνία', 'meta' => '2 ώρες την εβδομάδα · σταθεροποίηση των βάσεων' ),
				array( 'level' => 'A2', 'title' => 'Καθημερινή χρήση', 'meta' => '2,5 ώρες την εβδομάδα · πρακτικό λεξιλόγιο' ),
				array( 'level' => 'B1 — B2', 'title' => 'Εργασία & Σπουδές', 'meta' => '2,5 ώρες την εβδομάδα ανά επίπεδο · συνέχεια προς C1' ),
			),
			'benefits'     => array(
				'Δομημένη διδασκαλία που βοηθά τον μαθητή να κατανοήσει τη λογική της γλώσσας.',
				'Ψηφιακά εργαλεία, διαδραστικά παιχνίδια και στοχευμένες δραστηριότητες ενισχύουν την επικοινωνία.',
				'Η χρήση των Γερμανικών ξεκινά από το A1, με ύλη προσαρμοσμένη στην ηλικία και στον στόχο.',
			),
			'audiences'    => array(
				array( 'title' => 'Παιδιά & Έφηβοι', 'tagline' => 'Σταθερές βάσεις', 'text' => 'Δομημένη ύλη, προσαρμοσμένη στην ηλικία, με προοδευτική πορεία προς B1/B2.' ),
				array( 'title' => 'Ενήλικες', 'tagline' => 'Επικοινωνία και μετεγκατάσταση', 'text' => 'Πρακτική χρήση της γλώσσας για καθημερινότητα, εργασία, σπουδές ή μετεγκατάσταση.' ),
				array( 'title' => 'Επαγγελματίες', 'tagline' => 'Γερμανικά για εργασία', 'text' => 'Εξάσκηση για συνεντεύξεις, email, παρουσιάσεις, συναντήσεις και επαγγελματικές συνθήκες.' ),
				array( 'title' => 'Υποψήφιοι Εξετάσεων', 'tagline' => 'Goethe · ÖSD', 'text' => 'Προετοιμασία προσαρμοσμένη στον φορέα, στο επίπεδο και στον ακαδημαϊκό ή επαγγελματικό στόχο.' ),
			),
			'exams'        => array(
				array( 'name' => 'Goethe / ÖSD', 'text' => 'Προετοιμασία για πιστοποιήσεις από τους επίσημους φορείς που αναφέρονται στο πρόγραμμα της σχολής.' ),
				array( 'name' => 'Editorial approval required', 'text' => 'Η διαθεσιμότητα προετοιμασίας TestDaF ή telc εκκρεμεί σε editorial approval λόγω ασυμφωνίας των εγκεκριμένων πηγών και δεν παρουσιάζεται ως διαθέσιμη μέχρι να επιβεβαιωθεί.' ),
			),
			'outcomes'     => array(
				'Άνεση στην καθημερινή επικοινωνία και σε πρακτικά σενάρια εργασίας ή σπουδών.',
				'Συστηματική ανάπτυξη speaking, listening, reading και writing.',
				'Σαφής πορεία από A1 προς B1/B2 και, όπου χρειάζεται, προς C1 ή εξεταστικό στόχο.',
			),
			'faqs'         => array(
				array( 'question' => 'Είναι τα Γερμανικά κατάλληλα για στόχο εργασίας ή μετεγκατάστασης;', 'answer' => 'Ναι. Το πρόγραμμα μπορεί να εστιάσει στην καθημερινή και επαγγελματική επικοινωνία, με επίπεδο και λεξιλόγιο προσαρμοσμένα στον στόχο.' ),
				array( 'question' => 'Προετοιμάζετε για Goethe και ÖSD;', 'answer' => 'Ναι. Οι πιστοποιήσεις Goethe και ÖSD είναι οι εξεταστικές διαδρομές που τεκμηριώνονται από το εγκεκριμένο πρόγραμμα της σχολής.' ),
				array( 'question' => 'Πόσος είναι ο εβδομαδιαίος χρόνος διδασκαλίας;', 'answer' => 'Τα A1.1 και A1.2 αντιστοιχούν σε 2 ώρες την εβδομάδα, ενώ τα A2, B1 και B2 σε 2,5 ώρες την εβδομάδα.' ),
			),
		),
		'spanish' => array(
			'greek_name'   => 'Ισπανικά',
			'english_name' => 'Spanish',
			'native_name'  => 'Español',
			'intro'        => 'Ισπανικά για παιδιά, εφήβους και ενήλικες, για ταξίδια, εργασία, σπουδές και προετοιμασία DELE ή SIELE.',
			'words'        => array( 'Hola', 'Español', 'Gracias', 'DELE', 'SIELE', 'Viajes', 'Trabajo', 'Estudios', 'Hablar', 'Escuchar' ),
			'filters'      => array(
				'Μορφή: Ομαδικά · Mini-groups · 1-to-1 · Online ή δια ζώσης',
				'Στόχος: Γενικά Ισπανικά · Ταξίδια/Εργασία · DELE · SIELE',
				'Ρυθμός: Κανονικό · Fast-Track · Θερινό εντατικό',
			),
			'levels'       => array(
				array( 'level' => 'A1', 'title' => 'Inicial', 'meta' => '2 ώρες την εβδομάδα · αρχάριοι και Pre-A1 αφετηρία' ),
				array( 'level' => 'A2 — B1', 'title' => 'Καθημερινή επικοινωνία', 'meta' => '2 ώρες την εβδομάδα ανά επίπεδο' ),
				array( 'level' => 'B2 — C1', 'title' => 'Ανεξάρτητη χρήση', 'meta' => '2,5 ώρες την εβδομάδα ανά επίπεδο' ),
				array( 'level' => 'C2', 'title' => 'Προχωρημένη επάρκεια', 'meta' => '3 ώρες την εβδομάδα · σύνθετη χρήση και εξετάσεις' ),
			),
			'benefits'     => array(
				'Επικοινωνιακή προσέγγιση με πραγματικά σενάρια για ταξίδια, σπουδές, εργασία και εξυπηρέτηση.',
				'Για τα παιδιά, τραγούδια, χειροτεχνίες και διαδραστικά παιχνίδια υποστηρίζουν τη φυσική εξοικείωση.',
				'Η προφορική χρήση ξεκινά από το εισαγωγικό επίπεδο Pre-A1 / Inicial.',
			),
			'audiences'    => array(
				array( 'title' => 'Παιδιά & Έφηβοι', 'tagline' => 'Προφορά και πολιτισμός', 'text' => 'Βάσεις στην επικοινωνία μέσα από δραστηριότητες και επαφή με τον ισπανόφωνο κόσμο.' ),
				array( 'title' => 'Ενήλικες', 'tagline' => 'Ταξίδια και καθημερινότητα', 'text' => 'Speaking confidence για ταξίδια, προσωπική ανάπτυξη και καθημερινή ή επαγγελματική χρήση.' ),
				array( 'title' => 'Τουρισμός & Εστίαση', 'tagline' => 'Επαγγελματικά σενάρια', 'text' => 'Λεξιλόγιο και επικοινωνιακές ασκήσεις για φιλοξενία, service και εξυπηρέτηση πελατών.' ),
				array( 'title' => 'Υποψήφιοι Εξετάσεων', 'tagline' => 'DELE · SIELE', 'text' => 'Στοχευμένη προετοιμασία για DELE A1–C2 ή SIELE, σύμφωνα με τον επιθυμητό στόχο.' ),
			),
			'exams'        => array(
				array( 'name' => 'DELE A1–B2', 'text' => 'Προετοιμασία ανά επίπεδο για βασική έως ανεξάρτητη χρήση της γλώσσας.' ),
				array( 'name' => 'DELE C1–C2', 'text' => 'Στοχευμένη εξάσκηση για προχωρημένη γλωσσική επάρκεια.' ),
				array( 'name' => 'SIELE', 'text' => 'Προετοιμασία για αξιολόγηση των επιμέρους γλωσσικών δεξιοτήτων.' ),
			),
			'outcomes'     => array(
				'Μεγαλύτερη ευχέρεια σε speaking και listening για ταξίδια και καθημερινή επικοινωνία.',
				'Λεξιλόγιο για φιλοξενία, εργασία και εξυπηρέτηση, με προσοχή στον ρυθμό και στον τονισμό.',
				'Συνεπής πορεία από A1 έως C2 και προετοιμασία για DELE ή SIELE όπου απαιτείται.',
			),
			'faqs'         => array(
				array( 'question' => 'Είναι τα Ισπανικά κατάλληλα για αρχάριους;', 'answer' => 'Ναι. Η αφετηρία είναι το Pre-A1 / Inicial και η πορεία συνεχίζει στα επίπεδα A1 έως C2.' ),
				array( 'question' => 'Διδάσκετε ευρωπαϊκά ή λατινοαμερικανικά Ισπανικά;', 'answer' => 'Το ύφος και η προφορά προσαρμόζονται στις ανάγκες του μαθητή, με επαφή τόσο με την Ισπανία όσο και με τη Λατινική Αμερική.' ),
				array( 'question' => 'Κάνετε προετοιμασία για DELE ή SIELE;', 'answer' => 'Ναι. Η προετοιμασία οργανώνεται σύμφωνα με την εξέταση, το επίπεδο και τις δεξιότητες που χρειάζεται να αναπτύξει ο μαθητής.' ),
			),
		),
		'italian' => array(
			'greek_name'   => 'Ιταλικά',
			'english_name' => 'Italian',
			'native_name'  => 'Italiano',
			'intro'        => 'Ιταλικά για παιδιά, εφήβους και ενήλικες, για ταξίδια, εργασία, σπουδές, πολιτισμό και προετοιμασία CELI, CILS ή PLIDA.',
			'words'        => array( 'Ciao', 'Italiano', 'Grazie', 'CELI', 'CILS', 'PLIDA', 'Viaggi', 'Lavoro', 'Studiare', 'Parlare' ),
			'filters'      => array(
				'Μορφή: Ομαδικά · Mini-groups · 1-to-1 · Online ή δια ζώσης',
				'Στόχος: Γενικά Ιταλικά · Ταξίδια/Εργασία · CELI/CILS · PLIDA',
				'Ρυθμός: Κανονικό · Fast-Track · Θερινό εντατικό',
			),
			'levels'       => array(
				array( 'level' => 'A1', 'title' => 'Principianti', 'meta' => '2 ώρες την εβδομάδα · αρχάριοι και Pre-A1 αφετηρία' ),
				array( 'level' => 'A2 — B1', 'title' => 'Καθημερινή επικοινωνία', 'meta' => '2 ώρες την εβδομάδα ανά επίπεδο' ),
				array( 'level' => 'B2 — C1', 'title' => 'Ανεξάρτητη χρήση', 'meta' => '2,5 ώρες την εβδομάδα ανά επίπεδο' ),
				array( 'level' => 'C2', 'title' => 'Προχωρημένη επάρκεια', 'meta' => '3 ώρες την εβδομάδα · σύνθετη χρήση και εξετάσεις' ),
			),
			'benefits'     => array(
				'Επικοινωνιακή διδασκαλία για ταξίδια, καθημερινότητα, σπουδές και επαγγελματικές ανάγκες.',
				'Για τα παιδιά, τραγούδια, θεατρικά σκετς και διαδραστικές δραστηριότητες κάνουν τη γλώσσα βίωμα.',
				'Η προφορική χρήση ξεκινά από το εισαγωγικό επίπεδο Pre-A1 / Principianti.',
			),
			'audiences'    => array(
				array( 'title' => 'Παιδιά & Έφηβοι', 'tagline' => 'Γλώσσα και πολιτισμός', 'text' => 'Σταθερές βάσεις, σωστή προφορά και εξοικείωση με τον ιταλικό πολιτισμό μέσα από δραστηριότητες.' ),
				array( 'title' => 'Ενήλικες', 'tagline' => 'Ταξίδια και καθημερινότητα', 'text' => 'Πρακτική επικοινωνία για ταξίδια, προσωπικό ενδιαφέρον, σπουδές ή καθημερινή χρήση.' ),
				array( 'title' => 'Τουρισμός & Εστίαση', 'tagline' => 'Στοχευμένο λεξιλόγιο', 'text' => 'Σενάρια για φιλοξενία, εστίαση, εξυπηρέτηση πελατών και άλλες επαγγελματικές ανάγκες.' ),
				array( 'title' => 'Υποψήφιοι Εξετάσεων', 'tagline' => 'CELI · CILS · PLIDA', 'text' => 'Δομημένη προετοιμασία για τον εξεταστικό φορέα και το επίπεδο που ταιριάζουν στον στόχο.' ),
			),
			'exams'        => array(
				array( 'name' => 'CELI', 'text' => 'Προετοιμασία στη δομή και στις δεξιότητες της επιλεγμένης εξέτασης.' ),
				array( 'name' => 'CILS', 'text' => 'Οργανωμένη πορεία για το επίπεδο πιστοποίησης που χρειάζεται ο μαθητής.' ),
				array( 'name' => 'PLIDA', 'text' => 'Στοχευμένη εξάσκηση και practice tests σύμφωνα με τον εξεταστικό στόχο.' ),
			),
			'outcomes'     => array(
				'Μεγαλύτερη άνεση σε speaking και listening για ταξίδια και καθημερινές συνθήκες.',
				'Λεξιλόγιο και προφορά για φιλοξενία, εστίαση, εργασία ή σπουδές.',
				'Σαφής πορεία από A1 έως C2 και προς CELI, CILS ή PLIDA όταν ο στόχος είναι πιστοποίηση.',
			),
			'faqs'         => array(
				array( 'question' => 'Μπορώ να ξεκινήσω Ιταλικά ως αρχάριος;', 'answer' => 'Ναι. Η εισαγωγική πορεία ξεκινά από Pre-A1 / Principianti και συνεχίζει στα επίπεδα A1 έως C2.' ),
				array( 'question' => 'Υπάρχουν Ιταλικά για επαγγελματίες του τουρισμού και της εστίασης;', 'answer' => 'Ναι. Το περιεχόμενο μπορεί να εστιάσει σε λεξιλόγιο και σενάρια φιλοξενίας, εστίασης και εξυπηρέτησης.' ),
				array( 'question' => 'Προετοιμάζετε για CELI, CILS και PLIDA;', 'answer' => 'Ναι. Το πρόγραμμα προσαρμόζεται στον φορέα, στο επίπεδο και στη μορφή εξέτασης που αντιστοιχούν στον στόχο.' ),
			),
		),
		'russian' => array(
			'greek_name'   => 'Ρωσικά',
			'english_name' => 'Russian',
			'native_name'  => 'Русский язык',
			'native_lang'  => 'ru',
			'intro'        => 'Ρωσικά για ταξίδια, εργασία ή σπουδές, από το κυριλλικό αλφάβητο έως στοχευμένη προετοιμασία TORFL (ТРКИ), με προσωπικό πλάνο και μετρήσιμη πρόοδο.',
			'words'        => array( 'Привет', 'Русский язык', 'Спасибо', 'TORFL', 'ТРКИ', 'Кириллица', 'Работа', 'Учёба', 'Говорить', 'Слушать' ),
			'filters'      => array(
				'Μορφή: Ομαδικά · Mini-groups · 1-to-1 · Online ή δια ζώσης',
				'Στόχος: Γενικά Ρωσικά · Εργασία/Ταξίδια · TORFL/ТРКИ',
				'Ρυθμός: Κανονικό · Fast-Track · Θερινό εντατικό',
			),
			'levels'       => array(
				array( 'level' => 'A1', 'title' => 'Αρχάριο', 'meta' => '2 ώρες την εβδομάδα · κυριλλικό αλφάβητο και βασική επικοινωνία' ),
				array( 'level' => 'A2', 'title' => 'Βασικό', 'meta' => '2 ώρες την εβδομάδα · καθημερινές συναλλαγές και λειτουργικός λόγος' ),
				array( 'level' => 'B1', 'title' => 'Μέσο', 'meta' => '3 ώρες την εβδομάδα · ανεξάρτητη χρήση και πορεία πιστοποίησης' ),
				array( 'level' => 'B2', 'title' => 'Ανώτερο μέσο', 'meta' => '4 ώρες την εβδομάδα · σύνθετος προφορικός και γραπτός λόγος' ),
			),
			'benefits'     => array(
				'Επικοινωνιακή εξάσκηση με σενάρια από ταξίδια, εργασία και καθημερινή ζωή.',
				'Σταδιακή κατάκτηση του κυριλλικού αλφαβήτου, της προφοράς και της γραπτής παραγωγής.',
				'Μικρο-στόχοι ανά 2–4 εβδομάδες και συστηματική παρακολούθηση της πορείας CEFR.',
			),
			'audiences'    => array(
				array( 'title' => 'Αρχάριοι', 'tagline' => 'Κυριλλικό αλφάβητο', 'text' => 'Γράμματα, ήχοι, σωστή προφορά και βασικές φράσεις για ασφαλή καθημερινή επικοινωνία.' ),
				array( 'title' => 'Ταξίδια & Καθημερινότητα', 'tagline' => 'Πρακτικός προφορικός λόγος', 'text' => 'Λεξιλόγιο για μετακινήσεις, εξυπηρέτηση και κοινωνικές περιστάσεις.' ),
				array( 'title' => 'Ενήλικες & Επαγγελματίες', 'tagline' => 'Εργασία και σπουδές', 'text' => 'Συναντήσεις, email και γλωσσικές δεξιότητες προσαρμοσμένες στον επαγγελματικό ή ακαδημαϊκό στόχο.' ),
				array( 'title' => 'Υποψήφιοι Εξετάσεων', 'tagline' => 'TORFL · ТРКИ', 'text' => 'Στοχευμένη προετοιμασία από A1 έως C2, ανάλογα με το επίπεδο και τον στόχο πιστοποίησης.' ),
			),
			'exams'        => array(
				array( 'name' => 'TORFL / ТРКИ A1–B2', 'text' => 'Πορεία πιστοποίησης με διαγνωστικό έλεγχο και εξάσκηση ανά γλωσσική δεξιότητα.' ),
				array( 'name' => 'TORFL / ТРКИ C1–C2', 'text' => 'Εξατομικευμένη προετοιμασία για προχωρημένους ακαδημαϊκούς ή επαγγελματικούς στόχους.' ),
			),
			'outcomes'     => array(
				'Γρήγορη ανάγνωση και γραφή του κυριλλικού αλφαβήτου με σωστή προφορά.',
				'Λεξιλόγιο για μετακινήσεις, εργασία, εξυπηρέτηση και κοινωνικές περιστάσεις.',
				'Σαφής πορεία προς τον επόμενο στόχο CEFR και την αντίστοιχη εξέταση TORFL.',
			),
			'faqs'         => array(
				array( 'question' => 'Πρέπει να γνωρίζω ήδη το κυριλλικό αλφάβητο;', 'answer' => 'Όχι. Στο A1 ξεκινάμε από τα γράμματα, τους ήχους και τις πρώτες χρηστικές φράσεις.' ),
				array( 'question' => 'Κάνετε προετοιμασία για TORFL/ТРКИ;', 'answer' => 'Ναι. Η προετοιμασία περιλαμβάνει διαγνωστικό έλεγχο, mock tests και ανατροφοδότηση στις δεξιότητες της εξέτασης.' ),
				array( 'question' => 'Υπάρχει online φοίτηση;', 'answer' => 'Ναι. Υπάρχουν online και δια ζώσης επιλογές, ανάλογα με το τμήμα, τον στόχο και τη διαθεσιμότητα.' ),
			),
		),
		'chinese' => array(
			'greek_name'   => 'Κινέζικα (Μανδαρινικά)',
			'english_name' => 'Chinese (Mandarin)',
			'native_name'  => '中文 · 普通话',
			'native_lang'  => 'zh-Hans',
			'intro'        => 'Μανδαρινικά από Pinyin, τόνους και βασικούς χαρακτήρες Hanzi έως προετοιμασία HSK, HSKK και YCT, με δομημένη διδασκαλία και μετρήσιμη πρόοδο.',
			'words'        => array( '你好', '中文', '普通话', '拼音', '汉字', 'HSK', 'HSKK', 'YCT', '学习', '交流' ),
			'filters'      => array(
				'Μορφή: Ομαδικά · Mini-groups · 1-to-1 · Online ή δια ζώσης',
				'Στόχος: Καθημερινή επικοινωνία · Business · HSK/HSKK · YCT',
				'Ρυθμός: Κανονικό · Fast-Track · Θερινό εντατικό',
			),
			'levels'       => array(
				array( 'level' => 'HSK 1.1', 'title' => 'Πρώτα βήματα', 'meta' => '1,5 ώρα την εβδομάδα · Pinyin, τόνοι και βασικές φράσεις' ),
				array( 'level' => 'HSK 1.2', 'title' => 'Βάσεις HSK 1', 'meta' => '1,5 ώρα την εβδομάδα · ακρόαση, προφορικός λόγος και πρώτοι Hanzi' ),
				array( 'level' => 'HSK 2.1 — 2.2', 'title' => 'Εδραίωση', 'meta' => '1,5 ώρα την εβδομάδα ανά στάδιο · λεξιλόγιο και γραφή' ),
				array( 'level' => 'HSK 3 — 4', 'title' => 'Ανεξάρτητη χρήση', 'meta' => '2 ώρες την εβδομάδα ανά επίπεδο · σύνθετη κατανόηση και εξέταση' ),
			),
			'benefits'     => array(
				'Δομημένη εισαγωγή σε Pinyin, τέσσερις τόνους και χαρακτήρες Hanzi με ασφαλή εξάσκηση.',
				'Βιωματική μάθηση που μετατρέπει τη γραφή και τη φωνητική σε κατανοητά, οργανωμένα βήματα.',
				'Πρακτικά σενάρια για καθημερινή επικοινωνία, ταξίδια, σπουδές και επαγγελματικές ανάγκες.',
			),
			'audiences'    => array(
				array( 'title' => 'Παιδιά & Έφηβοι', 'tagline' => 'Πρώτη επαφή και YCT', 'text' => 'Ηλικιακά κατάλληλη εισαγωγή σε ήχους, χαρακτήρες και καθημερινές φράσεις, με δυνατότητα πορείας προς YCT.' ),
				array( 'title' => 'Αρχάριοι', 'tagline' => 'Pinyin και τόνοι', 'text' => 'Σωστή προφορά, ακουστική διάκριση των τόνων και βασικές φράσεις για καθημερινή χρήση.' ),
				array( 'title' => 'Ενήλικες & Επαγγελματίες', 'tagline' => 'Business και ταξίδια', 'text' => 'Λεξιλόγιο για συναντήσεις, παρουσιάσεις, email, ταξίδια και κοινωνικές περιστάσεις.' ),
				array( 'title' => 'Υποψήφιοι Εξετάσεων', 'tagline' => 'HSK · HSKK · YCT', 'text' => 'Στοχευμένη προετοιμασία HSK/HSKK επιπέδων 1–6 ή YCT, σύμφωνα με τον εξεταστικό στόχο.' ),
			),
			'exams'        => array(
				array( 'name' => 'HSK', 'text' => 'Προετοιμασία κατανόησης και χρήσης των Μανδαρινικών, με διαδρομή από HSK 1 προς HSK 6.' ),
				array( 'name' => 'HSKK', 'text' => 'Ειδική προετοιμασία προφορικού λόγου με drills τόνων, ακουστική εξάσκηση και mock tests.' ),
				array( 'name' => 'YCT', 'text' => 'Εξεταστική διαδρομή για παιδιά και εφήβους που μαθαίνουν Κινέζικα ως ξένη γλώσσα.' ),
			),
			'outcomes'     => array(
				'Σωστή προφορά και έλεγχος των τόνων με πρακτικά drills από τον πρώτο μήνα.',
				'Κατανόηση και παραγωγή βασικών χαρακτήρων με σωστό stroke order.',
				'Σαφής διαδρομή HSK 1 → 2 → 3 → 4 και εξατομικευμένη καθοδήγηση για ανώτερους εξεταστικούς στόχους.',
			),
			'faqs'         => array(
				array( 'question' => 'Είναι δύσκολοι οι κινεζικοί χαρακτήρες;', 'answer' => 'Διδάσκονται σταδιακά, με σωστό stroke order, συστηματική επανάληψη και σύνδεση κάθε χαρακτήρα με πραγματική χρήση.' ),
				array( 'question' => 'Κάνετε προετοιμασία για HSK και HSKK;', 'answer' => 'Ναι. Η προετοιμασία περιλαμβάνει mock tests, εξάσκηση ανά δεξιότητα και τακτική ανατροφοδότηση.' ),
				array( 'question' => 'Υπάρχει πρόγραμμα YCT για παιδιά;', 'answer' => 'Ναι. Η παιδική και εφηβική πορεία χρησιμοποιεί ηλικιακά κατάλληλο υλικό και μπορεί να οδηγήσει στις εξετάσεις YCT.' ),
			),
		),
		'japanese' => array(
			'greek_name'   => 'Ιαπωνικά',
			'english_name' => 'Japanese',
			'native_name'  => '日本語',
			'native_lang'  => 'ja',
			'intro'        => 'Ιαπωνικά με σωστά θεμέλια σε Hiragana, Katakana και pitch accent και δομημένη συνέχεια στα Kanji και στην προετοιμασία JLPT από N5 έως N1.',
			'words'        => array( 'こんにちは', '日本語', 'ひらがな', 'カタカナ', '漢字', 'JLPT', '会話', '勉強', '旅行', '未来' ),
			'filters'      => array(
				'Μορφή: Ομαδικά · Mini-groups · 1-to-1 · Online ή δια ζώσης',
				'Στόχος: Everyday Japanese · Work/Study · JLPT N5–N1',
				'Ρυθμός: Κανονικό · Fast-Track · Θερινό εντατικό',
			),
			'levels'       => array(
				array( 'level' => 'N5', 'title' => 'Εισαγωγικό', 'meta' => '1,5 ώρα την εβδομάδα · Hiragana, Katakana και βασική επικοινωνία' ),
				array( 'level' => 'N4', 'title' => 'Βασικό', 'meta' => '1,5 ώρα την εβδομάδα · γραμματική, ακρόαση και σταδιακά Kanji' ),
				array( 'level' => 'N3', 'title' => 'Μέσο', 'meta' => '2 ώρες την εβδομάδα · ανεξάρτητη κατανόηση καθημερινού λόγου' ),
				array( 'level' => 'N2 — N1', 'title' => 'Προχωρημένο', 'meta' => '2 ώρες την εβδομάδα ανά επίπεδο · σύνθετα κείμενα, ακρόαση και εξέταση' ),
			),
			'benefits'     => array(
				'Σταδιακή διαδρομή kana → βασική γραμματική → Kanji με μεθοδική και ασφαλή εξάσκηση.',
				'Βιωματική κατανόηση της δομής, της ευγένειας και της μοναδικής φιλοσοφίας της γλώσσας.',
				'Καλλιέργεια επικοινωνίας, ακουστικής κατανόησης και σωστής προφοράς από το N5.',
			),
			'audiences'    => array(
				array( 'title' => 'Αρχάριοι', 'tagline' => 'Kana και pitch accent', 'text' => 'Hiragana, Katakana, σωστή προφορά και βασικές φράσεις για ταξίδια και καθημερινότητα.' ),
				array( 'title' => 'Ταξιδιώτες', 'tagline' => 'Καθημερινή επικοινωνία', 'text' => 'Χρήσιμες φράσεις, κατανόηση πολιτισμικών κανόνων και πρακτική σε ρεαλιστικά σενάρια.' ),
				array( 'title' => 'Ενήλικες & Φοιτητές', 'tagline' => 'Work και Study', 'text' => 'Γλώσσα για σπουδές, εργασία και βαθύτερη πολιτισμική κατανόηση.' ),
				array( 'title' => 'Υποψήφιοι Εξετάσεων', 'tagline' => 'JLPT N5–N1', 'text' => 'Λεξιλόγιο, γραμματική, Kanji, ακρόαση και mock tests οργανωμένα ανά επίπεδο.' ),
			),
			'exams'        => array(
				array( 'name' => 'JLPT N5–N4', 'text' => 'Θεμέλια σε λεξιλόγιο, γραμματική, ανάγνωση και ακουστική κατανόηση.' ),
				array( 'name' => 'JLPT N3', 'text' => 'Μετάβαση σε ανεξάρτητη κατανόηση καθημερινού ιαπωνικού λόγου και κειμένων.' ),
				array( 'name' => 'JLPT N2–N1', 'text' => 'Προχωρημένη ανάγνωση και ακρόαση, στρατηγική εξέτασης και στοχευμένα mock tests.' ),
			),
			'outcomes'     => array(
				'Σωστή ανάγνωση και γραφή Kana από τον πρώτο μήνα, με σταδιακή εισαγωγή Kanji.',
				'Πρακτική επικοινωνία για ταξίδια, σπουδές και βασικές επαγγελματικές ανάγκες.',
				'Σαφής πορεία N5 → N4 → N3 → N2/N1 με μετρήσιμα ενδιάμεσα βήματα.',
			),
			'faqs'         => array(
				array( 'question' => 'Είναι δύσκολα τα Kanji;', 'answer' => 'Ακολουθούμε μεθοδική πορεία με radicals, stroke order και spaced repetition, ώστε η γνώση να χτίζεται σταθερά.' ),
				array( 'question' => 'Προετοιμάζετε για όλα τα επίπεδα JLPT;', 'answer' => 'Ναι. Η πορεία καλύπτει N5 έως N1 και προσαρμόζεται στον χρόνο και στο επίπεδο του υποψηφίου.' ),
				array( 'question' => 'Πότε ξεκινά η προφορική εξάσκηση;', 'answer' => 'Από το πρώτο μάθημα, παράλληλα με Kana, βασική γραμματική και ακουστική κατανόηση.' ),
			),
		),
		'turkish' => array(
			'greek_name'   => 'Τουρκικά',
			'english_name' => 'Turkish',
			'native_name'  => 'Türkçe',
			'native_lang'  => 'tr',
			'intro'        => 'Τουρκικά για ταξίδια, εργασία, τουρισμό, εμπόριο ή σπουδές, με δομημένη πορεία A1–B2 και προετοιμασία TYS ή TÖMER.',
			'words'        => array( 'Merhaba', 'Türkçe', 'Teşekkürler', 'TYS', 'TÖMER', 'Seyahat', 'Ticaret', 'Turizm', 'Konuşma', 'Öğrenme' ),
			'filters'      => array(
				'Μορφή: Ομαδικά · Mini-groups · 1-to-1 · Online ή δια ζώσης',
				'Στόχος: Γενικά Τουρκικά · Τουρισμός/Εμπόριο · TYS/TÖMER',
				'Ρυθμός: Κανονικό · Fast-Track · Θερινό εντατικό',
			),
			'levels'       => array(
				array( 'level' => 'A1', 'title' => 'Αρχάριο', 'meta' => '2 ώρες την εβδομάδα · προφορά και βασικές καθημερινές δομές' ),
				array( 'level' => 'A2', 'title' => 'Βασικό', 'meta' => '2 ώρες την εβδομάδα · συναλλαγές, ταξίδια και απλή επικοινωνία' ),
				array( 'level' => 'B1', 'title' => 'Μέσο', 'meta' => '3 ώρες την εβδομάδα · ανεξάρτητη χρήση σε εργασία και καθημερινότητα' ),
				array( 'level' => 'B2', 'title' => 'Ανώτερο μέσο', 'meta' => '4 ώρες την εβδομάδα · σύνθετος λόγος και εξεταστική στόχευση' ),
			),
			'benefits'     => array(
				'Ρεαλιστικά σενάρια από φιλοξενία, εστίαση, λιανεμπόριο, ταξίδια και επαγγελματικές συναντήσεις.',
				'Καθαρή εξήγηση της αρμονίας φωνηέντων, των ρηματικών επιθημάτων και της συγκολλητικής γραμματικής.',
				'Συστηματική εξάσκηση προφοράς και των χαρακτήρων ç, ğ, ı, ö, ş και ü.',
			),
			'audiences'    => array(
				array( 'title' => 'Αρχάριοι', 'tagline' => 'Προφορά και βασικές δομές', 'text' => 'Καθημερινές φράσεις και σταδιακή εξοικείωση με την αρμονία φωνηέντων και τα επιθήματα.' ),
				array( 'title' => 'Ταξίδια & Τουρισμός', 'tagline' => 'Φιλοξενία και εξυπηρέτηση', 'text' => 'Λεξιλόγιο για ξενοδοχεία, εστίαση, μετακινήσεις και επικοινωνία με επισκέπτες.' ),
				array( 'title' => 'Ενήλικες & Επαγγελματίες', 'tagline' => 'Εμπόριο και εργασία', 'text' => 'Συναντήσεις, email, λιανεμπόριο και εμπορικές συναλλαγές προσαρμοσμένες στον κλάδο.' ),
				array( 'title' => 'Υποψήφιοι Εξετάσεων', 'tagline' => 'TYS · TÖMER', 'text' => 'Δομημένη προετοιμασία με diagnostic, practice tests και στρατηγική εξέτασης.' ),
			),
			'exams'        => array(
				array( 'name' => 'TYS', 'text' => 'Στοχευμένη προετοιμασία ανά δεξιότητα, με practice tests και στρατηγική εξέτασης.' ),
				array( 'name' => 'TÖMER', 'text' => 'Πορεία γλωσσικής επάρκειας βάσει στόχου σπουδών, εργασίας ή επίσημης πιστοποίησης.' ),
			),
			'outcomes'     => array(
				'Γρήγορη κατανόηση βασικών δομών, ρηματικών επιθημάτων και αρμονίας φωνηέντων.',
				'Λεξιλόγιο για φιλοξενία, ταξίδια, κοινωνικές περιστάσεις και εμπορικές συναλλαγές.',
				'Σαφής πορεία προς τον επόμενο στόχο CEFR και την κατάλληλη πιστοποίηση.',
			),
			'faqs'         => array(
				array( 'question' => 'Γράφονται τα Τουρκικά με λατινικό αλφάβητο;', 'answer' => 'Ναι. Δίνουμε ιδιαίτερη έμφαση στη σωστή προφορά και στους χαρακτήρες ç, ğ, ı, ö, ş και ü.' ),
				array( 'question' => 'Κάνετε προετοιμασία για TYS και TÖMER;', 'answer' => 'Ναι. Η προετοιμασία περιλαμβάνει diagnostic, practice tests, διαχείριση χρόνου και στοχευμένη ανατροφοδότηση.' ),
				array( 'question' => 'Μπορώ να εστιάσω σε τουρισμό ή εμπόριο;', 'answer' => 'Ναι. Το ατομικό πρόγραμμα προσαρμόζεται στο λεξιλόγιο και στα σενάρια του επαγγελματικού σας κλάδου.' ),
			),
		),
		'arabic' => array(
			'greek_name'   => 'Αραβικά',
			'english_name' => 'Arabic',
			'native_name'  => 'العربية',
			'native_lang'  => 'ar',
			'native_dir'   => 'rtl',
			'intro'        => 'Αραβικά από Modern Standard Arabic (MSA / Φούσχα) έως στοχευμένη εξάσκηση Levantine ή Egyptian για εργασία, ταξίδια και σπουδές.',
			'words'        => array( 'مرحبا', 'العربية', 'شكرا', 'الفصحى', 'MSA', 'Levantine', 'Egyptian', 'ALPT', 'OPI', 'تعلم' ),
			'filters'      => array(
				'Μορφή: Ομαδικά · Mini-groups · 1-to-1 · Online ή δια ζώσης',
				'Στόχος: MSA/Φούσχα · Levantine/Egyptian · Εργασία/Σπουδές · ALPT/OPI',
				'Ρυθμός: Κανονικό · Fast-Track · Θερινό εντατικό',
			),
			'levels'       => array(
				array( 'level' => 'A1', 'title' => 'Αρχάριο', 'meta' => '2 ώρες την εβδομάδα · αλφάβητο, φωνήματα και πρώτες φράσεις MSA' ),
				array( 'level' => 'A2', 'title' => 'Βασικό', 'meta' => '2 ώρες την εβδομάδα · ανάγνωση, γραφή και καθημερινή επικοινωνία' ),
				array( 'level' => 'B1.1', 'title' => 'Μέσο — πρώτο στάδιο', 'meta' => '3 ώρες την εβδομάδα · ανεξάρτητη χρήση και εμπλουτισμός λεξιλογίου' ),
				array( 'level' => 'B1.2', 'title' => 'Μέσο — δεύτερο στάδιο', 'meta' => '3 ώρες την εβδομάδα · σύνθετη κατανόηση και παραγωγή λόγου' ),
			),
			'benefits'     => array(
				'Δομημένη διδασκαλία της αραβικής γραφής από δεξιά προς τα αριστερά, της φωνητικής και της βασικής μορφολογίας.',
				'Επιλογή Modern Standard Arabic (MSA / Φούσχα) ή στοχευμένης διαλέκτου Levantine/Egyptian ανάλογα με τη χρήση.',
				'Βιωματική επαφή με τον πολιτισμό, την ιστορία και τη σύγχρονη καθημερινότητα του αραβικού κόσμου.',
			),
			'audiences'    => array(
				array( 'title' => 'Αρχάριοι', 'tagline' => 'Αλφάβητο και προφορά', 'text' => 'Γραφή RTL, σύνδεση γραμμάτων και βασικές φράσεις Modern Standard Arabic για καθημερινή χρήση.' ),
				array( 'title' => 'Ενήλικες & Επαγγελματίες', 'tagline' => 'Τουρισμός και εμπόριο', 'text' => 'Λεξιλόγιο για επαγγελματικές επαφές, φιλοξενία, meetings και email.' ),
				array( 'title' => 'Φοιτητές & Expats', 'tagline' => 'Σπουδές και κοινωνική ένταξη', 'text' => 'Ακαδημαϊκή ή κοινωνική επικοινωνία με επιλογή MSA, Levantine ή Egyptian ανάλογα με τον στόχο.' ),
				array( 'title' => 'Υποψήφιοι Εξετάσεων', 'tagline' => 'ALPT · OPI/OPIc', 'text' => 'Προετοιμασία ALPT ή προφορικής αξιολόγησης OPI/OPIc, όπου απαιτείται.' ),
			),
			'exams'        => array(
				array( 'name' => 'ALPT', 'text' => 'Στοχευμένη προετοιμασία με diagnostic, εξάσκηση ανά δεξιότητα και practice tests.' ),
				array( 'name' => 'OPI / OPIc', 'text' => 'Προετοιμασία προφορικής αξιολόγησης όπου εφαρμόζεται, με mock interviews και άμεση ανατροφοδότηση.' ),
			),
			'outcomes'     => array(
				'Σωστή ανάγνωση και γραφή της αραβικής γραφής με πρακτική σε απαιτητικά φωνήματα.',
				'Λεξιλόγιο για ταξίδια, φιλοξενία, σπουδές και εμπορικές συναλλαγές.',
				'Σαφής πορεία προς τον επόμενο στόχο CEFR ή τις απαιτήσεις της επιλεγμένης εξέτασης.',
			),
			'faqs'         => array(
				array( 'question' => 'Διδάσκετε Modern Standard Arabic ή διαλέκτους;', 'answer' => 'Η βασική διαδρομή μπορεί να εστιάσει στο MSA/Φούσχα ή να προσαρμοστεί σε Levantine ή Egyptian, ανάλογα με τον στόχο.' ),
				array( 'question' => 'Πώς μαθαίνω να γράφω από δεξιά προς τα αριστερά;', 'answer' => 'Ξεκινάμε με τη μορφή και τη σύνδεση των γραμμάτων, τη φορά γραφής και σύντομες λέξεις, με σταδιακή αύξηση της δυσκολίας.' ),
				array( 'question' => 'Κάνετε προετοιμασία για ALPT ή OPI;', 'answer' => 'Ναι. Η προετοιμασία σχεδιάζεται βάσει της εξέτασης και περιλαμβάνει practice tests ή mock interviews.' ),
			),
		),
	);

	if ( ! isset( $languages[ $language ] ) ) {
		return array();
	}

	if ( ! isset( $languages[ $language ]['formats'] ) ) {
		$languages[ $language ]['formats'] = $common_formats;
	}

	return $languages[ $language ];
}

/**
 * Escape text for theme pattern output.
 */
function mls_language_page_text( string $text ): string {
	return esc_html( $text );
}

/**
 * Return page-specific interface copy with a shared default.
 *
 * @param array<string, mixed> $data Language content.
 */
function mls_language_page_copy( array $data, string $key, string $default ): string {
	$value = $data['copy'][ $key ] ?? $default;

	return is_string( $value ) ? $value : $default;
}

/**
 * Render the page hero pattern.
 *
 * @param array<string, mixed> $data Language content.
 */
function mls_language_page_pattern_hero( array $data ): void {
	$words              = '';
	$native_dir         = $data['native_dir'] ?? 'auto';
	$native_lang        = $data['native_lang'] ?? '';
	$hero_subtitle      = mls_language_page_copy( $data, 'hero_subtitle', '' );
	$hero_primary_cta   = mls_language_page_copy( $data, 'hero_primary_cta', '' );
	$hero_secondary_cta = mls_language_page_copy( $data, 'hero_secondary_cta', '' );

	foreach ( $data['words'] as $word ) {
		$words .= '<span dir="auto">' . mls_language_page_text( $word ) . '</span>';
	}
	?>
<!-- wp:group {"className":"page-hero","align":"full","layout":{"type":"default"},"style":{"spacing":{"margin":{"top":"0"}}}} -->
<div class="wp-block-group alignfull page-hero">
	<!-- wp:group {"className":"hero-blob-1","layout":{"type":"default"}} -->
	<div class="wp-block-group hero-blob-1"></div>
	<!-- /wp:group -->
	<!-- wp:group {"className":"word-cloud-bg","layout":{"type":"default"}} -->
	<div class="wp-block-group word-cloud-bg" aria-hidden="true">
		<!-- wp:paragraph --><p><?php echo $words; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></p><!-- /wp:paragraph -->
	</div>
	<!-- /wp:group -->
	<!-- wp:group {"className":"page-hero-inner","layout":{"type":"default"}} -->
	<div class="wp-block-group page-hero-inner">
		<!-- wp:paragraph {"className":"page-hero-eyebrow"} --><p class="page-hero-eyebrow"><a href="/languages/" style="color:inherit">Languages</a> › <?php echo mls_language_page_text( $data['english_name'] ); ?></p><!-- /wp:paragraph -->
		<!-- wp:heading {"level":1,"className":"page-hero-heading"} --><h1 class="wp-block-heading page-hero-heading"><?php echo mls_language_page_text( $data['english_name'] ); ?></h1><!-- /wp:heading -->
		<?php if ( $hero_subtitle ) : ?>
			<!-- wp:paragraph {"className":"page-hero-en"} --><p class="page-hero-en"><?php echo mls_language_page_text( $hero_subtitle ); ?></p><!-- /wp:paragraph -->
		<?php else : ?>
			<!-- wp:paragraph {"className":"page-hero-en"} --><p class="page-hero-en"><?php echo mls_language_page_text( $data['greek_name'] ); ?> · <bdi class="language-native-label" dir="<?php echo esc_attr( $native_dir ); ?>"<?php echo $native_lang ? ' lang="' . esc_attr( $native_lang ) . '"' : ''; ?>><?php echo mls_language_page_text( $data['native_name'] ); ?></bdi></p><!-- /wp:paragraph -->
		<?php endif; ?>
		<!-- wp:paragraph {"className":"page-hero-usp"} --><p class="page-hero-usp"><?php echo mls_language_page_text( $data['intro'] ); ?></p><!-- /wp:paragraph -->
		<?php if ( $hero_primary_cta || $hero_secondary_cta ) : ?>
			<!-- wp:buttons {"className":"hero-actions","layout":{"type":"flex","flexWrap":"wrap"}} -->
			<div class="wp-block-buttons hero-actions">
				<?php if ( $hero_primary_cta ) : ?>
					<!-- wp:button {"className":"btn-primary"} --><div class="wp-block-button btn-primary"><a class="wp-block-button__link wp-element-button" href="/contact/"><?php echo mls_language_page_text( $hero_primary_cta ); ?></a></div><!-- /wp:button -->
				<?php endif; ?>
				<?php if ( $hero_secondary_cta ) : ?>
					<!-- wp:button {"className":"btn-ghost-hero"} --><div class="wp-block-button btn-ghost-hero"><a class="wp-block-button__link wp-element-button" href="/contact/"><?php echo mls_language_page_text( $hero_secondary_cta ); ?></a></div><!-- /wp:button -->
				<?php endif; ?>
			</div>
			<!-- /wp:buttons -->
		<?php endif; ?>
	</div>
	<!-- /wp:group -->
</div>
<!-- /wp:group -->
	<?php
}

/**
 * Render quick filters and level cards.
 *
 * @param array<string, mixed> $data Language content.
 */
function mls_language_page_pattern_quick_filters( array $data ): void {
	$levels_label   = mls_language_page_copy( $data, 'levels_label', 'Επίπεδα' );
	$levels_heading = mls_language_page_copy( $data, 'levels_heading', 'Τμήματα ' . $data['greek_name'] );
	$levels_intro   = mls_language_page_copy( $data, 'levels_intro', '' );
	$level_cta      = mls_language_page_copy( $data, 'level_cta', 'Ρωτήστε για τμήμα ›' );
	?>
<!-- wp:html -->
<section class="filter-pills-section" aria-labelledby="language-levels-heading">
	<div class="wide-width">
		<div class="filter-pills">
			<?php foreach ( $data['filters'] as $index => $filter ) : ?>
				<span class="filter-pill<?php echo 0 === $index ? ' active' : ''; ?>"><?php echo mls_language_page_text( $filter ); ?></span>
			<?php endforeach; ?>
		</div>
		<div class="section-label reveal"><?php echo mls_language_page_text( $levels_label ); ?></div>
		<h2 id="language-levels-heading" class="section-heading reveal reveal-delay-1"><?php echo mls_language_page_text( $levels_heading ); ?></h2>
		<?php if ( $levels_intro ) : ?>
			<p class="section-intro reveal reveal-delay-2"><?php echo mls_language_page_text( $levels_intro ); ?></p>
		<?php endif; ?>
		<div class="course-tiers">
			<?php foreach ( $data['levels'] as $index => $level ) : ?>
				<div class="tier-card reveal reveal-delay-<?php echo esc_attr( (string) min( $index, 3 ) ); ?>">
					<div class="tier-level"><?php echo mls_language_page_text( $level['level'] ); ?></div>
					<div class="tier-name"><?php echo mls_language_page_text( $level['title'] ); ?></div>
					<div class="tier-meta"><?php echo mls_language_page_text( $level['meta'] ); ?></div>
					<a href="/contact/" class="tier-cta"><?php echo mls_language_page_text( $level_cta ); ?></a>
				</div>
			<?php endforeach; ?>
		</div>
	</div>
</section>
<!-- /wp:html -->
	<?php
}

/**
 * Render the benefits pattern.
 *
 * @param array<string, mixed> $data Language content.
 */
function mls_language_page_pattern_benefits( array $data ): void {
	$benefits_label   = mls_language_page_copy( $data, 'benefits_label', 'Γιατί ' . $data['greek_name'] );
	$benefits_heading = mls_language_page_copy( $data, 'benefits_heading', 'Μάθηση με επικοινωνία και σαφή πορεία' );
	$benefits_intro   = mls_language_page_copy( $data, 'benefits_intro', '' );
	?>
<!-- wp:group {"align":"full","layout":{"type":"constrained","contentSize":"1280px"},"style":{"spacing":{"margin":{"top":"0"},"padding":{"top":"4rem","bottom":"4rem","left":"2rem","right":"2rem"}},"color":{"background":"#f8f7fa"}}} -->
<div class="wp-block-group alignfull has-background" style="background-color:#f8f7fa;padding-top:4rem;padding-bottom:4rem">
	<!-- wp:paragraph {"className":"section-label reveal"} --><p class="section-label reveal"><?php echo mls_language_page_text( $benefits_label ); ?></p><!-- /wp:paragraph -->
	<!-- wp:heading {"level":2,"className":"section-heading reveal reveal-delay-1"} --><h2 class="wp-block-heading section-heading reveal reveal-delay-1"><?php echo mls_language_page_text( $benefits_heading ); ?></h2><!-- /wp:heading -->
	<?php if ( $benefits_intro ) : ?>
		<!-- wp:paragraph {"className":"section-intro reveal reveal-delay-2"} --><p class="section-intro reveal reveal-delay-2"><?php echo mls_language_page_text( $benefits_intro ); ?></p><!-- /wp:paragraph -->
	<?php endif; ?>
	<!-- wp:html -->
	<div class="overview-grid">
		<?php foreach ( $data['benefits'] as $index => $benefit ) : ?>
			<div class="overview-col reveal reveal-delay-<?php echo esc_attr( (string) min( $index, 3 ) ); ?>">
				<div class="overview-col-title"><?php echo mls_language_page_text( is_array( $benefit ) ? $benefit['title'] : sprintf( '0%d', $index + 1 ) ); ?></div>
				<p><?php echo mls_language_page_text( is_array( $benefit ) ? $benefit['text'] : $benefit ); ?></p>
			</div>
		<?php endforeach; ?>
	</div>
	<!-- /wp:html -->
</div>
<!-- /wp:group -->
	<?php
}

/**
 * Render audience-fit cards.
 *
 * @param array<string, mixed> $data Language content.
 */
function mls_language_page_pattern_audience( array $data ): void {
	$colors           = array( 'violet', 'green', 'tango', 'violet' );
	$audience_label   = mls_language_page_copy( $data, 'audience_label', 'Σε ποιον απευθύνεται' );
	$audience_heading = mls_language_page_copy( $data, 'audience_heading', $data['greek_name'] . ' για διαφορετικούς στόχους' );
	?>
<!-- wp:group {"align":"full","layout":{"type":"constrained","contentSize":"1280px"},"style":{"spacing":{"margin":{"top":"0"},"padding":{"top":"4rem","bottom":"4rem","left":"2rem","right":"2rem"}}}} -->
<div class="wp-block-group alignfull" style="padding-top:4rem;padding-bottom:4rem">
	<!-- wp:paragraph {"className":"section-label reveal"} --><p class="section-label reveal"><?php echo mls_language_page_text( $audience_label ); ?></p><!-- /wp:paragraph -->
	<!-- wp:heading {"level":2,"className":"section-heading reveal reveal-delay-1"} --><h2 class="wp-block-heading section-heading reveal reveal-delay-1"><?php echo mls_language_page_text( $audience_heading ); ?></h2><!-- /wp:heading -->
	<!-- wp:html -->
	<div class="audience-lg-grid">
		<?php foreach ( $data['audiences'] as $index => $audience ) : ?>
			<div class="audience-lg-card reveal reveal-delay-<?php echo esc_attr( (string) min( $index, 3 ) ); ?>">
				<div class="audience-lg-header <?php echo esc_attr( $colors[ $index ] ); ?>">
					<div>
						<div class="audience-lg-title"><?php echo mls_language_page_text( $audience['title'] ); ?></div>
						<div class="audience-tagline"><?php echo mls_language_page_text( $audience['tagline'] ); ?></div>
					</div>
				</div>
				<div class="audience-lg-body"><p class="audience-desc"><?php echo mls_language_page_text( $audience['text'] ); ?></p></div>
			</div>
		<?php endforeach; ?>
	</div>
	<!-- /wp:html -->
</div>
<!-- /wp:group -->
	<?php
}

/**
 * Render placement-test guidance.
 *
 * @param array<string, mixed> $data Language content.
 */
function mls_language_page_pattern_placement( array $data ): void {
	$placement_label      = mls_language_page_copy( $data, 'placement_label', 'Τεστ Κατάταξης' );
	$placement_heading    = mls_language_page_copy( $data, 'placement_heading', 'Ποιο επίπεδο ' . $data['greek_name'] . ' είμαι;' );
	$placement_text       = mls_language_page_copy( $data, 'placement_text', 'Ένα σύντομο γραπτό και προφορικό τεστ βοηθά να επιλεγούν το κατάλληλο επίπεδο, ο ρυθμός και η μορφή φοίτησης.' );
	$placement_list_title = mls_language_page_copy( $data, 'placement_list_title', 'Τι περιλαμβάνει' );
	$placement_cta        = mls_language_page_copy( $data, 'placement_cta', 'Κλείστε Τεστ Κατάταξης ›' );
	$placement_items      = $data['placement_items'] ?? array(
		'Γραπτή και προφορική αξιολόγηση',
		'Διάρκεια περίπου 20–30 λεπτά',
		'Online ή δια ζώσης',
		'Σύντομη πρόταση για την κατάλληλη ροή',
	);
	?>
<!-- wp:html -->
<section class="progress-band" aria-labelledby="placement-heading">
	<div class="progress-band-inner">
		<div class="progress-text-col reveal">
			<div class="band-label"><?php echo mls_language_page_text( $placement_label ); ?></div>
			<h2 id="placement-heading"><?php echo mls_language_page_text( $placement_heading ); ?></h2>
			<p><?php echo mls_language_page_text( $placement_text ); ?></p>
			<div style="margin-top:1.5rem;"><a href="/contact/" class="exam-cta"><?php echo mls_language_page_text( $placement_cta ); ?></a></div>
		</div>
		<div class="dashboard-mock reveal reveal-delay-1">
			<div class="dashboard-title"><?php echo mls_language_page_text( $placement_list_title ); ?></div>
			<ul class="overview-list">
				<?php foreach ( $placement_items as $item ) : ?>
					<li style="color:rgba(255,255,255,0.9)"><?php echo mls_language_page_text( $item ); ?></li>
				<?php endforeach; ?>
			</ul>
		</div>
	</div>
</section>
<!-- /wp:html -->
	<?php
}

/**
 * Render study-format cards.
 *
 * @param array<string, mixed> $data Language content.
 */
function mls_language_page_pattern_formats( array $data ): void {
	$formats_label   = mls_language_page_copy( $data, 'formats_label', 'Μορφές Φοίτησης' );
	$formats_heading = mls_language_page_copy( $data, 'formats_heading', 'Επιλέξτε τον τρόπο που σας ταιριάζει' );
	$formats_intro   = mls_language_page_copy( $data, 'formats_intro', '' );
	$format_cta      = mls_language_page_copy( $data, 'format_cta', 'Επικοινωνήστε μαζί μας ›' );
	?>
<!-- wp:html -->
<section class="filter-pills-section" aria-labelledby="study-formats-heading">
	<div class="wide-width">
		<div class="section-label reveal"><?php echo mls_language_page_text( $formats_label ); ?></div>
		<h2 id="study-formats-heading" class="section-heading reveal reveal-delay-1"><?php echo mls_language_page_text( $formats_heading ); ?></h2>
		<?php if ( $formats_intro ) : ?>
			<p class="section-intro reveal reveal-delay-2"><?php echo mls_language_page_text( $formats_intro ); ?></p>
		<?php endif; ?>
		<div class="course-tiers">
			<?php foreach ( $data['formats'] as $index => $format ) : ?>
				<div class="tier-card reveal reveal-delay-<?php echo esc_attr( (string) min( $index, 3 ) ); ?>">
					<div class="tier-level">0<?php echo esc_html( (string) ( $index + 1 ) ); ?></div>
					<div class="tier-name"><?php echo mls_language_page_text( $format['title'] ); ?></div>
					<div class="tier-meta"><?php echo mls_language_page_text( $format['text'] ); ?></div>
					<a href="/contact/" class="tier-cta"><?php echo mls_language_page_text( $format_cta ); ?></a>
				</div>
			<?php endforeach; ?>
		</div>
	</div>
</section>
<!-- /wp:html -->
	<?php
}

/**
 * Render exam terminology and outcomes.
 *
 * @param array<string, mixed> $data Language content.
 */
function mls_language_page_pattern_outcomes( array $data ): void {
	$exams_label   = mls_language_page_copy( $data, 'exams_label', 'Εξετάσεις & Αποτελέσματα' );
	$exams_heading = mls_language_page_copy( $data, 'exams_heading', 'Πορεία πιστοποίησης στα ' . $data['greek_name'] );
	$exam_cta      = mls_language_page_copy( $data, 'exam_cta', 'Ρωτήστε για προετοιμασία ›' );
	?>
<!-- wp:html -->
<section class="exams-band" aria-labelledby="exam-pathways-heading">
	<div class="exams-band-inner">
		<div class="exams-band-label"><?php echo mls_language_page_text( $exams_label ); ?></div>
		<h2 id="exam-pathways-heading" class="exams-band-heading"><?php echo mls_language_page_text( $exams_heading ); ?></h2>
		<div class="exams-grid">
			<?php foreach ( $data['exams'] as $index => $exam ) : ?>
				<div class="exam-card reveal reveal-delay-<?php echo esc_attr( (string) min( $index, 3 ) ); ?>">
					<div class="exam-name-badge"><?php echo mls_language_page_text( $exam['name'] ); ?></div>
					<p class="exam-desc"><?php echo mls_language_page_text( $exam['text'] ); ?></p>
					<a href="/contact/" class="exam-cta"><?php echo mls_language_page_text( $exam_cta ); ?></a>
				</div>
			<?php endforeach; ?>
		</div>
		<ul class="overview-list" style="margin-top:2rem">
			<?php foreach ( $data['outcomes'] as $outcome ) : ?>
				<li style="color:rgba(255,255,255,0.9)"><?php echo mls_language_page_text( $outcome ); ?></li>
			<?php endforeach; ?>
		</ul>
	</div>
</section>
<!-- /wp:html -->
	<?php
}

/**
 * Render FAQ items.
 *
 * @param array<string, mixed> $data Language content.
 */
function mls_language_page_pattern_faq( array $data ): void {
	$faq_label   = mls_language_page_copy( $data, 'faq_label', 'Συχνές Ερωτήσεις' );
	$faq_heading = mls_language_page_copy( $data, 'faq_heading', 'Απορίες για τα ' . $data['greek_name'] );
	?>
<!-- wp:group {"align":"full","layout":{"type":"constrained","contentSize":"1280px"},"style":{"spacing":{"margin":{"top":"0"},"padding":{"top":"4rem","bottom":"4rem","left":"2rem","right":"2rem"}}}} -->
<div class="wp-block-group alignfull" style="padding-top:4rem;padding-bottom:4rem">
	<!-- wp:paragraph {"className":"section-label reveal"} --><p class="section-label reveal"><?php echo mls_language_page_text( $faq_label ); ?></p><!-- /wp:paragraph -->
	<!-- wp:heading {"level":2,"className":"section-heading reveal reveal-delay-1"} --><h2 class="wp-block-heading section-heading reveal reveal-delay-1"><?php echo mls_language_page_text( $faq_heading ); ?></h2><!-- /wp:heading -->
	<!-- wp:html -->
	<div class="faq-list">
		<?php foreach ( $data['faqs'] as $index => $faq ) : ?>
			<details class="faq-item reveal reveal-delay-<?php echo esc_attr( (string) min( $index, 3 ) ); ?>"<?php echo 0 === $index ? ' open' : ''; ?>>
				<summary class="faq-question"><?php echo mls_language_page_text( $faq['question'] ); ?></summary>
				<p class="faq-answer"><?php echo mls_language_page_text( $faq['answer'] ); ?></p>
			</details>
		<?php endforeach; ?>
	</div>
	<!-- /wp:html -->
</div>
<!-- /wp:group -->
	<?php
}

/**
 * Render the final placement/contact call to action.
 *
 * @param array<string, mixed> $data Language content.
 */
function mls_language_page_pattern_cta( array $data ): void {
	$cta_heading   = mls_language_page_copy( $data, 'cta_heading', 'Βρείτε το κατάλληλο πρόγραμμα ' . $data['greek_name'] );
	$cta_text      = mls_language_page_copy( $data, 'cta_text', 'Ξεκινήστε με τεστ κατάταξης ή επικοινωνήστε με τη σχολή για επίπεδα, μορφές φοίτησης και εξεταστικούς στόχους.' );
	$cta_primary   = mls_language_page_copy( $data, 'cta_primary', 'Κλείστε Τεστ Κατάταξης' );
	$cta_secondary = mls_language_page_copy( $data, 'cta_secondary', 'Επικοινωνήστε μαζί μας' );
	?>
<!-- wp:group {"className":"cta-band","align":"full","layout":{"type":"default"},"style":{"spacing":{"margin":{"top":"0"}}}} -->
<div class="wp-block-group alignfull cta-band">
	<!-- wp:group {"className":"cta-band-inner","layout":{"type":"constrained","contentSize":"720px"}} -->
	<div class="wp-block-group cta-band-inner">
		<!-- wp:heading {"level":2,"className":"cta-band-heading","textAlign":"center"} --><h2 class="wp-block-heading has-text-align-center cta-band-heading"><?php echo mls_language_page_text( $cta_heading ); ?></h2><!-- /wp:heading -->
		<!-- wp:paragraph {"className":"cta-band-sub","align":"center"} --><p class="has-text-align-center cta-band-sub"><?php echo mls_language_page_text( $cta_text ); ?></p><!-- /wp:paragraph -->
		<!-- wp:buttons {"className":"cta-band-actions","layout":{"type":"flex","justifyContent":"center","flexWrap":"wrap"}} -->
		<div class="wp-block-buttons cta-band-actions">
			<!-- wp:button {"className":"btn-primary"} --><div class="wp-block-button btn-primary"><a class="wp-block-button__link wp-element-button" href="/contact/"><?php echo mls_language_page_text( $cta_primary ); ?></a></div><!-- /wp:button -->
			<!-- wp:button {"className":"btn-ghost-hero"} --><div class="wp-block-button btn-ghost-hero"><a class="wp-block-button__link wp-element-button" href="/contact/"><?php echo mls_language_page_text( $cta_secondary ); ?></a></div><!-- /wp:button -->
		</div>
		<!-- /wp:buttons -->
	</div>
	<!-- /wp:group -->
</div>
<!-- /wp:group -->
	<?php
}

/**
 * Render every shared language-page section in the approved order.
 *
 * @param string $language Language route slug.
 */
function mls_render_language_page_body( string $language ): void {
	$data = mls_get_language_page_data( $language );

	if ( empty( $data ) ) {
		return;
	}

	mls_language_page_pattern_hero( $data );
	mls_language_page_pattern_quick_filters( $data );
	mls_language_page_pattern_benefits( $data );
	mls_language_page_pattern_audience( $data );
	mls_language_page_pattern_placement( $data );
	mls_language_page_pattern_formats( $data );
	mls_language_page_pattern_outcomes( $data );
	mls_language_page_pattern_faq( $data );
	mls_language_page_pattern_cta( $data );
}

/**
 * Register language body patterns when WordPress has a stale theme-pattern cache.
 */
function mls_register_language_page_body_patterns(): void {
	$languages = array(
		'greek-for-foreigners' => 'Greek for Foreigners',
		'french'                => 'French',
		'german'                => 'German',
		'spanish'               => 'Spanish',
		'italian'               => 'Italian',
		'russian'               => 'Russian',
		'chinese'               => 'Chinese',
		'japanese'              => 'Japanese',
		'turkish'               => 'Turkish',
		'arabic'                => 'Arabic',
	);
	$registry  = WP_Block_Patterns_Registry::get_instance();

	foreach ( $languages as $slug => $title ) {
		$pattern_name = 'mastermind-ls/language-' . $slug . '-body';

		if ( $registry->is_registered( $pattern_name ) ) {
			continue;
		}

		ob_start();
		mls_render_language_page_body( $slug );
		$content = (string) ob_get_clean();

		register_block_pattern(
			$pattern_name,
			array(
				'title'      => sprintf( '%s language page body', $title ),
				'categories' => array( 'featured' ),
				'inserter'   => false,
				'content'    => $content,
			)
		);
	}
}
add_action( 'init', 'mls_register_language_page_body_patterns', 20 );

/**
 * Keep older stored Greek page bodies on the shared renderers.
 */
function mls_register_greek_language_compatibility_patterns(): void {
	$data     = mls_get_language_page_data( 'greek-for-foreigners' );
	$patterns = array(
		'hero'      => static fn () => mls_language_page_pattern_hero( $data ),
		'levels'    => static fn () => mls_language_page_pattern_quick_filters( $data ),
		'benefits'  => static function () use ( $data ): void {
			mls_language_page_pattern_benefits( $data );
			mls_language_page_pattern_audience( $data );
		},
		'placement' => static fn () => mls_language_page_pattern_placement( $data ),
		'formats'   => static function () use ( $data ): void {
			mls_language_page_pattern_formats( $data );
			mls_language_page_pattern_outcomes( $data );
		},
		'faq'       => static fn () => mls_language_page_pattern_faq( $data ),
		'cta'       => static fn () => mls_language_page_pattern_cta( $data ),
	);
	$registry = WP_Block_Patterns_Registry::get_instance();

	foreach ( $patterns as $section => $render ) {
		$pattern_name = 'mastermind-ls/language-greek-for-foreigners-' . $section;

		if ( $registry->is_registered( $pattern_name ) ) {
			unregister_block_pattern( $pattern_name );
		}

		ob_start();
		$render();
		$content = (string) ob_get_clean();

		register_block_pattern(
			$pattern_name,
			array(
				'title'      => sprintf( 'Greek for Foreigners %s', ucfirst( $section ) ),
				'categories' => array( 'featured' ),
				'inserter'   => false,
				'content'    => $content,
			)
		);
	}
}
add_action( 'init', 'mls_register_greek_language_compatibility_patterns', 21 );
