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
    await Promise.all(
      PLATFORMS.map((p, i) =>
        checkPlatform(p, n, fetch, get(settings).proxyUrl || undefined).then((s) => {
          cards[i].status = s;
          cards[i].loading = false;
        }),
      ),
    );
    running = false;
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
    />
    <button onclick={run} disabled={!valid || running}>
      {t('social.check')}
    </button>
  </div>

  {#if cards.length > 0}
    <div class="grid">
      {#each cards as card (card.id)}
        <div class="card">
          <div class="card-head">
            <span class="platform">{card.name}</span>
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
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-3);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-sm);
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .platform {
    font-weight: 600;
    font-size: var(--text-sm);
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

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .open-link {
    font-size: var(--text-xs);
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 0.01ms;
    }
  }
</style>
