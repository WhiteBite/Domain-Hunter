<script lang="ts">
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from '../../i18n';
  import { settings } from '../store';
  import { clearAllData, KEYS, readJson, writeJson } from '../settings';
  import { DEFAULT_SETTINGS, type Settings } from '../../types';

  let savedToast = $state(false);
  let importError = $state('');
  let rateError = $state('');
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  function flashSaved(): void {
    savedToast = true;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (savedToast = false), 1500);
  }

  function patch<K extends keyof Settings>(key: K, value: Settings[K]): void {
    settings.update((s) => ({ ...s, [key]: value }));
    flashSaved();
  }

  function patchRate(currency: 'RUB' | 'EUR', value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      rateError = t('settings.rate.invalid');
      return;
    }
    rateError = '';
    settings.update((s) => ({ ...s, rates: { ...s.rates, [currency]: value } }));
    flashSaved();
  }

  function resetDefaults(): void {
    settings.set({
      ...DEFAULT_SETTINGS,
      rates: { ...DEFAULT_SETTINGS.rates },
      defaultTlds: [...DEFAULT_SETTINGS.defaultTlds],
    });
    rateError = '';
    flashSaved();
  }

  function download(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportData(): void {
    const data = {
      settings: get(settings),
      wordsets: readJson(KEYS.wordsets) ?? [],
    };
    download('domain-hunter-data.json', JSON.stringify(data, null, 2));
  }

  async function importData(file: File): Promise<void> {
    try {
      const parsed = JSON.parse(await file.text()) as {
        settings?: Partial<Settings>;
        wordsets?: unknown;
      };
      if (parsed.settings && typeof parsed.settings === 'object') {
        const incoming = parsed.settings;
        settings.update((s) => ({
          ...s,
          ...incoming,
          rates: { ...s.rates, ...(incoming.rates ?? {}) },
        }));
      }
      if (Array.isArray(parsed.wordsets)) {
        const existing = readJson<Array<{ id: string }>>(KEYS.wordsets) ?? [];
        const map = new Map(existing.map((ws) => [ws.id, ws]));
        for (const item of parsed.wordsets) {
          const ws = item as { id?: unknown; name?: unknown; words?: unknown };
          if (
            typeof ws.id === 'string' &&
            typeof ws.name === 'string' &&
            Array.isArray(ws.words)
          ) {
            map.set(ws.id, {
            id: ws.id,
            name: ws.name,
            words: (ws.words as unknown[]).filter((w): w is string => typeof w === 'string'),
          });
          }
        }
        writeJson(KEYS.wordsets, [...map.values()]);
      }
      importError = '';
      flashSaved();
    } catch {
      importError = t('settings.import.error');
    }
  }

  function clearData(): void {
    if (!confirm(t('settings.clear.confirm'))) return;
    clearAllData();
    settings.set({ ...DEFAULT_SETTINGS });
    location.reload();
  }

  onDestroy(() => clearTimeout(savedTimer));
</script>

<section class="settings">
  <h2>{t('settings.title')}</h2>

  <div class="card">
    <h3>{t('settings.appearance')}</h3>
    <div class="row">
      <div class="row-info">
        <label for="theme">{t('settings.theme')}</label>
      </div>
      <select
        id="theme"
        value={$settings.theme}
        onchange={(e) => patch('theme', e.currentTarget.value as Settings['theme'])}
      >
        <option value="system">{t('theme.system')}</option>
        <option value="light">{t('theme.light')}</option>
        <option value="dark">{t('theme.dark')}</option>
      </select>
    </div>
    <div class="row">
      <div class="row-info">
        <label for="lang">{t('settings.language')}</label>
      </div>
      <select
        id="lang"
        value={$settings.lang}
        onchange={(e) => patch('lang', e.currentTarget.value as Settings['lang'])}
      >
        <option value="en">English</option>
        <option value="ru">Русский</option>
      </select>
    </div>
    <div class="row">
      <div class="row-info">
        <label for="currency">{t('settings.currency')}</label>
      </div>
      <select
        id="currency"
        value={$settings.currency}
        onchange={(e) => patch('currency', e.currentTarget.value as Settings['currency'])}
      >
        <option value="USD">USD ($)</option>
        <option value="RUB">RUB (₽)</option>
        <option value="EUR">EUR (€)</option>
      </select>
    </div>
    <div class="row">
      <div class="row-info">
        <span class="label">{t('settings.rates')}</span>
        {#if rateError}
          <p class="error">{rateError}</p>
        {/if}
      </div>
      <span class="rates">
        <label class="inline">
          RUB
          <input
            type="number"
            min="1"
            step="0.01"
            value={$settings.rates.RUB}
            onchange={(e) => patchRate('RUB', Number(e.currentTarget.value))}
          />
        </label>
        <label class="inline">
          EUR
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={$settings.rates.EUR}
            onchange={(e) => patchRate('EUR', Number(e.currentTarget.value))}
          />
        </label>
      </span>
    </div>
  </div>

  <div class="card">
    <h3>{t('settings.engine')}</h3>
    <div class="row">
      <div class="row-info">
        <label for="concurrency">
          {t('settings.concurrency')}
          <span class="value-badge">{$settings.concurrency}</span>
        </label>
        <p class="hint">{t('settings.concurrency.hint')}</p>
      </div>
      <input
        id="concurrency"
        type="range"
        min="1"
        max="12"
        value={$settings.concurrency}
        oninput={(e) => patch('concurrency', Number(e.currentTarget.value))}
      />
    </div>
    <div class="row">
      <div class="row-info">
        <label for="ttl">{t('settings.cacheTtl')}</label>
        <p class="hint">{t('settings.cacheTtl.hint')}</p>
      </div>
      <input
        id="ttl"
        type="number"
        min="1"
        max="168"
        value={$settings.cacheTtlHours}
        onchange={(e) => patch('cacheTtlHours', Math.max(1, Number(e.currentTarget.value)))}
      />
    </div>
    <div class="row">
      <div class="row-info">
        <label for="proxy">{t('settings.proxy')}</label>
        <p class="hint">{t('settings.proxy.hint')}</p>
      </div>
      <input
        id="proxy"
        type="url"
        placeholder="https://your-worker.workers.dev/"
        value={$settings.proxyUrl}
        oninput={(e) => patch('proxyUrl', e.currentTarget.value)}
      />
    </div>
    <div class="row">
      <div class="row-info">
        <label for="ghtoken">{t('settings.githubToken')}</label>
        <p class="hint">{t('settings.githubToken.hint')}</p>
      </div>
      <input
        id="ghtoken"
        type="password"
        autocomplete="off"
        spellcheck="false"
        placeholder="ghp_… / github_pat_…"
        value={$settings.githubToken}
        oninput={(e) => patch('githubToken', e.currentTarget.value.trim())}
      />
    </div>
  </div>

  <div class="card">
    <h3>{t('settings.data')}</h3>
    <div class="actions">
      <button class="btn" onclick={exportData}>{t('settings.export')}</button>
      <label class="btn file-btn">
        {t('settings.import')}
        <input
          type="file"
          accept="application/json,.json"
          hidden
          onchange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void importData(file);
            e.currentTarget.value = '';
          }}
        />
      </label>
      <button class="btn danger" onclick={clearData}>{t('settings.clear')}</button>
      <button class="btn ghost" onclick={resetDefaults}>{t('settings.reset')}</button>
    </div>
    {#if importError}
      <p class="error">{importError}</p>
    {/if}
  </div>

  {#if savedToast}
    <div class="toast" role="status">{t('settings.saved')}</div>
  {/if}
</section>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 860px;
  }

  h2 {
    margin: 0;
    font-size: var(--text-xl);
  }

  .card {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .card h3 {
    margin: 0;
    font-size: var(--text-base);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .row-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 220px;
  }

  .row label,
  .row .label {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  select,
  input[type='number'],
  input[type='url'] {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    min-height: 40px;
    font-size: var(--text-sm);
  }

  .row > select,
  .row > input[type='number'],
  .row > input[type='url'] {
    width: 320px;
    max-width: 100%;
  }

  input[type='range'] {
    width: 320px;
    max-width: 100%;
    accent-color: var(--accent);
  }

  .rates {
    display: flex;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .inline input {
    width: 110px;
  }

  .value-badge {
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: var(--radius-full);
    padding: 0 var(--space-2);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .hint {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: background var(--dur) var(--ease);
  }

  .btn:hover {
    background: var(--bg-sunken);
  }

  .btn.danger {
    color: var(--red);
    border-color: color-mix(in srgb, var(--red) 40%, var(--border));
  }

  .file-btn {
    cursor: pointer;
  }

  .error {
    margin: 0;
    color: var(--red);
    font-size: var(--text-sm);
  }

  .toast {
    position: fixed;
    bottom: var(--space-5);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-elevated);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-lg);
    padding: var(--space-2) var(--space-5);
    font-size: var(--text-sm);
    z-index: 200;
  }
</style>
