import path from 'path';
import fs from 'fs';
import { RemotionVideoRenderer } from './src/renderer';
import { InteractionEvent, VideoTimelineItem } from '@automanual/shared';

async function main() {
  console.log('=== AutoManual Video Engine (Remotion) Test ===');

  const rootStorage = path.resolve(__dirname, '../../storage');
  const testRecording = path.join(
    rootStorage,
    'test-execution/recordings/page@dde3d063524f1213b647e2c105617da4.webm'
  );
  const testEventsPath = path.join(rootStorage, 'test-execution/events.json');
  const testAudio1 = path.join(rootStorage, 'test-audio/voice-segment-1-dashboard-overview.wav');
  const testAudio2 = path.join(rootStorage, 'test-audio/voice-segment-2-orders-management.wav');
  const outputMp4 = path.join(rootStorage, 'test-renders/tutorial-test.mp4');

  if (!fs.existsSync(testRecording)) {
    throw new Error(`Test recording not found: ${testRecording}`);
  }

  let events: InteractionEvent[] = [];
  if (fs.existsSync(testEventsPath)) {
    events = JSON.parse(fs.readFileSync(testEventsPath, 'utf8'));
  }

  const timeline: VideoTimelineItem[] = [
    {
      start: 0,
      end: 4,
      type: 'intro',
      narration: 'Welcome to the application walkthrough.',
    },
    {
      start: 4,
      end: 8,
      type: 'interaction',
      action: 'click',
      target: 'Refresh Stats',
      narration: 'Observe interaction coordinates and click ripple highlights.',
    },
  ];

  const audioSegments = [
    {
      audioPath: testAudio1,
      startTime: 0.5,
      duration: 3.5,
      text: 'In this section, we explore the Dashboard Overview and core metrics.',
      workflowId: 'dashboard-overview',
    },
    {
      audioPath: testAudio2,
      startTime: 4.5,
      duration: 3.5,
      text: 'Notice the highlighted interactive elements and automated cursor flow.',
      workflowId: 'orders-management',
    },
  ];

  console.log('1. Initializing RemotionVideoRenderer with root storage:', rootStorage);
  const renderer = new RemotionVideoRenderer(rootStorage);

  console.log('2. Rendering 1080p MP4 tutorial video with cursor, ripples, highlights & audio...');
  let lastLoggedProgress = -1;

  const result = await renderer.render({
    browserRecordingPath: testRecording,
    events,
    timeline,
    audioSegments,
    outputPath: outputMp4,
    title: 'AutoManual AI Showcase',
    fps: 30,
    width: 1920,
    height: 1080,
    onProgress: percent => {
      if (percent % 20 === 0 && percent !== lastLoggedProgress) {
        console.log(`   Rendering progress: ${percent}%`);
        lastLoggedProgress = percent;
      }
    },
  });

  console.log('3. Verifying rendered output:');
  if (!fs.existsSync(outputMp4)) {
    throw new Error(`Output MP4 was not created at ${outputMp4}`);
  }

  const stats = fs.statSync(outputMp4);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`   ✓ Video rendered successfully at: ${result.outputPath}`);
  console.log(`   ✓ File size: ${sizeMb} MB (${stats.size} bytes)`);
  console.log(`   ✓ Video duration: ${result.duration.toFixed(1)}s`);

  if (stats.size < 10000) {
    throw new Error('Rendered video file size is too small (< 10KB)!');
  }

  console.log('=== All Remotion Video Engine Phase 8 Tests Passed Successfully! ===');
}

main().catch(err => {
  console.error('Video Engine Test Failed:', err);
  process.exit(1);
});
