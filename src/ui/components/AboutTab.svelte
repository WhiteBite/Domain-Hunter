<script lang="ts">
  import { t } from '../../i18n';
</script>

<section class="about">
  <h2>{t('about.title')}</h2>
  <p class="lead">{t('about.what')}</p>

  <div class="card">
    <h3>{t('about.how.title')}</h3>
    <p>{t('about.how.body')}</p>
    <p class="note">{t('about.snapshot')}</p>
  </div>

  <div class="card">
    <h3>{t('about.privacy.title')}</h3>
    <p>{t('about.privacy.body')}</p>
  </div>

  <div class="card">
    <h3>{t('about.prices.title')}</h3>
    <p>{t('about.prices.body')}</p>
  </div>

  <div class="card footer-card">
    <p>{t('about.license')}</p>
    <a
      class="btn"
      href="https://github.com/WhiteBite/Domain-Hunter"
      target="_blank"
      rel="noopener noreferrer"
      data-testid="about-link-github"
    >
      {t('about.github')}
    </a>
  </div>
</section>

<style>
  .about {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 860px;
  }

  h2 {
    margin: 0;
    font-size: var(--text-xl);
  }

  .lead {
    margin: 0;
    color: var(--text-secondary);
  }

  .card {
    padding: var(--space-4) var(--space-5);
  }

  .card h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-base);
  }

  .card p {
    margin: 0 0 var(--space-2);
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .card p:last-child {
    margin-bottom: 0;
  }

  .note {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
  }

  .footer-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--text-sm);
    font-weight: 500;
    text-decoration: none;
    transition: background var(--dur) var(--ease);
  }

  .btn:hover {
    background: var(--accent-hover);
    text-decoration: none;
  }
</style>
