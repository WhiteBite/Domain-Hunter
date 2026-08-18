<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, setLocaleFromBrowser, t } from './i18n';
  import { activeTab, settings, type TabId } from './ui/store';
  import { loadSettings, saveSettings } from './ui/settings';
  import { applyTheme, watchSystemTheme } from './ui/theme';
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

  function toggleLang() {
    settings.update((s) => ({ ...s, lang: s.lang === 'en' ? 'ru' : 'en' }));
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

<a class="skip-link" href="#main-content">{t('a11y.skip')}</a>
<div class="shell">
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
        <button class="icon-btn" onclick={toggleLang} aria-label={t('lang.label')} title={t('lang.label')}>
          {current.lang === 'en' ? 'RU' : 'EN'}
        </button>
        <button class="icon-btn" onclick={toggleTheme} aria-label={t('theme.label')} title={t('theme.label')}>
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
    <a href="https://github.com/WhiteBite/Domain-Hunter" target="_blank" rel="noopener noreferrer">
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
