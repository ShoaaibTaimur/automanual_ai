import { Page } from 'playwright';
import { BrowserRunner } from './browser-runner';
import { ScreenshotCapture } from './screenshot-capture';

export interface DiscoveredRoute {
  label: string;
  url: string;
  path: string;
}

export interface DiscoveredElement {
  type: 'button' | 'input' | 'table' | 'form' | 'tab' | 'link';
  text?: string;
  selector?: string;
  actionHint?: string;
}

export interface RawSectionData {
  name: string;
  route: string;
  url: string;
  title: string;
  headings: string[];
  elements: DiscoveredElement[];
  screenshotPath?: string;
}

export class DiscoveryEngine {
  private screenshotCapture = new ScreenshotCapture();

  async extractNavigationLinks(page: Page, baseUrl: string): Promise<DiscoveredRoute[]> {
    const currentUrl = page.url();
    const baseOrigin = new URL(baseUrl).origin;
    const currentOrigin = (() => {
      try { return new URL(currentUrl).origin; } catch { return baseOrigin; }
    })();

    const links = await page.$$eval(
      'nav a, aside a, header a, [role="navigation"] a, [class*="nav" i] a, [class*="menu" i] a, [class*="sidebar" i] a, a',
      (elements, { baseOrigin, currentOrigin }) => {
        const results: { label: string; url: string; path: string }[] = [];
        const seen = new Set<string>();

        const getRoot = (hostname: string) => {
          const parts = (hostname || '').toLowerCase().split('.');
          return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
        };

        const currRoot = getRoot(new URL(currentOrigin).hostname);
        const baseRoot = getRoot(new URL(baseOrigin).hostname);

        for (const el of elements) {
          const href = el.getAttribute('href');
          if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;

          try {
            const resolved = new URL(href, currentOrigin);
            const candRoot = getRoot(resolved.hostname);

            // Permissive matching: allow links on current origin, base origin, or same root domain
            const isAllowed =
              resolved.origin === currentOrigin ||
              resolved.origin === baseOrigin ||
              candRoot === currRoot ||
              candRoot === baseRoot;

            if (isAllowed && !seen.has(resolved.pathname)) {
              seen.add(resolved.pathname);
              const text = (el.textContent || '').trim();
              if (text && text.length < 50 && !/logout|signout|delete|leave/i.test(text)) {
                results.push({
                  label: text,
                  url: resolved.toString(),
                  path: resolved.pathname,
                });
              }
            }
          } catch {
            // Ignore invalid URLs
          }
        }
        return results;
      },
      { baseOrigin, currentOrigin }
    );

    return links;
  }

  async inspectPageElements(page: Page): Promise<DiscoveredElement[]> {
    return page.evaluate(() => {
      const elements: { type: 'button' | 'input' | 'table' | 'form' | 'tab' | 'link'; text?: string; selector?: string; actionHint?: string }[] = [];

      // Collect buttons
      const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]');
      buttons.forEach((btn) => {
        const text = (btn.textContent || (btn as HTMLInputElement).value || '').trim();
        if (text && text.length < 60) {
          elements.push({
            type: 'button',
            text,
            actionHint: `Click button "${text}"`,
          });
        }
      });

      // Collect forms and input fields
      const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
      inputs.forEach((inp) => {
        const placeholder = inp.getAttribute('placeholder') || '';
        const name = inp.getAttribute('name') || '';
        const aria = inp.getAttribute('aria-label') || '';
        const label = placeholder || aria || name;
        if (label) {
          elements.push({
            type: 'input',
            text: label,
            actionHint: `Fill field "${label}"`,
          });
        }
      });

      // Collect tables
      const tables = document.querySelectorAll('table, [role="table"], [role="grid"]');
      tables.forEach((tbl, idx) => {
        const headers = Array.from(tbl.querySelectorAll('th')).map(th => (th.textContent || '').trim()).filter(Boolean);
        elements.push({
          type: 'table',
          text: headers.length ? `Table headers: ${headers.slice(0, 5).join(', ')}` : `Data table #${idx + 1}`,
          actionHint: 'Review data table entries',
        });
      });

      // Collect tabs
      const tabs = document.querySelectorAll('[role="tab"], .tab, .nav-tab');
      tabs.forEach((tab) => {
        const text = (tab.textContent || '').trim();
        if (text) {
          elements.push({
            type: 'tab',
            text,
            actionHint: `Switch to tab "${text}"`,
          });
        }
      });

      return elements;
    });
  }

  async crawlApplication(
    runner: BrowserRunner,
    page: Page,
    baseUrl: string,
    options: { screenshotsDir?: string; maxRoutes?: number } = {}
  ): Promise<RawSectionData[]> {
    const maxRoutes = options.maxRoutes || 6;

    // If page is not yet navigated (e.g. fresh browser), navigate to baseUrl.
    // If already on a page (e.g. authenticated dashboard after login), stay on it!
    const currentUrl = page.url();
    if (!currentUrl || currentUrl === 'about:blank') {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }

    const navLinks = await this.extractNavigationLinks(page, baseUrl);
    const routesToVisit = [
      { label: 'Dashboard', url: page.url(), path: new URL(page.url()).pathname },
      ...navLinks.filter(l => l.path !== new URL(page.url()).pathname),
    ].slice(0, maxRoutes);

    const sections: RawSectionData[] = [];

    for (const route of routesToVisit) {
      try {
        if (page.url() !== route.url) {
          await page.goto(route.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await page.waitForTimeout(2000);
        }

        const title = await page.title().catch(() => route.label);
        const headings = await page.$$eval('h1, h2, h3', (els) =>
          els.map(el => (el.textContent || '').trim()).filter(t => t.length > 0 && t.length < 80)
        );

        const elements = await this.inspectPageElements(page);

        let screenshotPath: string | undefined;
        if (options.screenshotsDir) {
          const safeName = route.label.toLowerCase().replace(/[^a-z0-9]/g, '-');
          screenshotPath = await this.screenshotCapture.capture(page, {
            outputDir: options.screenshotsDir,
            filenamePrefix: `discovery-${safeName}`,
          });
        }

        sections.push({
          name: route.label || title || 'Overview',
          route: route.path,
          url: route.url,
          title,
          headings,
          elements,
          screenshotPath,
        });
      } catch {
        // Continue discovering other routes if one fails
      }
    }

    return sections;
  }
}
