---
version: alpha
name: Mastermind Language School

description: >
  Design system for Mastermind Language School — a bold, energetic language education brand
  combining vivid violet-purple primary tones with golden amber accents and confident white
  typography on both light and dark surface contexts.

colors:
  primary: "#931a81"
  primary-dark: "#6b1260"
  primary-deep: "#3d0a37"
  on-primary: "#ffffff"
  secondary: "#9335b6"
  on-secondary: "#ffffff"
  tertiary: "#fdb927"
  tertiary-dark: "#d06a00"
  on-tertiary: "#1a0818"
  green: "#01983d"
  green-dark: "#017a30"
  on-green: "#ffffff"
  error: "#cf2e2e"
  on-error: "#ffffff"
  surface: "#ffffff"
  surface-2: "#eae9ed"
  surface-dim: "#f8f7fa"
  on-surface: "#1a0818"
  on-surface-muted: "#5a4d58"
  on-surface-variant: "#374151"
  neutral: "#918891"
  outline: "rgba(147, 26, 129, 0.12)"
  dark-bg: "#1a0818"
  dark-surface: "#2a1228"

typography:
  headline-display:
    fontFamily: Source Sans 3
    fontSize: 57.6px
    fontWeight: "900"
    lineHeight: 60.48px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Source Sans 3
    fontSize: 35.2px
    fontWeight: "700"
    lineHeight: 42px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Source Sans 3
    fontSize: 28px
    fontWeight: "700"
    lineHeight: 34px
  headline-sm:
    fontFamily: Source Sans 3
    fontSize: 22px
    fontWeight: "600"
    lineHeight: 28px
  body-lg:
    fontFamily: Figtree
    fontFallback: Nunito
    fontSize: 17px
    fontWeight: "400"
    lineHeight: 28px
  body-md:
    fontFamily: Figtree
    fontFallback: Nunito
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 22.4px
  body-sm:
    fontFamily: Figtree
    fontFallback: Nunito
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 18px
  label-lg:
    fontFamily: Source Sans 3
    fontSize: 15.2px
    fontWeight: "700"
    lineHeight: 25px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Figtree
    fontFallback: Nunito
    fontSize: 14px
    fontWeight: "500"
    lineHeight: 21px
  label-sm:
    fontFamily: Source Serif 4
    fontSize: 11.52px
    fontWeight: "700"
    lineHeight: 19px
    letterSpacing: 0.08em

rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 16px
  xl: 24px
  full: 9999px

spacing:
  xs: 0.5rem
  sm: 1rem
  md: 1.5rem
  lg: 2.5rem
  xl: 4rem
  xxl: 6rem
  gutter: 1.5rem
  margin: 1rem

shadows:
  sm: "0 1px 4px rgba(0, 0, 0, 0.06)"
  md: "0 4px 20px rgba(147, 26, 129, 0.10), 0 1px 4px rgba(0, 0, 0, 0.06)"
  lg: "0 12px 40px rgba(147, 26, 129, 0.22), 0 2px 8px rgba(0, 0, 0, 0.10)"
  xl: "12px 12px 50px rgba(0, 0, 0, 0.4)"

components:
  button-primary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.on-primary}"
  button-cta:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: "12.8px 28.8px"
  button-cta-hover:
    backgroundColor: "{colors.tertiary-dark}"
    textColor: "{colors.on-tertiary}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    padding: "0.80rem 1.8rem"
  button-ghost-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  card-hover:
    backgroundColor: "{colors.surface}"
  badge:
    backgroundColor: "{colors.outline}"
    textColor: "{colors.primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.md}"
    padding: "4.8px 12px"
  nav-link:
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    padding: "6.4px 13.6px"
  nav-link-hover:
    textColor: "{colors.primary}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "0.5rem 0.75rem"
---

## Brand & Style

Mastermind Language School presents a bold, energetic identity built around vivid violet-purple tones and warm golden amber accents. The brand projects approachability and academic credibility simultaneously — confident enough to attract ambitious learners, warm enough to welcome newcomers to language study.

The visual voice is **Contemporary Academic**: structured grid layouts and clear typographic hierarchy anchor the interface in professionalism, while the saturated primary palette and generous use of white-on-color contrast deliver the high-energy feel of an institution that gets results. The design avoids the sterility of corporate minimalism and leans into rich color as a statement of vitality.

A light-mode surface system forms the structural base, with bold full-bleed violet and dark sections used prominently in hero areas and calls to action.

## Colors

The palette is anchored by a deep violet-purple primary and a complementary golden amber tertiary that functions as the signature call-to-action accent. A secondary purple-violet supports secondary actions and interactive states. A fresh green provides a success and achievement signal.

- **Primary ({colors.primary}):** The defining brand hue. Use for headings over light surfaces, navigation hover states, table headers, and section backgrounds where the brand voice must come through most strongly.
- **Primary Dark ({colors.primary-dark}):** The hover state deepening for primary-backed elements, maintaining contrast integrity on interaction.
- **Primary Deep ({colors.primary-deep}):** The deepest violet, reserved for footer or highest-contrast branded regions.
- **Secondary ({colors.secondary}):** A lighter violet-purple used for primary interactive buttons in their resting state and link elements.
- **Tertiary ({colors.tertiary}):** Golden amber. The primary CTA accent, used for high-priority action buttons and link-style calls to action. Its warmth creates immediate visual priority against violet backgrounds.
- **Tertiary Dark ({colors.tertiary-dark}):** The hover-state darkening of the golden amber CTA button.
- **Green ({colors.green}):** Used sparingly to communicate success, availability, or positive results.
- **Surface ({colors.surface}):** Pure white cards and modal backgrounds.
- **Surface Dim ({colors.surface-dim}):** The near-white off-white page background, subtly warm to prevent stark coldness.
- **On-Surface ({colors.on-surface}):** Near-black deep plum-tinted text for all primary body content on light backgrounds.
- **On-Surface Muted ({colors.on-surface-muted}):** Secondary and supporting text, captions, and metadata.
- **Dark Background ({colors.dark-bg}):** The deepest dark surface, matching the primary text color, used for dark hero and footer sections.
- **Dark Surface ({colors.dark-surface}):** A slightly elevated dark purple panel for layering within dark sections.

## Typography

This design system employs three typefaces in a deliberate hierarchy:

- **Source Sans 3** (via `--font-display`): Used for all headlines, display text, navigation labels on display contexts, and CTA button labels. Its geometric clarity and wide weight range (up to 900) give headlines the authority and visual impact the brand demands.
- **Source Serif 4** (via `--font-body`): Used for card body copy, secondary button labels, and longer-form reading content. The serif choice adds academic warmth and differentiates reading content from structural UI elements.
- **Figtree**: Loaded as a self-hosted webfont across the full weight range (300–900). Used for interactive UI elements — primary button labels, body text in component contexts, and navigation links — where a clean, modern sans-serif ensures legibility at small scales.

**Font Fallback Note:** Figtree is available on Google Fonts. Source Sans 3 and Source Serif 4 are also Google Fonts. No proprietary font substitutions are required for this system.

Typography token summary:

- **headline-display:** Source Sans 3, 57.6px, weight 900, line-height 60.48px — reserved for hero sections and major page titles.
- **headline-lg:** Source Sans 3, 35.2px, weight 700 — section headings.
- **headline-md / headline-sm:** Source Sans 3, graduating weights for subsection titles.
- **body-lg / body-md / body-sm:** Figtree at regular weight for UI body text.
- **label-lg:** Source Sans 3, weight 700, for CTA button labels and prominent interactive text.
- **label-md:** Figtree, weight 500, for standard button labels and UI labels.
- **label-sm:** Source Serif 4, weight 700, with generous letter-spacing — for badges, tags, and table headers.

## Layout & Spacing

The layout system uses a content max-width of **800px** for standard reading columns and a wide max-width of **1280px** for full-bleed feature sections and grid layouts. Block gap defaults to **24px** throughout.

The spacing scale follows a progressive rem-based sequence:

- **xs (0.5rem):** Inline element gaps, icon-to-label spacing.
- **sm (1rem):** Internal padding for compact components, list item gaps.
- **md (1.5rem):** Default card padding, form group spacing.
- **lg (2.5rem):** Section subsection separation.
- **xl (4rem):** Major section vertical rhythm.
- **xxl (6rem):** Hero and top-of-page breathing room.

A 4px base unit underlies the scale. All spacing decisions should resolve to multiples of 4px. The gutter between grid columns is {spacing.gutter}.

## Elevation & Depth

Elevation in this system is expressed through tinted shadows that carry the brand's violet hue, giving depth a warmth and personality rather than a neutral gray character.

- **sm shadow:** A subtle single-layer shadow ({shadows.sm}) used for minimally elevated elements like dividers and inline chips.
- **md shadow ({shadows.md}):** The default card resting shadow. Combines a violet-tinted ambient layer with a tight neutral diffusion layer. This shadow is defined by `--shadow-card` in the CSS root.
- **lg shadow ({shadows.lg}):** Applied on card hover states (`--shadow-hover`). The violet tint intensifies and the spread increases, providing clear tactile lift feedback.
- **xl shadow ({shadows.xl}):** Reserved for modals, drawers, and overlay surfaces requiring maximum separation from the page.

Cards transition from `{shadows.md}` at rest to `{shadows.lg}` on hover, providing feedback without layout shift. Dark sections use no shadow — instead, tonal elevation is achieved through `{colors.dark-surface}` panels layered over `{colors.dark-bg}`.

## Shapes

The shape language balances accessibility (clear tap targets on rounded elements) with enough structural angularity to convey precision and academic rigor.

- **none (0px):** Not used in primary brand components; reserved for full-bleed sections and separators.
- **sm ({rounded.sm}, 4px):** Applied to primary interactive buttons in their default computed state. Keeps buttons feeling structured and confident rather than overly pill-like.
- **md ({rounded.md}, 8px):** Used for CTA buttons (the golden amber action), ghost buttons, nav chips, and badge elements. The slightly larger radius signals interactivity and friendliness.
- **lg ({rounded.lg}, 16px):** The standard card radius (`--radius-card`). All content cards, profile containers, and elevated panels use this value for a modern, contained appearance.
- **xl ({rounded.xl}, 24px):** Reserved for large featured cards or image containers requiring a more prominent soft framing.
- **full ({rounded.full}, 9999px):** Available for pill badges or highly specialized promotional labels.

## Components

### Buttons

The system defines three primary button patterns:

**Primary Button** (`button-primary`): Violet-purple ({colors.secondary}) background with white text and a 4px radius. Used for standard actions within content sections and forms. On hover, deepens to {colors.primary-dark} per computed browser styles.

**CTA Button** (`button-cta`): Golden amber ({colors.tertiary}) background with deep plum text ({colors.on-tertiary}) and an 8px radius. This is the highest-priority action button — used in hero sections and prominent calls to action. It carries a warm golden box shadow at rest and intensifies on hover to {colors.tertiary-dark}.

**Ghost Button** (`button-ghost`): Transparent background with white text and a white 2.5px border. Used over colored or dark hero backgrounds where the primary surface would conflict with a filled button. On hover, the background fills to white and text shifts to {colors.primary}.

All buttons use a `0.22s ease` transition for background and shadow changes.

### Cards

Cards (`card`) sit on {colors.surface} (white) with a {rounded.lg} radius and the violet-tinted {shadows.md} shadow. A thin 1px border using {colors.outline} provides structural definition without visual weight. On hover, the shadow elevates to {shadows.lg}, giving clear interactive feedback. Card body text uses {typography.body-lg} (Source Serif 4) for a readable, warm reading experience.

### Badges

Badges (`badge`) use a semi-transparent violet tint background ({colors.outline}) with {colors.primary} text and {typography.label-sm} (Source Serif 4, bold, wide letter-spacing). The 8px radius and compact padding (4.8px 12px) keep them legible and tight without crowding adjacent content.

### Navigation

Nav links (`nav-link`) render in near-black {colors.on-surface} at 14px Figtree semi-bold. On hover, they shift to {colors.primary} without underline, providing a clean and brand-consistent active signal. The padding of 6.4px top/bottom and 13.6px left/right ensures comfortable click targets.

### Form Inputs

Input fields (`input-field`) use a flat white background with no border-radius and neutral gray placeholder text. Focus states apply a 2px outline. The minimal styling integrates cleanly into both light and structured form layouts without competing with surrounding content.

## Do's and Don'ts

**Do's:**

- Use {colors.primary} as the dominant violet hue for section backgrounds, table headers, and navigational hover states to anchor the brand identity.
- Use {colors.tertiary} exclusively for the highest-priority CTA buttons and action links — its golden warmth creates immediate visual hierarchy against violet surfaces.
- Apply {shadows.md} to all resting card states and {shadows.lg} on hover to deliver consistent tactile elevation feedback.
- Use {typography.headline-display} at weight 900 for hero headlines — the visual impact of Source Sans 3 Black is a core brand expression.
- Maintain {rounded.lg} on all content cards to preserve the system's modern, contained aesthetic.
- Use {colors.surface-dim} as the default page background rather than pure white to keep the overall palette warm and coherent.
- Pair Figtree (body-md, label-md) for interactive UI elements and Source Serif 4 (body-lg) for reading content to maintain the system's deliberate typographic contrast.

**Don'ts:**

- Do not use {colors.tertiary} for decorative backgrounds or illustration fills — reserve it strictly for action elements to protect its signal value.
- Do not reduce button border-radius below {rounded.sm} on primary buttons or below {rounded.md} on CTA and ghost buttons — this breaks the shape hierarchy.
- Do not place {colors.on-surface-muted} text on {colors.surface-dim} without verifying WCAG AA contrast — the low-contrast muted tone is intended only for supplementary metadata.
- Do not mix {colors.dark-bg} dark sections with unshadowed white cards — always apply at least {shadows.md} when surfacing white cards over dark backgrounds.
- Do not use Source Serif 4 for button labels in primary interactive contexts — Figtree and Source Sans 3 are the correct choices for action text.
- Do not apply the {rounded.full} radius to standard content cards — it is reserved for pill-style labels and highly specialized promotional elements only.
- Do not use font weights below 400 in any UI context — the lightest active weight in the loaded Figtree font stack is 400 (Regular).
