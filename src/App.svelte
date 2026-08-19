<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, setLocaleFromBrowser, t, LOCALES } from './i18n';
  import { activeTab, settings, type TabId } from './ui/store';
  import { loadSettings, saveSettings } from './ui/settings';
  import { applyTheme, watchSystemTheme } from './ui/theme';
  import { clickOutside } from './ui/clickoutside';
  import type { Locale } from './types';
  import './ui/tokens.css';
  import CheckTab from './ui/components/CheckTab.svelte';
  import GeneratorsTab from './ui/components/GeneratorsTab.svelte';
  import DropsTab from './ui/components/DropsTab.svelte';
  import SocialTab from './ui/components/SocialTab.svelte';
  import SettingsTab from './ui/components/SettingsTab.svelte';
  import AboutTab from './ui/components/AboutTab.svelte';

  settings.set(loadSettings());
  let current = $state($settings);
  settings.subscribe((value) => {
    current = value;
    applyTheme(value.theme);
    locale.set(value.lang);
    saveSettings(value);
  });

  let tab = $state<TabId>('check');
  activeTab.subscribe((value) => (tab = value));

  // Work tabs (check/generators/drops) use the wider content cap so the
  // two-pane workspace has room; text tabs (social/settings/about) stay narrow.
  const wideTabs: ReadonlySet<TabId> = new Set(['check', 'generators', 'drops']);
  let isWide = $derived(wideTabs.has(tab));

  const tabs: { id: TabId; labelKey: string }[] = [
    { id: 'check', labelKey: 'tab.check' },
    { id: 'generators', labelKey: 'tab.generators' },
    { id: 'drops', labelKey: 'tab.drops' },
    { id: 'social', labelKey: 'tab.social' },
    { id: 'settings', labelKey: 'tab.settings' },
    { id: 'about', labelKey: 'tab.about' },
  ];

  function selectTab(id: TabId) {
    activeTab.set(id);
  }

  function toggleTheme() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    settings.update((s) => ({ ...s, theme: isDark ? 'light' : 'dark' }));
  }

  // Language dropdown (replaces the old cycle-on-click button: with 5
  // locales, cycling was painful — the menu lists all locales at once).
  let langMenuOpen = $state(false);
  let langToggleEl: HTMLButtonElement | null = $state(null);

  function toggleLangMenu() {
    langMenuOpen = !langMenuOpen;
  }

  function closeLangMenu(refocus: boolean) {
    if (!langMenuOpen) return;
    langMenuOpen = false;
    if (refocus) langToggleEl?.focus();
  }

  function selectLang(code: Locale) {
    settings.update((s) => ({ ...s, lang: code }));
    closeLangMenu(true);
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && langMenuOpen) {
      e.preventDefault();
      closeLangMenu(true);
    }
  }

  onMount(() => {
    setLocaleFromBrowser();
    settings.set(loadSettings());
    return watchSystemTheme(() => $settings.theme);
  });

  $effect(() => {
    document.title = t('app.title.html');
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<a class="skip-link" href="#main-content" data-testid="app-skip-link">{t('a11y.skip')}</a>
<div class="shell" class:wide={isWide} data-testid="app-shell">
  <header class="header">
    <div class="header-inner">
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="3" />
          <circle cx="16" cy="16" r="4" fill="currentColor" />
        </svg>
        <div class="brand-text">
          <strong>{t('app.name')}</strong>
          <span class="tagline">{t('app.tagline')}</span>
        </div>
      </div>
      <div class="header-actions">
        <div class="lang-wrap" use:clickOutside={() => closeLangMenu(false)}>
          <button
            class="icon-btn"
            class:active={langMenuOpen}
            bind:this={langToggleEl}
            onclick={toggleLangMenu}
            aria-label={t('app.language.aria')}
            title={t('app.language.aria')}
            aria-haspopup="menu"
            aria-expanded={langMenuOpen}
            data-testid="app-lang-toggle"
          >
            <span class="lang-code">{current.lang.toUpperCase()}</span>
            <svg class="lang-chevron" class:rot={langMenuOpen} viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          {#if langMenuOpen}
            <div class="lang-menu" role="menu" aria-label={t('app.language.aria')}>
              {#each LOCALES as loc (loc.code)}
                <button
                  class="lang-item"
                  class:current={current.lang === loc.code}
                  type="button"
                  role="menuitem"
                  aria-current={current.lang === loc.code ? 'true' : undefined}
                  onclick={() => selectLang(loc.code)}
                  data-testid={`app-lang-${loc.code}`}
                >
                  <span class="lang-check" aria-hidden="true">
                    {#if current.lang === loc.code}
                      <svg viewBox="0 0 16 16"><path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                    {/if}
                  </span>
                  <span class="lang-native">{loc.nativeName}</span>
                  <span class="lang-item-code nums">{loc.code.toUpperCase()}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <button class="icon-btn" onclick={toggleTheme} aria-label={t('theme.label')} title={t('theme.label')} data-testid="app-theme-toggle">
          <svg class="theme-icon icon-moon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M13.2 9.6A5.8 5.8 0 0 1 6.4 2.8a5.8 5.8 0 1 0 6.8 6.8Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
          <svg class="theme-icon icon-sun" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="2.8" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path
              d="M8 1.6v1.8M8 12.6v1.8M1.6 8h1.8M12.6 8h1.8M3.5 3.5l1.3 1.3M11.2 11.2l1.3 1.3M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <nav class="tabs" role="tablist" aria-label={t('app.name')}>
      {#each tabs as tabDef (tabDef.id)}
        <button
          role="tab"
          class="tab"
          class:active={tab === tabDef.id}
          aria-selected={tab === tabDef.id}
          onclick={() => selectTab(tabDef.id)}
          data-testid={`app-tab-${tabDef.id}`}
        >
          {t(tabDef.labelKey)}
        </button>
      {/each}
    </nav>
  </header>

  <main class="content" id="main-content" tabindex="-1">
    {#if tab === 'check'}
      <CheckTab />
    {:else if tab === 'generators'}
      <GeneratorsTab />
    {:else if tab === 'drops'}
      <DropsTab />
    {:else if tab === 'social'}
      <SocialTab />
    {:else if tab === 'settings'}
      <SettingsTab />
    {:else}
      <AboutTab />
    {/if}
  </main>

  <footer class="footer">
    <span>{t('footer.note')}</span>
    <a href="https://github.com/WhiteBite/Domain-Hunter" target="_blank" rel="noopener noreferrer" data-testid="app-footer-github">
      GitHub
    </a>
  </footer>
</div>

<style>
  .skip-link {
    position: absolute;
    left: -9999px;
    top: 0;
    z-index: 100;
    background: var(--accent);
    color: var(--on-accent);
    padding: var(--space-2) var(--space-4);
    border-radius: 0 0 var(--radius-md) 0;
    font-size: var(--text-sm);
  }

  .skip-link:focus {
    left: 0;
  }

  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .header {
    position: sticky;
    top: 0;
    z-index: 20;
    background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
  }

  .header-inner {
    max-width: var(--content-max);
    margin: 0 auto;
    padding: var(--space-3) var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--accent);
  }

  .brand-mark {
    width: 28px;
    height: 28px;
    flex: none;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  .brand-text strong {
    color: var(--text);
    font-size: var(--text-base);
  }

  .tagline {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .header-actions {
    display: flex;
    gap: var(--space-2);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    border-radius: var(--radius-md);
    min-width: 40px;
    min-height: 36px;
    padding: 0 var(--space-3);
    cursor: pointer;
    font-size: var(--text-sm);
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
  }

  .icon-btn:hover {
    background: var(--bg-sunken);
    color: var(--text);
  }

  .icon-btn.active {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }

  /* Language dropdown — trigger + popover listing all locales. */
  .lang-wrap {
    position: relative;
    display: inline-flex;
  }

  .icon-btn .lang-code {
    font-weight: 500;
  }

  .lang-chevron {
    width: 12px;
    height: 12px;
    display: block;
    transition: transform var(--dur) var(--ease);
  }

  .lang-chevron.rot {
    transform: rotate(180deg);
  }

  .lang-menu {
    position: absolute;
    top: calc(100% + var(--space-1));
    right: 0;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2);
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    border-radius: 8px;
    box-shadow: var(--shadow-pop);
    z-index: 100;
  }

  .lang-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: none;
    background: transparent;
    color: var(--text);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    cursor: pointer;
    text-align: left;
    min-height: 32px;
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
  }

  .lang-item:hover {
    background: var(--bg-sunken);
  }

  .lang-item.current {
    color: var(--accent);
  }

  .lang-check {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }

  .lang-check svg {
    width: 14px;
    height: 14px;
  }

  .lang-native {
    flex: 1;
  }

  .lang-item-code {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .lang-item.current .lang-item-code {
    color: var(--accent);
    opacity: 0.8;
  }

  .theme-icon {
    width: 16px;
    height: 16px;
    display: block;
  }

  .icon-sun {
    display: none;
  }

  :global([data-theme='dark']) .icon-sun {
    display: block;
  }

  :global([data-theme='dark']) .icon-moon {
    display: none;
  }

  .tabs {
    max-width: var(--content-max);
    margin: 0 auto;
    padding: 0 var(--space-4);
    display: flex;
    gap: var(--space-1);
    overflow-x: auto;
  }

  .tab {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    transition: color var(--dur) var(--ease);
  }

  .tab:hover {
    color: var(--text);
  }

  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .content {
    flex: 1;
    width: 100%;
    max-width: var(--content-max);
    margin: 0 auto;
    padding: var(--space-5) var(--space-4) var(--space-7);
  }

  /* Work tabs widen the content cap and align the header/tab bar to it. */
  .shell.wide .header-inner,
  .shell.wide .tabs,
  .shell.wide .content {
    max-width: var(--content-max-wide);
  }

  .footer {
    border-top: 1px solid var(--border);
    padding: var(--space-4);
    display: flex;
    justify-content: center;
    gap: var(--space-4);
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  @media (max-width: 640px) {
    .tagline {
      display: none;
    }
  }
</style>
