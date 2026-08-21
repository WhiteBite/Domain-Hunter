<script lang="ts">
  import type { CheckStatus } from '../../types';
  import { get } from 'svelte/store';
  import { t } from '../../i18n';
  import { settings } from '../store';
  import { PLATFORMS, checkPlatform, isValidHandle, type SocialStatus } from '../../core/social';
  import StatusBadge from './StatusBadge.svelte';

  interface CardState {
    id: string;
    name: string;
    status: SocialStatus | null;
    loading: boolean;
    profileUrl: string;
  }

  let handle = $state('');
  let cards = $state<CardState[]>([]);
  let running = $state(false);

  const name = $derived(handle.trim().toLowerCase());
  const valid = $derived(isValidHandle(name));

  function badgeStatus(s: SocialStatus): CheckStatus {
    return s === 'free' ? 'available' : s === 'taken' ? 'taken' : 'unknown';
  }

  async function run(): Promise<void> {
    if (!valid || running) return;
    running = true;
    const n = name;
    cards = PLATFORMS.map((p) => ({
      id: p.id,
      name: p.name,
      status: null,
      loading: true,
      profileUrl: p.profileUrl(n),
    }));
    try {
      await Promise.all(
        PLATFORMS.map((p, i) =>
          checkPlatform(p, n, fetch, get(settings).proxyUrl || undefined, get(settings).githubToken || undefined)
            .catch(() => 'unknown' as SocialStatus)
            .then((s) => {
              const card = cards[i];
              if (card) {
                card.status = s;
                card.loading = false;
              }
            }),
        ),
      );
    } finally {
      running = false;
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && valid && !running) void run();
  }
</script>

<section class="social">
  <h2>{t('social.title')}</h2>
  <p class="desc">{t('social.desc')}</p>

  <div class="input-row">
    <input
      type="text"
      value={handle}
      oninput={(e) => (handle = (e.currentTarget as HTMLInputElement).value)}
      onkeydown={onKey}
      placeholder={t('social.placeholder')}
      autocomplete="off"
      spellcheck="false"
      aria-label={t('social.placeholder')}
      data-testid="social-input-handle"
    />
    <button onclick={run} disabled={!valid || running} type="button" data-testid="social-button-check">
      {t('social.check')}
    </button>
  </div>

  {#if cards.length > 0}
    <div class="grid">
      {#each cards as card (card.id)}
        <div class="card">
          <div class="card-head">
            <span class="platform">
              <!-- Inline brand glyphs (currentColor, no external assets). -->
              <svg class="platform-icon" viewBox="0 0 16 16" aria-hidden="true">
                {#if card.id === 'github'}
                  <path
                    fill="currentColor"
                    d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
                  />
                {:else if card.id === 'tiktok'}
                  <path
                    fill="currentColor"
                    d="M9.3 2h2.2c.1 1.2 1 2.2 2.2 2.4v2.2c-.8 0-1.6-.3-2.2-.7v4.4c0 2.4-1.8 4.2-4.2 4.2-1 0-2-.4-2.7-1-.7-.7-1.1-1.6-1.1-2.6 0-2.2 1.9-4 4.2-3.9v2.2c-1.1-.2-2 .5-2 1.7 0 .5.2 1 .5 1.3.4.3.8.5 1.3.5 1.2 0 2-.9 2-2.3V2z"
                  />
                {:else if card.id === 'x'}
                  <path
                    fill="currentColor"
                    d="M2.5 2h2.9l3 4.3L11.5 2h2.2l-4.2 5.5L14 14h-2.9l-3.2-4.6L4.7 14H2.5l4.4-5.8L2.5 2z"
                  />
                {:else if card.id === 'youtube'}
                  <path
                    fill="currentColor"
                    fill-rule="evenodd"
                    d="M1.8 4.2A1.7 1.7 0 0 1 3.5 2.5h9a1.7 1.7 0 0 1 1.7 1.7v7.6a1.7 1.7 0 0 1-1.7 1.7h-9a1.7 1.7 0 0 1-1.7-1.7V4.2zM6.8 5.8v4.4l3.8-2.2-3.8-2.2z"
                  />
                {:else if card.id === 'instagram'}
                  <path
                    fill="currentColor"
                    fill-rule="evenodd"
                    d="M2.5 4.5A2 2 0 0 1 4.5 2.5h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7zm1.3.2c0-.5.4-.9.9-.9h6.6c.5 0 .9.4.9.9v6.6c0 .5-.4.9-.9.9H4.7c-.5 0-.9-.4-.9-.9V4.7zM8 5.4A2.6 2.6 0 1 1 8 10.6 2.6 2.6 0 0 1 8 5.4zm0 1.3A1.3 1.3 0 1 0 8 9.3 1.3 1.3 0 0 0 8 6.7zm3.8-2.9a.6.6 0 1 1 0 1.2.6.6 0 0 1 0-1.2z"
                  />
                {:else if card.id === 'reddit'}
                  <circle cx="8" cy="9.3" r="4.2" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <circle cx="6.4" cy="8.9" r="0.9" fill="currentColor" />
                  <circle cx="9.6" cy="8.9" r="0.9" fill="currentColor" />
                  <path d="M8 5.1l1.3-2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                  <circle cx="9.9" cy="2.7" r="1" fill="currentColor" />
                  <circle cx="3.4" cy="7.2" r="1.2" fill="none" stroke="currentColor" stroke-width="1.2" />
                  <circle cx="12.6" cy="7.2" r="1.2" fill="none" stroke="currentColor" stroke-width="1.2" />
                {/if}
              </svg>
              {card.name}
            </span>
            {#if card.loading}
              <span class="loading">
                <span class="spinner" aria-hidden="true"></span>
                {t('common.loading')}
              </span>
            {:else}
              <StatusBadge status={badgeStatus(card.status!)} size="sm" />
            {/if}
          </div>
          <a
            class="open-link"
            href={card.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`social-card-link-${card.id}`}
          >
            {t('social.open')}
          </a>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .social {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  h2 {
    margin: 0;
    font-size: var(--text-xl);
  }

  .desc {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    max-width: 60ch;
  }

  .input-row {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  input {
    flex: 1 1 240px;
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    color: var(--text);
    font-size: var(--text-base);
  }

  input::placeholder {
    color: var(--text-tertiary);
  }

  button {
    padding: 0 var(--space-4);
    border: 1px solid var(--accent);
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
  }

  button:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .grid {
    display: grid;
    /* ≥240px cards, capped at 3 columns so the 6 platforms always land in
       balanced rows (3+3 at wide widths, never a 5+1 orphan). */
    grid-template-columns: repeat(
      auto-fill,
      minmax(max(240px, calc((100% - 2 * var(--space-3)) / 3)), 1fr)
    );
    gap: var(--space-3);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-md);
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .platform {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 600;
    font-size: var(--text-sm);
    color: var(--text);
  }

  .platform-icon {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--text-secondary);
  }

  .loading {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* Shared @keyframes spin lives in src/ui/chrome.css. */

  .open-link {
    font-size: var(--text-xs);
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 0.01ms;
    }
  }
</style>
