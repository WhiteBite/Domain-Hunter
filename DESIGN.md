# DESIGN.md — Domain Hunter design system

Codified from `src/ui/tokens.css` and existing components. This is the contract
for the 3-wave UI redesign: wave 1 (this doc + token additions) lays the
foundation, wave 2 redesigns the Check tab, wave 3 the Generators tab. Token
values are authoritative in `tokens.css`; this doc names the ramps, rules, and
primitives so later waves stay consistent.

## 1. Principles

- **Calm, product-grade.** Linear/Vercel/Raycast tier (per SPEC §12), no copying.
  Subtle borders and shadows, micro-transitions (150–200ms), visible focus rings.
- **Tokens, not literals.** Every color, size, radius, shadow, and motion value
  references a CSS variable in `tokens.css`. No hardcoded hex/sizes in components.
- **Light is default; dark overrides via `[data-theme='dark']`.** All component
  colors key off `--bg` / `--text` / `--accent` ramps, never raw palette entries.
- **Three-state honesty.** The status model (available / probably_available /
  unknown) drives color semantics; a wrong "available" is worse than "unknown".
  Green = confirmed available, amber = uncertain, red = error/promo-trap.
- **Tabular numerals everywhere numeric.** Prices, counts, elapsed time, and any
  column that aligns digits use `font-variant-numeric: tabular-nums` (see §3).
- **No external assets.** No CDN, no webfonts from network, no analytics. Fonts
  ship inlined; the CSP meta in `index.html` stays intact.
- **`file://` and sub-path safe.** All paths relative (`base: './'`); the wide
  layout must not break the single-file build or offline use.

## 2. Color tokens

All names are CSS variables in `tokens.css`. Light values are defaults;
`[data-theme='dark']` overrides the same names. Components reference only these
names — never the hex values.

### Elevation philosophy

Darkness is the native medium. Depth is built from four layered cues, not from
heavy drop shadows:

1. **Background luminance stepping** — four surface tiers form a clear
   luminance ramp. On dark: sunken (`#08090b`) < page (`#0b0c0f`) < elevated
   (`#14161a`) < overlay (`#1a1d22`). On light the order inverts for the top
   two: sunken (`#eef0f4`) < page (`#f6f7f9`) < overlay (`#fbfcfd`) < elevated
   (`#ffffff`). Cards sit one step above the page; popovers/modals sit two
   steps above.
2. **Semi-transparent white borders** — on dark, borders are low-opacity white
   (`rgba(255,255,255,.05/.08/.14)`) so they read as edge light, not as drawn
   lines. On light, the same pattern uses low-opacity near-black
   (`rgba(16,24,40,.06/.10/.16)`).
3. **Inset top highlight** — `--inset-highlight` adds a 1px top-edge glow to
   lifted surfaces (cards, buttons, popovers), simulating light from above.
   On dark it is `inset 0 1px 0 rgba(255,255,255,.04)`; on light,
   `inset 0 1px 0 rgba(255,255,255,.6)`. Apply it as the first layer in a
   `box-shadow` stack: `box-shadow: var(--inset-highlight), var(--shadow-1)`.
4. **Tinted layered shadows** — shadows are tinted with the surface tone
   (black on dark, `rgba(23,32,54,*)` on light) and layered (1px + 6px + 8px)
   for natural depth without harsh edges.

### Background ramp
| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f6f7f9` | `#0b0c0f` | App canvas (page) |
| `--bg-elevated` | `#ffffff` | `#14161a` | Cards, table body, inputs, buttons |
| `--bg-sunken` | `#eef0f4` | `#08090b` | Insets, table header, recessed zones |
| `--bg-overlay` | `#fbfcfd` | `#1a1d22` | Hover surfaces, popovers, modals |

### Border ramp
| Token | Light | Dark | Role |
|---|---|---|---|
| `--border-subtle` | `rgba(16,24,40,.06)` | `rgba(255,255,255,.05)` | Dividers, faint separators |
| `--border` | `rgba(16,24,40,.10)` | `rgba(255,255,255,.08)` | Default hairline |
| `--border-strong` | `rgba(16,24,40,.16)` | `rgba(255,255,255,.14)` | Hover / emphasis |

### Text ramp
| Token | Light | Dark | Role |
|---|---|---|---|
| `--text` | `#161b26` | `#eef1f6` | Primary (never pure black/white) |
| `--text-secondary` | `#3d4657` | `#c7cdd8` | Labels, secondary copy |
| `--text-tertiary` | `#5d6675` | `#8a91a0` | Hints, counts, muted meta |
| `--text-quaternary` | `#8b93a1` | `#5f6673` | Disabled, placeholder, scrollbar hover |

### Accent ramp
| Token | Light | Dark | Role |
|---|---|---|---|
| `--accent` | `#5e6ad2` | `#5e6ad2` | Primary actions, focus ring, solid fills |
| `--accent-hover` | `#4d58c0` | `#7c86ff` | Hover on accent fills (darkens on light, brightens on dark) |
| `--accent-pressed` | `#4d58c0` | `#4d58c0` | Active/pressed on accent fills |
| `--accent-soft` | `rgba(94,106,210,.10)` | `rgba(94,106,210,.12)` | Tinted bg for selected chips, soft fills |
| `--accent-text` | `#4f5ac8` | `#a3adff` | Links, accent-colored text on surface |
| `--on-accent` | `#ffffff` | `#ffffff` | Text/icon on accent fills (always white) |

**Primary button rule (both themes):** `background: var(--accent)`,
`color: var(--on-accent)` (white). Hover uses `var(--accent-hover)`. Active
should `translateY(1px) scale(0.99)` (wave 2 component change). The dark-theme
primary is indigo with white text — never pale lavender with dark text.

### Semantic ramps (each has a `-soft` tint for backgrounds)
| Token group | Light fg / soft | Dark fg / soft / solid | Meaning |
|---|---|---|---|
| `--green` / `--green-soft` / `--green-solid` | `#15803c` / `rgba(21,128,60,.08)` / `#15803c` | `#6ee7a8` / `rgba(47,191,113,.10)` / `#2fbf71` | Success: available, cheap price, promo |
| `--amber` / `--amber-soft` | `#9a6a10` / `rgba(154,106,16,.10)` | `#f5b453` / `rgba(245,180,83,.10)` | Warn: unknown, probably, premium-likely |
| `--red` / `--red-soft` | `#cf4444` / `rgba(207,68,68,.10)` | `#f47070` / `rgba(244,112,112,.10)` | Danger: error, stop, promo-trap, high price |
| `--neutral-soft` | `rgba(16,24,40,.06)` | `rgba(255,255,255,.06)` | Taken status, min-years flag, neutral pills |

`--green-solid` is for solid fills (status badge dots, solid badges) where the
text color would be too bright; `--green` is for text and borders.

### Row tints (NEW)
| Token | Light | Dark | Role |
|---|---|---|---|
| `--row-tint-available` | `rgba(21,128,60,.04)` | `rgba(47,191,113,.05)` | Available row background wash |
| `--row-tint-error` | `rgba(207,68,68,.04)` | `rgba(244,112,112,.05)` | Error row background wash |

These are the canonical row-tint values. Existing `color-mix` usage in
`ResultsTable` (`color-mix(in srgb, var(--green-soft) 50%, transparent)`)
produces a similar but not identical tint; wave 2 should migrate row tints to
these tokens directly.

### Price-tier aliases
`--price-cheap` = `--green`, `--price-mid` = `--amber`, `--price-high` = `--red`.
Used by `ResultsTable.priceColor()` to color first-year price cells by tier
(cheap ≤ $5, mid ≤ $15, high > $15, per SPEC §12).

### Shadows & focus
| Token | Light | Dark | Role |
|---|---|---|---|
| `--shadow-sm` / `--shadow-1` | `0 1px 2px rgba(23,32,54,.06)` | `0 1px 2px rgba(0,0,0,.4)` | 1px card lift (table wrap, badges on hover) |
| `--shadow-md` | `0 2px 8px rgba(23,32,54,.08), 0 1px 2px rgba(23,32,54,.06)` | `0 2px 8px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.4)` | Tooltip/popover |
| `--shadow-lg` | `0 8px 28px rgba(23,32,54,.12)` | `0 8px 28px rgba(0,0,0,.5)` | Drawer / modal |
| `--shadow-2` | `0 6px 20px rgba(23,32,54,.10)` | `0 6px 20px rgba(0,0,0,.45)` | Mid-depth lift |
| `--shadow-pop` | `0 0 0 1px rgba(23,32,54,.08), 0 8px 24px rgba(23,32,54,.12)` | `0 0 0 1px rgba(255,255,255,.08), 0 8px 24px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.4)` | Popover/modal with border ring |

`--shadow-1/2/pop` are the new canonical names; `--shadow-sm/md/lg` are kept
for backward compatibility (wave 2 may migrate components to the new names).

- `--inset-highlight` — top-edge glow for lifted surfaces. Apply as the first
  layer: `box-shadow: var(--inset-highlight), var(--shadow-1)`.
- `--focus-ring` — `0 0 0 2px rgba(94,106,210,.55), 0 0 12px rgba(94,106,210,.25)`
  (accent ring + soft glow), applied via `:focus-visible` globally. Components
  must not remove it.
- `::selection` — `rgba(94,106,210,.35)` (accent-tinted text selection).

### Scrollbars (NEW)
`color-scheme: light/dark` on the root makes native scrollbars track the theme.
Additional explicit styling:
- `scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent`
  (Firefox).
- `::-webkit-scrollbar` 10px, thumb `var(--scrollbar-thumb)` with
  `--radius-full`, hover `var(--scrollbar-thumb-hover)`.
- Dark: thumb `rgba(255,255,255,.16)`, hover `.26`.
- Light: thumb `rgba(16,24,40,.16)`, hover `.26`.

### Native control theming (NEW)

All native form controls are themed to match the surface — no harsh white
squares or UA-default chrome.

- **`color-scheme`** — `:root` sets `light`, `[data-theme='dark']` sets `dark`.
  This makes UA chrome (scrollbars, date pickers, form-control backgrounds)
  follow the active theme.
- **`select`, `input`, `textarea`** — `background: var(--bg-elevated)` globally,
  preventing white flashes in dark mode. Components that want a sunken input
  override locally with `var(--bg-sunken)`.
- **`input[type='checkbox']`** — `appearance: none`, 16×16px, `border-radius: 4px`,
  `border: 1px solid var(--border-strong)`, transparent background. Checked →
  `background: var(--accent)`, accent border, white check via inline data-URI
  SVG (no network). Hover → accent border. Focus-visible → `--focus-ring`.
- **`input[type='radio']`** — same as checkbox but `border-radius: var(--radius-full)`;
  checked shows a white dot via inline data-URI SVG.
- **`a`** — `color: var(--accent-text)` (brighter indigo for readability on dark:
  `#a3adff` vs the solid `#5e6ad2` which is too dark for text on dark surfaces).

## 3. Typography

### Font families
- `--font-sans` — `Inter Variable, system-ui, -apple-system, 'Segoe UI', Roboto,
  'Helvetica Neue', Arial, sans-serif`. The only network-loaded font; inlined in
  the single-file build. Used for all body, labels, and UI chrome.
- **Mono (domain names):** `--font-mono` is referenced by `GeneratorsTab.tray-chip`
  and `DropsTab` but is **not yet defined** in `tokens.css` — they fall back to
  `ui-monospace, Consolas, monospace`. **Rule:** domain-name-like tokens
  (generator candidates, drops list, and — in wave 3 — generator candidate
  rows) use the mono stack to aid visual scanning. **Debt:** define
  `--font-mono` in `tokens.css` in wave 2/3 so the fallback is centralized
  (see §7).

### Type scale (rem, root 16px)
| Token | Size | Use |
|---|---|---|
| `--text-xs` | 0.75 (12px) | Badges, chips, table headers, hints, counts |
| `--text-sm` | 0.8125 (13px) | Body secondary, buttons, inputs, table cells |
| `--text-base` | 0.9375 (15px) | Body, brand name |
| `--text-lg` | 1.125 (18px) | Empty-state title |
| `--text-xl` | 1.375 (22px) | Tab page title (`h2`) |
| `--text-2xl` | 1.75 (28px) | Reserved (not currently used in components) |

Body line-height: 1.55. Headings (`h1`/`h2`/`h3`): 600 weight,
`letter-spacing: -0.02em` (global rule in `tokens.css`). Labels/buttons: 500
weight. Badge/chip line-height: 1.2–1.4.

### Tabular numerals (NEW rule)
**All numeric and price cells use `font-variant-numeric: tabular-nums`.** This
keeps digits column-aligned in streaming results, price comparisons, counts,
and elapsed time.

- `ResultsTable .price-cell` already sets it (first-year, renewal, TCO columns).
- A new global utility `.nums { font-variant-numeric: tabular-nums; }` is added
  to `tokens.css` for any other numeric display (run progress counts, history
  meta, generator tray counts, drops stats).
- Apply `.nums` to: run-state counters, history entry counts, freshness labels
  when they include numbers, generator tray count, drops table stats. Wave 2/3
  will add the class where needed; do not restyle tables otherwise.

## 4. Spacing, radius, motion

### Spacing (4px grid)
`--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 24 ·
`--space-6` 32 · `--space-7` 48. All component padding, gaps, and margins use
these. No arbitrary `13px` / `7px` values.

### Radii
`--radius-sm` 6 (chips, small buttons, table row action buttons) ·
`--radius-md` 10 (cards, inputs, primary buttons, tooltip) ·
`--radius-lg` 14 (reserved) ·
`--radius-full` 999 (pills, badges, filter toggles, search inputs).

### Motion
- `--ease` — `cubic-bezier(0.25, 0.1, 0.25, 1)` (ease-out, product-standard).
- `--dur` — `160ms`. Used for all color, background, border, opacity, and
  transform transitions. Hover/focus state changes use `all var(--dur) var(--ease)`.
- `prefers-reduced-motion: reduce` collapses all transitions/animations to
  `0.01ms` (global rule in `tokens.css`).
- **GPU-composited only.** Animate `transform`, `opacity`, `filter` — never
  `width`, `height`, `padding`, `top`/`left` (layout properties). The existing
  `.spin` keyframe (`rotate(360deg)`) and `.cta:hover .arrow` (`translateX`) are
  the reference patterns.

## 5. Layout rules

### Content width caps
| Cap | Value | Tabs |
|---|---|---|
| `--content-max` | 1280px | `social`, `settings`, `about` (text tabs) |
| `--content-max-wide` | 1680px | `check`, `generators`, `drops` (work tabs) |

`App.svelte` applies `class:wide` to `.shell` when the active tab is a work
tab. The wide cap flows to `.header-inner`, `.tabs`, and `.content` via
`.shell.wide` descendant selectors, so the header brand/actions, the tab bar,
and the content column all align at 1680px on work tabs. Text tabs keep the
default 1280px cap. The footer is centered and unaffected.

### Sticky header
`.header` is `position: sticky; top: 0; z-index: 20` with a translucent
`color-mix` background and `backdrop-filter: blur(10px)`. This stays unchanged.
The tab bar (`.tabs`) sits inside the header and scrolls horizontally on narrow
viewports.

### Two-pane workspace pattern (work tabs)
The Check tab already uses a two-column grid (`.grid`:
`minmax(280px, 1fr) 2fr`), collapsing to one column under 860px. The left column
holds the input + TLD picker + run controls + history; the right column holds
the progress bar + results table.

**Wave 2/3 target:** formalize this as a **fixed left rail (340px) + fluid
right pane** for both Check and Generators tabs, so the two work tabs share
the same master-detail geometry. The left rail hosts configuration and lists;
the right pane hosts the primary working surface (results table, candidate
list). The rail collapses to a slide-over drawer under a breakpoint (wave 2
defines the exact px; reference: CheckTab currently collapses at 860px).

### Footer
Centered, `--text-xs`, top border. Not widened.

## 6. Component primitives

### As-is inventory (extracted from current components)

#### Button variants
There is no shared `.btn` base in `tokens.css`; each component defines its own.
This is accepted debt (§7). The variants in use:

| Class | Where | Anatomy | States |
|---|---|---|---|
| `.btn.primary` | RunControls, CheckTab resume, DropsTab, GeneratorsTab | Accent fill (`--accent`), `--on-accent` (white) text, 40px min-height, `--radius-md`, icon+label | default → hover(`--accent-hover`) → active(translateY(1px)+scale(.99), wave 2) → disabled(opacity 0.4) |
| `.btn.stop` | RunControls | `--red` fill, `--on-accent` text | default → hover(darken 12%) |
| `.btn.ghost` | CheckTab resume | Transparent, `--text-secondary` | default → hover |
| `.btn` (base) | RunControls | `--bg-elevated`, `--border`, `--text` | default → hover(`--bg-sunken`) |
| `.action` | CheckTab header | `--bg-elevated`, `--border`, `--text-secondary`, 36px, icon+label | default → hover(`--bg-sunken`) → disabled(opacity 0.4) |
| `.action-small` | ResultsTable copy-selected | Accent pill fill, `--on-accent`, 32px | default → hover(opacity 0.9) |
| `.icon-btn` | App header (lang/theme) | `--bg-elevated`, `--border`, 40×36px | default → hover(`--bg-sunken`) |
| `.action-btn` | ResultsTable row actions | 32×32, `--bg-elevated`, `--border`, `--text-secondary`, icon-only | default → hover(`--bg-sunken`) → disabled(opacity 0.5); `.active` = accent-soft fill |
| `.buy-btn` | ResultsTable buy link | Accent-soft fill, accent border | default → hover(accent fill, `--on-accent`) |
| `.tab` | App nav | Transparent, bottom-border indicator | default → hover(`--text`) → `.active`(accent text + accent bottom-border) |
| `.filter` / `.preset` | ResultsTable / TldPicker | Pill, `--bg-elevated`, `--border` | default → hover(`--border-strong`) → `.active`(accent-soft fill, accent border/text) |
| `.cta` | EmptyState | `--bg-elevated`, `--border`, accent text, 40px, icon+label | default → hover(`--bg-sunken`) |
| `.hint-dismiss` | CheckTab hint | Accent-soft pill, accent text | default |

**Primary button rule (both themes):** `.btn.primary` uses
`background: var(--accent)` with `color: var(--on-accent)` (white). On dark this
is indigo (`#5e6ad2`) with white text — never pale lavender with dark text.
Hover uses `var(--accent-hover)` (brighter `#7c86ff` on dark, darker `#4d58c0`
on light). The active state (`translateY(1px) scale(0.99)`) is a wave 2
component change; the token values are in place now.

#### Chip
- `.chip` (TldPicker) — `--bg-elevated`, `--border`, `--radius-sm`, 32px
  min-height. States: default → hover(`--bg-sunken`) → `.selected`(accent-soft
  fill, accent border/text). Holds `.tld` (bold), optional `.price`, `.flag`
  (experimental/min-years/premium), `.dot-unstable`.
- `.chip-tag` (ResultsTable inline) — 10px, `--radius-full`, fit-width. Variants:
  `.promo` (green), `.trap` (red).
- `.tray-chip` (GeneratorsTab candidate) — `--bg-sunken`, `--radius-sm`, mono
  font. States: default → hover(red border/text, signals removal).

#### Status badge
`StatusBadge.svelte` — `.badge` pill (`--radius-full`, `--text-xs`, dot + label).
Variants map 1:1 to `CheckStatus`:
- `.available` — green-soft fill, green text/border, solid dot.
- `.probably` — transparent fill, green text, hollow (bordered) dot.
- `.taken` — neutral-soft fill, secondary text, tertiary dot.
- `.unknown` — amber-soft fill, amber text/border, solid dot.
- `.error` — red-soft fill, red text/border, solid dot.
Sizes: `.md` (default), `.sm` (11px, used in table rows). Badges with a tooltip
key gain `tabindex="0"` and a hover shadow.

#### Table (ResultsTable)
- `.table-wrap` — scroll container, `--bg-elevated`, `--border`, `--radius-md`,
  `--shadow-sm`, `max-height: 72vh`, thin scrollbar.
- Sticky header: `thead th` `position: sticky; top: 0`, `--bg-elevated` with
  bottom border shadow.
- Zebra: `tbody tr:nth-child(even)` gets a `color-mix` of `--bg-sunken`.
- Available rows: `tr.available` gets `--green-soft` tint (50% → 80% on hover).
- Sort buttons: `.sort-btn` with `.sort-arrow` (opacity-gated, rotates 180°
  for desc). `aria-sort` on `<th>`.
- Price cells: `.price-cell` right-aligned, `tabular-nums`. `.price-stack`
  (flex column) holds price + promo/trap chips + coupon line.
- Detail row: `tr.detail-row` (colspan=7), `--bg-sunken`, shows DigMyName
  premium warning + cheapest registrar + buy link. This is the existing
  expandable-row pattern — wave 2's row overflow menu and wave 3's expandable
  candidate row should follow the same colspan + tinted-background approach.
- Sticky domain column on mobile (`@media max-width: 700px`).
- Row actions: `.actions` inline-flex, right-aligned: favorite, copy, recheck,
  detail-toggle, buy.

#### Tooltip
`Tooltip.svelte` — `.tip-wrap` (inline-flex, relative), hover/focus-gated.
`.tip` popover: `--bg-elevated`, `--border`, `--radius-md`, `--shadow-md`,
`--text-xs`, max 280px, `pointer-events: none`, with `.tip-arrow` (45°-rotated
square). `Escape` dismisses. This is the reference for popover/flyout geometry.

### NEW primitives (to be built in waves 2–3)

These do not exist yet. Later waves implement them against the tokens above and
the anatomy/states defined here.

#### Popover multiselect (wave 2 — TLD picker replacement)
Replaces the always-visible TLD chip grid with a trigger + floating panel.
- **Anatomy:** trigger button (`.action`-style, shows count + chevron) →
  floating panel (`--bg-elevated`, `--border`, `--radius-md`, `--shadow-lg`,
  `--radius-lg` corner optional) containing a search input, preset row, and a
  scrollable option list (max-height ~340px, thin scrollbar like `.chips`).
  Each option is a `.chip`-style row with `.selected` state.
- **Positioning:** anchored below the trigger, flips above if viewport edge is
  near; `z-index: 100` (matches tooltip). Close on `Escape`, outside-click, or
  trigger toggle.
- **States:** trigger default → hover(`--bg-sunken`) → open(`.active` accent).
  Option default → hover(`--bg-sunken`) → selected(accent-soft). Search input
  follows `.search` focus ring (`0 0 0 3px var(--accent-soft)`).
- **A11y:** `role="listbox"` on the list, `role="option"` + `aria-selected` on
  rows (mirror current TldPicker), trigger `aria-expanded`/`aria-controls`.

#### Slide-over drawer (wave 2 — history; wave 3 — candidate detail)
A right-edge drawer for history list and per-candidate detail.
- **Anatomy:** overlay scrim (semi-transparent, click-to-close) + panel sliding
  in from the right. Panel: `--bg-elevated`, full-height, width 380–420px
  (max 90vw), `--shadow-lg`, left border. Header row (title + close button),
  scrollable body, optional footer actions.
- **Motion:** `transform: translateX(100%) → translateX(0)` over `--dur`
  (GPU-composited). Scrim fades `opacity`. Honor `prefers-reduced-motion`
  (global rule already collapses to 0.01ms).
- **States:** closed (translateX(100%), scrim hidden) → open (translateX(0),
  scrim visible). Close button = `.icon-btn` style.
- **A11y:** `role="dialog"`, `aria-modal="true"`, focus trap inside, `Escape`
  closes, return focus to trigger on close.

#### Row overflow "⋯" menu (wave 2 — results table)
Replaces the inline row-action cluster when the table is dense.
- **Anatomy:** a `.action-btn`-sized "⋯" trigger at the row's actions cell →
  floating menu (`--bg-elevated`, `--border`, `--radius-md`, `--shadow-md`)
  listing the row actions (copy, recheck, favorite, detail, buy) as menu items.
- **States:** trigger default → hover(`--bg-sunken`) → open(`.active`). Menu
  item default → hover(`--bg-sunken`). Destructive items (none currently, but
  reserve red text for future "remove") use `--red`.
- **Positioning:** anchored to the trigger, flips at viewport edges. `Escape`
  or outside-click closes.
- **A11y:** trigger `aria-haspopup="menu"` + `aria-expanded`; menu items
  `role="menuitem"`, roving `tabindex`.

#### Expandable table row (wave 3 — generators candidate list)
A list/table row that expands to show per-candidate detail (availability
preview, price, source technique).
- **Anatomy:** base row (candidate name in mono, source badge, chevron) → on
  activate, an expanded section appears below (colspan pattern or a sibling
  panel) showing detail content. Reference: `ResultsTable .detail-row`
  (colspan=7, `--bg-sunken` background, `--space-2`/`--space-3` padding).
- **States:** collapsed (chevron right) → hover(`--bg-sunken`) → expanded
  (chevron rotated 180°, detail panel visible). The expanded panel uses
  `--bg-sunken` to read as recessed.
- **Motion:** chevron `transform: rotate(180deg)` over `--dur`. Panel
  appears/disappears — if animated, use `opacity` + `max-height` (GPU-safe
  via `transform` preferred; avoid animating `height` directly).
- **A11y:** row `aria-expanded` on the trigger cell; expanded content is in
  the tab order when open.

## 7. Accepted debt

- **`--font-mono` undefined.** Referenced by `GeneratorsTab.tray-chip` and
  `DropsTab` via `var(--font-mono, ui-monospace, Consolas, monospace)` but never
  declared in `tokens.css`. Wave 2/3 should add `--font-mono` to `:root` with
  the same fallback stack so the mono ramp is centralized.
- **No shared button base.** Each component redefines `.btn` / `.action` /
  `.action-btn` locally with near-identical rules. A future wave should extract
  a `.btn` primitive in `tokens.css` (or a shared component) and have variants
  extend it. Until then, new buttons copy the closest existing variant.
- **Primary button active state.** The token values for `.btn.primary`
  (`--accent`, `--on-accent`, `--accent-hover`, `--accent-pressed`) are in
  place, but the active `translateY(1px) scale(0.99)` transform is not yet
  applied in any component. Wave 2 should add it to each `.btn.primary` rule.
- **Shadow naming duplication.** `--shadow-sm/md/lg` (existing) and
  `--shadow-1/2/pop` (new) overlap in role. `--shadow-1` ≈ `--shadow-sm`,
  `--shadow-2` ≈ `--shadow-lg`, and `--shadow-pop` is new (popover with border
  ring). Wave 2 should migrate components to the canonical `--shadow-1/2/pop`
  names and deprecate the old aliases.
- **Row-tint migration.** `ResultsTable` uses `color-mix(in srgb,
  var(--green-soft) 50%/80%, transparent)` for available-row tints. The new
  `--row-tint-available` / `--row-tint-error` tokens produce similar but not
  identical values. Wave 2 should migrate row tints to the tokens directly.
- **`.content` padding is uniform.** Work tabs and text tabs use the same
  `--space-5 --space-4 --space-7` padding. Wide work tabs may want larger
  horizontal gutters at the 1680px cap — deferred to wave 2/3 evaluation.
- **Layout breakpoints differ per tab.** CheckTab collapses its grid at 860px;
  GeneratorsTab and DropsTab have their own. Wave 2/3 should converge on a
  shared workspace breakpoint when formalizing the 340px left rail.
- **`--text-2xl` (1.75rem) is unused.** Reserved for a future hero/landing
  heading; kept in the scale for completeness.
- **Color-mix usage.** Several components use `color-mix(in srgb, ...)` for
  hover/zebra tints (e.g. `tr.available` at 50%/80% `--green-soft`). This is
  fine and consistent; new primitives should prefer the named `-soft` tokens
  over inventing new mixes.
