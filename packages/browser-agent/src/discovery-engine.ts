import { Page } from 'playwright';
import { BrowserRunner } from './browser-runner';
import { ScreenshotCapture } from './screenshot-capture';

export interface DiscoveredRoute {
  label: string;
  url: string;
  path: string;
  isButton?: boolean;
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

    // 1. Safely expand collapsed navigation accordions (avoid user profile / company dropdowns / logout)
    try {
      const expanders = await page.$$(
        'aside button[aria-label*="Expand" i], nav button[aria-label*="Expand" i], aside button[aria-expanded="false"], nav button[aria-expanded="false"], [class*="sidebar" i] button[aria-expanded="false"]'
      );
      for (const exp of expanders.slice(0, 15)) {
        const aria = ((await exp.getAttribute('aria-label')) || '').toLowerCase();
        const text = ((await exp.textContent()) || '').toLowerCase();
        if (/profile|account|user|avatar|logout|signout|sign-out|company|tenant/i.test(`${aria} ${text}`)) continue;
        if (await exp.isVisible().catch(() => false)) {
          await exp.click().catch(() => {});
          await page.waitForTimeout(150);
        }
      }
    } catch {}

    // 2. Extract standard <a> anchor links (strictly same origin, excluding policy/legal boilerplate)
    const anchorLinks = await page.$$eval(
      'nav a, aside a, header a, [role="navigation"] a, [class*="nav" i] a, [class*="menu" i] a, [class*="sidebar" i] a, main a, [role="main"] a, [role="tablist"] a, a',
      (elements, { currentOrigin }) => {
        const results: { label: string; url: string; path: string; isButton: boolean }[] = [];
        const seen = new Set<string>();

        for (const el of elements) {
          const href = el.getAttribute('href');
          if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

          try {
            const resolved = new URL(href, currentOrigin);

            // Strictly restrict to current application origin (e.g. dashboard.cs...)
            if (resolved.origin !== currentOrigin) continue;

            // Reject policies, terms, cookie, legal, marketing boilerplate
            if (/policies|terms|privacy|cookie|legal|copyright|disclaimer|feedback|contact-us/i.test(resolved.pathname)) continue;

            if (!seen.has(resolved.pathname)) {
              seen.add(resolved.pathname);
              const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
              if (
                text &&
                text.length < 60 &&
                !/logout|signout|sign-out|log-out|delete|leave|cancel|disconnect|terms|privacy|policy|cookie|legal/i.test(text)
              ) {
                results.push({
                  label: text,
                  url: resolved.toString(),
                  path: resolved.pathname,
                  isButton: false,
                });
              }
            }
          } catch {}
        }
        return results;
      },
      { currentOrigin }
    );

    // 3. Extract SPA navigation buttons (e.g. .cs-nav-item, .cs-child-item, aside button, nav button)
    const buttonLinks = await page.$$eval(
      'aside button, nav button, [class*="nav" i] button, [class*="sidebar" i] button, [role="menuitem"], [role="tab"]',
      (buttons) => {
        const results: { label: string; url: string; path: string; isButton: boolean }[] = [];
        const seen = new Set<string>();

        for (const btn of buttons) {
          const text = ((btn as HTMLElement).innerText || btn.textContent || '').trim();
          const aria = (btn.getAttribute('aria-label') || '').trim();
          const label = text || aria;
          if (!label || label.length < 2 || label.length > 50) continue;
          if (/logout|signout|sign-out|log-out|delete|leave|cancel|disconnect|toggle company|expand|terms|privacy|policy|cookie|legal/i.test(label)) continue;
          if ((btn as HTMLElement).className?.includes?.('locked') || (btn as HTMLButtonElement).disabled) continue;

          const key = label.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          const slug = '/' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          results.push({
            label,
            url: slug,
            path: slug,
            isButton: true,
          });
        }
        return results;
      }
    );

    // Primary navigation in apps comes from button links (sidebar/nav), supplemented by anchor links
    const combined: DiscoveredRoute[] = [...buttonLinks];
    const seenLabels = new Set(buttonLinks.map(l => l.label.toLowerCase()));
    const seenPaths = new Set(buttonLinks.map(l => l.path.toLowerCase()));

    for (const link of anchorLinks) {
      if (!seenLabels.has(link.label.toLowerCase()) && !seenPaths.has(link.path.toLowerCase())) {
        seenLabels.add(link.label.toLowerCase());
        seenPaths.add(link.path.toLowerCase());
        combined.push(link);
      }
    }

    return combined;
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
    const maxRoutes = options.maxRoutes || 16;

    // If page is not yet navigated (e.g. fresh browser), navigate to baseUrl.
    const appOrigin = new URL(baseUrl).origin;

    // Auto-close any external popup tabs that might open
    page.context().on('page', async (popup) => {
      try {
        await popup.close().catch(() => {});
      } catch {}
    });

    // If page is not yet navigated (e.g. fresh browser), navigate to baseUrl.
    // If already on a page (e.g. authenticated dashboard after login), stay on it!
    const currentUrl = page.url();
    if (!currentUrl || currentUrl === 'about:blank') {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }

    const startPath = (() => {
      try { return new URL(page.url()).pathname; } catch { return '/'; }
    })();

    const visitedPaths = new Set<string>();
    visitedPaths.add(startPath);

    const queue: DiscoveredRoute[] = [
      { label: 'Dashboard', url: page.url(), path: startPath },
    ];

    // Seed queue with navigation links from starting page
    const initialLinks = await this.extractNavigationLinks(page, baseUrl);
    for (const link of initialLinks) {
      if (!visitedPaths.has(link.path) && queue.length < maxRoutes * 2) {
        visitedPaths.add(link.path);
        queue.push(link);
      }
    }

    const sections: RawSectionData[] = [];

    while (queue.length > 0 && sections.length < maxRoutes) {
      const route = queue.shift();
      if (!route) break;

      try {
        // Guard: if browser drifted off-origin, return to app base immediately
        const currentOrigin = (() => {
          try { return new URL(page.url()).origin; } catch { return ''; }
        })();
        if (currentOrigin !== appOrigin || /policies|terms|privacy/i.test(page.url())) {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await page.waitForTimeout(2000);
        }

        let navigated = false;

        // 1. If it's a button, click it directly in the UI
        if (route.isButton) {
          try {
            const btn = page
              .locator('aside button, nav button, [class*="sidebar" i] button, [role="menuitem"], [role="tab"]')
              .filter({ hasText: new RegExp(`^\\s*${route.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') })
              .first();

            if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
              await btn.click({ timeout: 6000 });
              await page.waitForTimeout(2500);
              navigated = true;
            } else {
              const looseBtn = page
                .locator('aside button, nav button, [class*="sidebar" i] button')
                .filter({ hasText: route.label })
                .first();
              if ((await looseBtn.count()) > 0 && (await looseBtn.isVisible().catch(() => false))) {
                await looseBtn.click({ timeout: 6000 });
                await page.waitForTimeout(2500);
                navigated = true;
              }
            }
          } catch {}
        }

        // 2. If not navigated via button and route is a valid http URL on app origin, navigate with goto
        if (!navigated && route.url && route.url.startsWith('http')) {
          const destOrigin = (() => { try { return new URL(route.url).origin; } catch { return ''; } })();
          if (destOrigin === appOrigin && page.url() !== route.url) {
            await page.goto(route.url, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
            await page.waitForTimeout(2500);
          }
        }

        // Off-origin detection: if route led to external site, roll back to dashboard and skip
        const landedOrigin = (() => {
          try { return new URL(page.url()).origin; } catch { return ''; }
        })();
        if (landedOrigin !== appOrigin || /policies|terms|privacy/i.test(page.url())) {
          await page.goBack().catch(() => page.goto(baseUrl));
          await page.waitForTimeout(2000);
          continue;
        }

        const actualUrl = page.url();
        const actualPath = (() => {
          try { return new URL(actualUrl).pathname; } catch { return route.path; }
        })();

        // Skip duplicate sections by name and route
        if (sections.some((s) => s.name.toLowerCase() === route.label.toLowerCase() && (s.route === actualPath || s.route === route.path))) {
          continue;
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
          route: actualPath,
          url: actualUrl,
          title,
          headings,
          elements,
          screenshotPath,
        });

        // Deep crawl: extract any new navigation links from this visited page!
        if (sections.length < maxRoutes) {
          const subLinks = await this.extractNavigationLinks(page, baseUrl);
          for (const link of subLinks) {
            if (!visitedPaths.has(link.path) && (queue.length + sections.length) < maxRoutes * 2) {
              visitedPaths.add(link.path);
              queue.push(link);
            }
          }
        }
      } catch {
        // Continue discovering other routes if one fails
      }
    }

    return sections;
  }
}
