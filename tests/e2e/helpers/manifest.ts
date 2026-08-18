/**
 * Domain Hunter E2E — Authoritative testid registry.
 *
 * Single source of truth for every data-testid in the app.
 * Specs select by `data-testid` ONLY (never visible text — i18n-safe).
 *
 * Naming convention: `{component}-{element}-{qualifier}`
 *   component: app, check, results, tld, gen, drops, social, settings, about, status, tooltip
 *   element:   tab, button, input, textarea, select, toggle, chip, link, badge, row, bar,
 *              shell, summary, card, option
 *   qualifier: purpose (start, stop, share, csv, copy, recheck, detail, buy, filter-all, ...)
 *
 * Static testids are hardcoded as literal `data-testid="..."` attributes.
 * Dynamic testids are constructed in {#each} blocks via template literals
 * `data-testid={`prefix-${item.id}`}`; their prefixes are listed below.
 */

export const ALL_TESTIDS = [
  // ---- App.svelte ----
  'app-shell', // root container
  'app-skip-link', // skip-to-content link
  'app-lang-toggle', // language toggle button
  'app-theme-toggle', // theme toggle button
  'app-footer-github', // footer GitHub link

  // ---- AboutTab.svelte ----
  'about-link-github', // GitHub link

  // ---- CheckTab.svelte ----
  'check-button-resume', // resume banner "yes" button
  'check-button-discard', // resume banner "no" button
  'check-button-hint-dismiss', // hint strip dismiss button
  'check-button-share', // share button
  'check-button-csv', // CSV export button
  'check-hint-strip', // hint strip container (role=note)
  'check-panel-toggle', // left input panel collapse/expand toggle
  'history-clear', // clear history button

  // ---- DomainInput.svelte ----
  'check-input-domains', // domain textarea
  'check-preview', // parsed-count preview container (aria-live)
  'check-preview-count', // "N names × M zones = K checks" span
  'check-preview-invalid', // invalid-count warning span
  'check-preview-warn', // too-many warning span

  // ---- EmptyState.svelte ----
  'check-button-empty-cta', // CTA button to generators tab

  // ---- RunControls.svelte ----
  'check-button-start', // start run button
  'check-button-stop', // stop run button
  'check-toggle-ignore-cache', // ignore-cache checkbox

  // ---- ProgressBar.svelte ----
  'check-bar-progress', // run progress container (role=status)

  // ---- Tooltip.svelte ----
  'tooltip-trigger', // outer wrapper (has event handlers)
  'tooltip-trigger-inner', // inner trigger span (tabindex=0)

  // ---- TldPicker.svelte ----
  'tld-input-search', // TLD search input
  'tld-preset-popular', // "popular" preset button
  'tld-preset-cheapest', // "cheapest" preset button
  'tld-preset-all', // "all" preset button
  'tld-button-clear', // clear selection button
  'tld-selected-count', // "N selected" live region

  // ---- ResultsTable.svelte ----
  'results-filter-all', // filter: all
  'results-filter-available', // filter: available
  'results-filter-taken', // filter: taken
  'results-filter-problems', // filter: problems
  'results-filter-favorites', // filter: favorites
  'results-filter-suggest-available', // suggest-available shortcut
  'results-search', // results search input
  'results-select-all', // select-all-visible checkbox (thead)
  'results-copy-selected', // copy selected domains button
  'results-copy-favorites', // copy all favorites button
  'results-sort-name', // sort by name
  'results-sort-status', // sort by status
  'results-sort-price', // sort by first-year price
  'results-sort-renew', // sort by renewal price
  'results-sort-tco', // sort by 3-year TCO
  'results-showing-count', // "showing X of Y" live region

  // ---- GeneratorsTab.svelte ----
  'gen-input-keywords', // keywords text input
  'gen-button-generate', // generate-all button
  'gen-summary-params', // <details> params summary toggle
  'gen-textarea-affixes', // affixes textarea
  'gen-select-mode', // combinator mode select
  'gen-input-syllable-count', // syllable count number input
  'gen-button-affixes-reset', // reset affixes button
  'gen-input-tray-filter', // tray filter search input
  'gen-select-tray-sort', // tray sort select
  'gen-button-check-now', // check-now button
  'gen-input-set-name', // new set name input
  'gen-button-save-set', // save set button
  'gen-button-clear-tray', // clear tray button
  'gen-button-copy-tray', // copy tray button
  'gen-summary-sets', // <details> saved-sets summary toggle
  'gen-sets-controls', // sets controls span (onclick stopPropagation)
  'gen-button-export-sets', // export sets button
  'gen-input-import-sets', // import sets file input
  'gen-tray-count', // tray candidate-count badge
  'gen-tray-projected', // projected checks paragraph
  'gen-tray-empty', // empty-tray message
  'gen-toast', // transient toast (role=status)

  // ---- SettingsTab.svelte ----
  'settings-select-theme', // theme select
  'settings-select-lang', // language select
  'settings-select-currency', // currency select
  'settings-input-rate-rub', // RUB rate number input
  'settings-input-rate-eur', // EUR rate number input
  'settings-range-concurrency', // concurrency range input
  'settings-input-ttl', // cache TTL number input
  'settings-input-proxy', // proxy URL input
  'settings-link-github-verify', // GitHub device-flow verify link
  'settings-button-github-disconnect', // GitHub disconnect button
  'settings-input-github-token', // GitHub token password input
  'settings-button-github-connect', // GitHub connect button
  'settings-button-export', // export data button
  'settings-input-import', // import data file input
  'settings-button-clear', // clear data button
  'settings-button-reset', // reset defaults button

  // ---- SocialTab.svelte ----
  'social-input-handle', // handle text input
  'social-button-check', // check button

  // ---- DropsTab.svelte ----
  'drops-input-search', // search input
  'drops-select-tld', // TLD filter select
  'drops-button-add-all', // add-all button
] as const;

export const DYNAMIC_TESTID_PREFIXES = [
  // ---- App.svelte ----
  'app-tab-', // tab buttons: app-tab-{tabId} (check|generators|drops|social|settings|about)

  // ---- TldPicker.svelte ----
  'tld-chip-', // TLD chips: tld-chip-{tld}

  // ---- ResultsTable.svelte ----
  'results-row-', // result rows: results-row-{domain}
  'results-row-link-', // domain links: results-row-link-{domain}
  'results-row-fav-', // favorite star buttons: results-row-fav-{domain}
  'results-row-select-', // multi-select checkboxes: results-row-select-{domain}
  'history-entry-', // history restore buttons: history-entry-{index}
  'results-row-copy-', // copy buttons: results-row-copy-{domain}
  'results-row-recheck-', // recheck buttons: results-row-recheck-{domain}
  'results-row-detail-', // detail buttons: results-row-detail-{domain}
  'results-row-buy-', // buy links: results-row-buy-{domain}
  'results-row-detail-buy-', // detail buy links: results-row-detail-buy-{domain}

  // ---- GeneratorsTab.svelte ----
  'gen-toggle-', // tech toggle checkboxes: gen-toggle-{key} (combinator|mutations|hacks|syllables)
  'gen-tray-chip-', // tray chips: gen-tray-chip-{name}
  'gen-tray-fav-', // tray chip favorite stars: gen-tray-fav-{name}
  'gen-more-', // tray section show more/less: gen-more-{section}
  'gen-theme-chip-', // theme category chips: gen-theme-chip-{id}
  'gen-theme-word-', // theme word buttons: gen-theme-word-{word}
  'gen-set-load-', // saved set load buttons: gen-set-load-{name}
  'gen-set-delete-', // saved set delete buttons: gen-set-delete-{name}

  // ---- DropsTab.svelte ----
  'drops-row-fav-', // drops favorite stars: drops-row-fav-{domain}
  'drops-row-copy-', // drops copy buttons: drops-row-copy-{domain}
  'drops-row-add-', // drops add buttons: drops-row-add-{domain}

  // ---- SocialTab.svelte ----
  'social-card-link-', // platform open links: social-card-link-{platform}

  // ---- StatusBadge.svelte ----
  'status-badge-', // root span: status-badge-{status} (available|taken|probably_available|unknown|error)
] as const;

export type TestId = (typeof ALL_TESTIDS)[number];
