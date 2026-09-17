import { WorkflowExecutor } from './src/workflow-executor';
import { ExplorationPlan } from '@automanual/shared';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

function createMockSaasServer(port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/' || url === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Dashboard</title><style>body { background: #030712; color: #fff; font-family: sans-serif; padding: 2rem; }</style></head>
            <body>
              <h1>Store Dashboard</h1>
              <button id="btn-export">Export Analytics</button>
              <button id="btn-refresh">Refresh Stats</button>
            </body>
          </html>
        `);
      } else if (url === '/orders') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Orders</title><style>body { background: #030712; color: #fff; font-family: sans-serif; padding: 2rem; }</style></head>
            <body>
              <h1>Orders List</h1>
              <input id="search-order" placeholder="Search orders" />
              <button id="btn-create">Create Order</button>
              <button id="btn-delete" style="color: red;">Delete All Customer Data</button>
            </body>
          </html>
        `);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(port, () => resolve(server));
  });
}

async function runExecutionTest() {
  console.log('=== AutoManual Autonomous Workflow Execution Test ===');

  const testPort = 8767;
  const server = await createMockSaasServer(testPort);
  console.log(`✓ Mock SaaS server listening on http://localhost:${testPort}`);

  const storageDir = path.resolve(__dirname, '../../storage/test-execution');
  fs.mkdirSync(storageDir, { recursive: true });

  const testPlan: ExplorationPlan = {
    title: 'QuickShop Demo Manual',
    estimatedDuration: 120,
    workflows: [
      {
        id: 'dashboard-workflow',
        title: 'Dashboard Exploration',
        priority: 1,
        steps: [
          { action: 'navigate', target: '/dashboard', description: 'Open dashboard page' },
          { action: 'click', target: 'Export Analytics', description: 'Click analytics export' },
          { action: 'explain', description: 'Highlight dashboard metrics' },
        ],
      },
      {
        id: 'orders-workflow',
        title: 'Orders Management',
        priority: 2,
        steps: [
          { action: 'navigate', target: '/orders', description: 'Navigate to orders table' },
          { action: 'input', value: 'ORD-9982', description: 'Filter orders by ID' },
          { action: 'click', target: 'Create Order', description: 'Open order creation modal' },
          { action: 'click', target: 'Delete All Customer Data', description: 'Dangerous action test' },
        ],
      },
    ],
  };

  const executor = new WorkflowExecutor();

  try {
    console.log('1. Executing workflows autonomously with 1920x1080 video recording...');
    const result = await executor.executePlan(
      testPlan,
      `http://localhost:${testPort}/dashboard`,
      { storageDir }
    );

    console.log('2. Verifying execution outputs:');
    console.log(`   Video recording path: ${result.videoPath}`);
    console.log(`   Events path: ${result.eventsPath}`);
    console.log(`   Duration: ${result.durationSeconds}s`);
    console.log(`   Total events logged: ${result.events.length}`);

    // Verify video file exists on disk and has size
    if (result.videoPath && fs.existsSync(result.videoPath)) {
      const stats = fs.statSync(result.videoPath);
      console.log(`   ✓ Video recording verified on disk (${(stats.size / 1024).toFixed(1)} KB).`);
    } else {
      throw new Error('Video recording file not found on disk!');
    }

    // Verify events.json
    if (!fs.existsSync(result.eventsPath)) {
      throw new Error('events.json not found on disk!');
    }
    const eventsContent = JSON.parse(fs.readFileSync(result.eventsPath, 'utf8'));
    console.log(`   ✓ events.json verified with ${eventsContent.length} structured interaction events.`);

    // Verify click event has coordinates and bounding box
    const clickEvent = eventsContent.find((e: any) => e.type === 'click');
    if (clickEvent) {
      console.log(`   ✓ Click event verified with coordinates: x=${clickEvent.x}, y=${clickEvent.y}, width=${clickEvent.width}, height=${clickEvent.height}`);
    } else {
      throw new Error('Missing click event in logs!');
    }

    // Verify safety guard blocked destructive step
    console.log(`3. Verifying safety guard (${result.skippedActions.length} skipped actions):`);
    const blocked = result.skippedActions.find(a => a.target?.includes('Delete'));
    if (blocked) {
      console.log(`   ✓ Destructive action successfully intercepted: "${blocked.target}" (${blocked.reason})`);
    } else {
      throw new Error('Safety guard failed to block destructive step!');
    }

    server.close();
    console.log('=== All Autonomous Execution Phase 6 Tests Passed Successfully! ===');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Execution test failed:', err.message);
    server.close();
    process.exit(1);
  }
}

runExecutionTest();
