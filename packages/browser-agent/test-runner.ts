import { BrowserRunner } from './src/browser-runner';
import { AuthDetector } from './src/auth-detector';
import { LoginManager } from './src/login-manager';
import { ScreenshotCapture } from './src/screenshot-capture';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

// Hermetic mock authentication server
function createMockAuthServer(port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/' || url === '/login') {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const params = new URLSearchParams(body);
            const user = params.get('username');
            const pass = params.get('password');

            if (user === 'admin' && pass === 'password123') {
              res.writeHead(302, {
                'Location': '/dashboard',
                'Set-Cookie': 'session_token=test_session_abc123; HttpOnly; Path=/',
              });
              res.end();
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body>
                    <div class="alert-danger">Invalid credentials</div>
                    <form action="/login" method="POST">
                      <input type="text" name="username" id="username" />
                      <input type="password" name="password" id="password" />
                      <button type="submit">Log in</button>
                    </form>
                  </body>
                </html>
              `);
            }
          });
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>QuickShop Login</title>
              <style>
                body { background: #0b0f19; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; }
                form { background: #161f30; padding: 2rem; border-radius: 8px; display: flex; flex-direction: column; gap: 1rem; width: 320px; }
                input { padding: 8px; border-radius: 4px; border: 1px solid #334155; background: #0f172a; color: white; }
                button { background: #6366f1; color: white; padding: 10px; border: none; border-radius: 4px; cursor: pointer; }
              </style>
            </head>
            <body>
              <form action="/login" method="POST">
                <h2>QuickShop Sign In</h2>
                <label>Email</label>
                <input type="text" name="username" id="username" placeholder="Username" />
                <label>Password</label>
                <input type="password" name="password" id="password" placeholder="Password" />
                <button type="submit">Log in</button>
              </form>
            </body>
          </html>
        `);
      } else if (url === '/dashboard') {
        const cookies = req.headers.cookie || '';
        const isAuthenticated = cookies.includes('session_token=test_session_abc123');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>QuickShop Dashboard</title>
              <style>
                body { background: #030712; color: #f8fafc; font-family: sans-serif; padding: 2rem; }
                .card { background: #111827; padding: 1.5rem; border-radius: 8px; border: 1px solid #1f2937; }
              </style>
            </head>
            <body>
              <h1>QuickShop Store Dashboard</h1>
              <div class="card">
                <p>Status: ${isAuthenticated ? 'Authenticated' : 'Guest'}</p>
                <p>Welcome back, Administrator!</p>
              </div>
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

async function runTest() {
  console.log('=== AutoManual Browser Agent Test ===');

  const testPort = 8765;
  const server = await createMockAuthServer(testPort);
  console.log(`✓ Hermetic mock auth server listening on http://localhost:${testPort}`);

  const testStorageDir = path.resolve(__dirname, '../../storage/test-auth');
  fs.mkdirSync(testStorageDir, { recursive: true });

  const sessionPath = path.join(testStorageDir, 'session.json');
  const screenshotsDir = path.join(testStorageDir, 'screenshots');

  const runner = new BrowserRunner();
  const detector = new AuthDetector();
  const loginManager = new LoginManager();
  const screenshotter = new ScreenshotCapture();

  try {
    console.log('1. Launching Chromium (1920x1080)...');
    const page = await runner.launch({
      headless: true,
      viewport: { width: 1920, height: 1080 },
    });
    console.log('   ✓ Chromium launched successfully.');

    const targetUrl = `http://localhost:${testPort}/login`;
    console.log(`2. Navigating to target: ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });

    console.log('3. Inspecting page for auth barrier...');
    const detection = await detector.detect(page);
    console.log('   Auth Detection Result:', JSON.stringify(detection, null, 2));

    if (!detection.isAuthPage) {
      throw new Error('Failed to detect authentication page!');
    }
    console.log('   ✓ Login form identified correctly.');

    console.log('4. Capturing pre-auth screenshot...');
    const preAuthImg = await screenshotter.capture(page, {
      outputDir: screenshotsDir,
      filenamePrefix: 'pre-auth',
    });
    console.log(`   ✓ Saved: ${preAuthImg}`);

    console.log('5. Executing autonomous login...');
    const loginResult = await loginManager.login(runner, page, {
      username: 'admin',
      password: 'password123',
      storageStatePath: sessionPath,
    });
    console.log('   Login Result:', JSON.stringify(loginResult, null, 2));

    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error}`);
    }
    console.log(`   ✓ Login succeeded and redirected to: ${loginResult.redirectUrl}`);

    console.log('6. Capturing post-auth screenshot...');
    const postAuthImg = await screenshotter.capture(page, {
      outputDir: screenshotsDir,
      filenamePrefix: 'post-auth',
    });
    console.log(`   ✓ Saved: ${postAuthImg}`);

    console.log('7. Verifying persistent session file on disk...');
    if (fs.existsSync(sessionPath)) {
      const stateContent = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      console.log(`   ✓ Session state verified (${stateContent.cookies?.length || 0} cookies stored: ${stateContent.cookies?.[0]?.name}=${stateContent.cookies?.[0]?.value}).`);
    } else {
      throw new Error('Session storage state file missing!');
    }

    await runner.close();
    server.close();
    console.log('=== All Browser Agent Phase 2 Tests Passed Successfully! ===');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Test failed with error:', err.message);
    await runner.close();
    server.close();
    process.exit(1);
  }
}

runTest();
