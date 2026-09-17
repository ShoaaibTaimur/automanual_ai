import fs from 'fs';
import path from 'path';

async function run() {
  console.log('=== AutoManual Phase 8 Live Pipeline & Video Render Test ===');

  const API_URL = 'http://localhost:4001/api';

  // 1. Create Project
  console.log('1. Creating project Phase8StudioTest...');
  const createRes = await fetch(`${API_URL}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Phase8StudioTest',
      baseUrl: 'https://en.wikipedia.org',
      authRequired: false,
    }),
  });
  const project = await createRes.json();
  console.log(`   ✓ Project created: ${project.id} (${project.name})`);

  // 2. Discover
  console.log('2. Running discovery...');
  const discoverRes = await fetch(`${API_URL}/projects/${project.id}/discover`, {
    method: 'POST',
  });
  const discovery = await discoverRes.json();
  console.log(`   ✓ Discovered ${discovery.sections?.length || 0} sections.`);

  // 3. Generate Plan
  console.log('3. Generating plan...');
  const planRes = await fetch(`${API_URL}/projects/${project.id}/plan/generate`, {
    method: 'POST',
  });
  const plan = await planRes.json();
  console.log(`   ✓ Plan generated with ${plan.workflows?.length || 0} workflows.`);

  // 4. Approve Plan (Triggers BullMQ pipeline: Record -> Narrate -> Voice -> Render -> Complete)
  console.log('4. Approving plan to trigger full autonomous pipeline...');
  const approveRes = await fetch(`${API_URL}/projects/${project.id}/plan/approve`, {
    method: 'POST',
  });
  const approveData = await approveRes.json();
  console.log(`   ✓ Plan approved. Pipeline status: ${approveData.status}`);

  // 5. Poll status until COMPLETED or FAILED
  console.log('5. Monitoring real-time pipeline execution & Remotion render...');
  let status = 'EXECUTING';
  let attempts = 0;
  const maxAttempts = 240; // up to 8 minutes for high-res 1080p renders

  while (status !== 'COMPLETED' && status !== 'FAILED' && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 2000));
    attempts++;

    const statusRes = await fetch(`${API_URL}/projects/${project.id}/status`);
    const statusData = await statusRes.json();
    status = statusData.status;

    process.stdout.write(`\r   Current Status: [${status}] Progress: ${statusData.progress}% (${attempts * 2}s)   `);

    if (status === 'COMPLETED' || status === 'FAILED') break;
  }
  console.log('\n');

  if (status !== 'COMPLETED') {
    throw new Error(`Pipeline did not complete. Final status: ${status}`);
  }

  // 6. Verify database records & output video on disk
  console.log('6. Verifying output video and database records...');
  const finalProjectRes = await fetch(`${API_URL}/projects/${project.id}`);
  const finalProject = await finalProjectRes.json();

  console.log('   ✓ Project status:', finalProject.status);
  console.log('   ✓ Recordings count:', finalProject.recordings?.length);
  console.log('   ✓ Narration segments count:', finalProject.narrations?.length);
  console.log('   ✓ Video renders count:', finalProject.videoRenders?.length);

  if (!finalProject.videoRenders || finalProject.videoRenders.length === 0) {
    throw new Error('No video render record found in database!');
  }

  const render = finalProject.videoRenders[0];
  console.log(`   ✓ Video render status: ${render.status}, outputUrl: ${render.outputUrl}`);

  const diskPath = path.resolve(
    process.cwd(),
    `storage/projects/${project.id}/renders/tutorial.mp4`
  );
  if (!fs.existsSync(diskPath)) {
    throw new Error(`Rendered MP4 not found on disk at: ${diskPath}`);
  }

  const stats = fs.statSync(diskPath);
  console.log(`   ✓ Rendered MP4 confirmed on disk: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log('=== Phase 8 Live Pipeline & Remotion Video Render Passed Successfully! ===');
}

run().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
