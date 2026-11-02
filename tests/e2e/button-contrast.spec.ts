import { test, expect, type Locator } from '@playwright/test';
import { openApp, navigateToTab, type TabId } from './helpers/setup';
import { assertNoNetworkLeaks, mockAll } from './helpers/mocks';
import { ianaBootstrap, porkbunPricing, cloudflarePricing, seedPricingTable } from './fixtures';

/** Resolve transparent backgrounds through ancestors and measure WCAG contrast. */
async function contrasts(locator: Locator): Promise<{ id: string | null; text: string; ratio: number }[]> {
  return locator.evaluateAll((buttons) => {
    const measure = (button: Element) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      const rgba = (color: string): number[] => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
      };
      const blend = (fg: number[], bg: number[]) => {
        const a = fg[3]! / 255;
        return [0, 1, 2].map((i) => fg[i]! * a + bg[i]! * (1 - a)).concat(255);
      };
      const stack: number[][] = [];
      let el: Element | null = button;
      let opacity = 1;
      while (el) {
        const style = getComputedStyle(el);
        stack.push(rgba(style.backgroundColor));
        opacity *= Number(style.opacity);
        el = el.parentElement;
      }
      let background = [255, 255, 255, 255];
      for (const color of stack.reverse()) background = blend(color, background);
      const text = rgba(getComputedStyle(button).color);
      text[3] = text[3]! * opacity;
      const foreground = blend(text, background);
      const luminance = (rgb: number[]) => {
        const channels = rgb.slice(0, 3).map((x) => {
          const c = x / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
      };
      const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
      return (a! + 0.05) / (b! + 0.05);
    };
    return buttons.filter((el) => {
      const style = getComputedStyle(el);
      return !!(el as HTMLElement).innerText.trim() && style.visibility !== 'hidden' && el.getClientRects().length > 0;
    }).map((el) => ({ id: el.getAttribute('data-testid'), text: (el as HTMLElement).innerText.trim(), ratio: measure(el) }));
  });
}

async function contrast(locator: Locator): Promise<number> {
  return (await contrasts(locator))[0]!.ratio;
}

for (const theme of ['light', 'dark'] as const) {
  test(`button contrast and interactions in ${theme} theme`, async ({ page }) => {
    await assertNoNetworkLeaks(page);
    await mockAll(page, { bootstrap: ianaBootstrap(), porkbun: porkbunPricing().pricing, cloudflare: cloudflarePricing() });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable(), 'dh:v1:settings': { theme } } });
    await navigateToTab(page, 'generators');
    const generate = page.getByTestId('gen-button-generate');
    const check = page.getByTestId('gen-button-check-now');
    await expect(generate).toBeEnabled();
    await expect(check).toBeDisabled();
    expect(await contrast(generate)).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(check)).toBeGreaterThanOrEqual(4.5);
    await generate.hover();
    await page.waitForTimeout(250);
    expect(await contrast(generate)).toBeGreaterThanOrEqual(4.5);
    await page.getByTestId('gen-button-tray-menu').click();
    const save = page.getByTestId('gen-button-save-set');
    await expect(save).toBeDisabled();
    expect(await contrast(save)).toBeGreaterThanOrEqual(4.5);
    await page.getByTestId('gen-button-tray-menu').click();
    await page.getByTestId('gen-input-keywords').fill('alpha beta');
    await generate.click();
    await expect(check).toBeEnabled();
    await page.waitForTimeout(250);
    expect(await contrast(check)).toBeGreaterThanOrEqual(4.5);
    await check.hover();
    await page.waitForTimeout(250);
    expect(await contrast(check)).toBeGreaterThanOrEqual(4.5);
    await page.getByTestId('gen-button-tray-menu').click();
    await expect(save).toBeEnabled();
    expect(await contrast(save)).toBeGreaterThanOrEqual(4.5);

    await navigateToTab(page, 'social');
    const social = page.getByTestId('social-button-check');
    await expect(social).toBeDisabled();
    expect(await contrast(social)).toBeGreaterThanOrEqual(4.5);
    await page.getByTestId('social-input-handle').fill('example');
    await expect(social).toBeEnabled();
    await page.waitForTimeout(250);
    expect(await contrast(social)).toBeGreaterThanOrEqual(4.5);
    await social.hover();
    await page.waitForTimeout(250);
    expect(await contrast(social)).toBeGreaterThanOrEqual(4.5);

    await navigateToTab(page, 'check');
    await page.getByTestId('tld-picker-toggle').click();
    await page.waitForTimeout(250);
    const pickerLow = (await contrasts(page.locator('button'))).filter((item) => item.ratio < 4.5);
    expect(pickerLow, `${theme} zone picker`).toEqual([]);
    await page.getByTestId('tld-picker-toggle').click();

    // Check text buttons on all initially visible tabs.
    for (const tab of ['check', 'generators', 'drops', 'prices', 'social', 'settings', 'about'] as TabId[]) {
      await navigateToTab(page, tab);
      await page.waitForTimeout(250);
      const low = (await contrasts(page.locator('button'))).filter((item) => item.ratio < 4.5);
      expect(low, `${theme} ${tab} buttons with insufficient contrast`).toEqual([]);
    }
  });
}

for (const width of [390, 768]) {
  test(`Russian generator controls fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await assertNoNetworkLeaks(page);
    await mockAll(page, { bootstrap: ianaBootstrap(), porkbun: porkbunPricing().pricing, cloudflare: cloudflarePricing() });
    await openApp(page, { seed: { 'dh:v1:pricing': seedPricingTable(), 'dh:v1:settings': { lang: 'ru' } } });
    await navigateToTab(page, 'generators');
    for (const id of ['gen-button-generate', 'gen-button-check-now', 'gen-button-tray-menu']) {
      const button = page.getByTestId(id);
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  });
}
