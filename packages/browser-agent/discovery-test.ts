import { BrowserRunner } from './src/browser-runner';
import { DiscoveryEngine } from './src/discovery-engine';
import { FeatureSynthesizer } from '@automanual/ai-engine';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

function createMockSaasServer(port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const navHtml = `
      <nav style="width: 220px; background: #0f172a; padding: 1.5rem; display: flex; flex-direction: column; gap: 0.8rem;">
        <h3 style="color: #6366f1; margin: 0 0 1rem 0;">QuickShop</h3>
        <a href="/dashboard" style="color: #e2e8f0; text-decoration: none;">Dashboard</a>
        <a href="/orders" style="color: #e2e8f0; text-decoration: none;">Orders</a>
        <a href="/customers" style="color: #e2e8f0; text-decoration: none;">Customers</a>
        <a href="/settings" style="color: #e2e8f0; text-decoration: none;">Settings</a>
      </nav>
    `;

    const server = http.createServer((req, res) => {
      const url = req.url || '/';
      res.writeHead(200, { 'Content-Type': 'text/html' });

      let content = '';

      if (url === '/' || url === '/dashboard') {
        content = `
          <h1>Store Dashboard</h1>
          <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
            <div style="background: #1e293b; padding: 1rem; border-radius: 6px;">Total Revenue: $48,290</div>
            <div style="background: #1e293b; padding: 1rem; border-radius: 6px;">Active Orders: 14</div>
          </div>
          <button id="btn-export">Export Summary</button>
          <button id="btn-refresh">Refresh Analytics</button>
        `;
      } else if (url === '/orders') {
        content = `
          <h1>Order Management</h1>
          <div style="margin-bottom: 1rem;">
            <button id="btn-create-order">Create Order</button>
            <button id="btn-filter">Filter Orders</button>
          </div>
          <table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%; border-color: #334155;">
            <thead>
              <tr><th>Order ID</th><th>Customer</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr><td>#1001</td><td>Alice Johnson</td><td>$129.00</td><td>Paid</td></tr>
              <tr><td>#1002</td><td>Bob Smith</td><td>$74.50</td><td>Pending</td></tr>
            </tbody>
          </table>
        `;
      } else if (url === '/customers') {
        content = `
          <h1>Customer Directory</h1>
          <form style="display: flex; flex-direction: column; gap: 0.8rem; max-width: 400px; margin-bottom: 1.5rem;">
            <input type="text" name="customerName" placeholder="Full Name" />
            <input type="email" name="customerEmail" placeholder="Email Address" />
            <input type="text" name="customerPhone" placeholder="Phone Number" />
            <button type="submit">Add Customer</button>
          </form>
        `;
      } else if (url === '/settings') {
        content = `
          <h1>Store Settings</h1>
          <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
            <div role="tab" style="padding: 0.5rem 1rem; background: #334155; border-radius: 4px;">General</div>
            <div role="tab" style="padding: 0.5rem 1rem; background: #1e293b; border-radius: 4px;">Billing</div>
            <div role="tab" style="padding: 0.5rem 1rem; background: #1e293b; border-radius: 4px;">Integrations</div>
          </div>
          <input type="text" name="storeName" placeholder="Store Name" value="QuickShop Main" />
          <button id="btn-save-settings">Save Changes</button>
        `;
      } else {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>QuickShop - ${url.replace('/', '').toUpperCase() || 'DASHBOARD'}</title>
            <style>
              body { margin: 0; display: flex; font-family: sans-serif; background: #030712; color: #f8fafc; height: 100vh; }
              main { flex: 1; padding: 2rem; }
              button { background: #6366f1; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 8px; }
              input { background: #0f172a; border: 1px solid #334155; color: white; padding: 8px; border-radius: 4px; }
            </style>
          </head>
          <body>
            ${navHtml}
            <main>
              ${content}
            </main>
          </body>
        </html>
      `);
    });

    server.listen(port, () => resolve(server));
  });
}

async function runDiscoveryTest() {
  console.log('=== AutoManual Website Discovery Test ===');

  const testPort = 8766;
  const server = await createMockSaasServer(testPort);
  console.log(`✓ Mock SaaS application listening on http://localhost:${testPort}`);

  const storageDir = path.resolve(__dirname, '../../storage/test-discovery');
  const screenshotsDir = path.join(storageDir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const runner = new BrowserRunner();
  const discoveryEngine = new DiscoveryEngine();
  const synthesizer = new FeatureSynthesizer();

  try {
    console.log('1. Launching Chromium...');
    const page = await runner.launch({
      headless: true,
      viewport: { width: 1920, height: 1080 },
    });
    console.log('   ✓ Browser online.');

    const baseUrl = `http://localhost:${testPort}/dashboard`;
    console.log(`2. Crawling application routes from ${baseUrl}...`);
    const rawSections = await discoveryEngine.crawlApplication(runner, page, baseUrl, {
      screenshotsDir,
      maxRoutes: 5,
    });

    console.log(`   ✓ Discovered ${rawSections.length} sections:`);
    for (const sec of rawSections) {
      console.log(`     - [${sec.name}] (${sec.route}): ${sec.elements.length} interactive elements, screenshot: ${Boolean(sec.screenshotPath)}`);
    }

    if (rawSections.length < 4) {
      throw new Error(`Expected at least 4 sections, found ${rawSections.length}`);
    }

    console.log('3. Synthesizing structured feature map...');
    const featureMap = await synthesizer.synthesize('QuickShop', baseUrl, rawSections);
    console.log('   Synthesized Feature Map:');
    console.log(JSON.stringify(featureMap, null, 2));

    if (!featureMap.sections || featureMap.sections.length === 0) {
      throw new Error('Feature map synthesis returned empty sections!');
    }

    console.log('4. Verifying screenshot captures...');
    const savedScreenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png'));
    console.log(`   ✓ Found ${savedScreenshots.length} screenshots in ${screenshotsDir}`);
    if (savedScreenshots.length < 4) {
      throw new Error('Missing route screenshots!');
    }

    await runner.close();
    server.close();
    console.log('=== All Website Discovery Phase 3 Tests Passed Successfully! ===');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Test failed with error:', err.message);
    await runner.close();
    server.close();
    process.exit(1);
  }
}

runDiscoveryTest();
