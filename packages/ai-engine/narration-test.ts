import { NarrationGenerator } from './src/narration-generator';
import { VoiceGenerator } from './src/voice-generator';
import { TimelineBuilder } from './src/timeline-builder';
import { InteractionEvent, WorkflowPlanItem } from '@automanual/shared';
import * as path from 'path';
import * as fs from 'fs';

async function runNarrationTest() {
  console.log('=== AutoManual Narration & Voiceover Generator Test ===');

  const testAudioDir = path.resolve(__dirname, '../../storage/test-audio');
  fs.mkdirSync(testAudioDir, { recursive: true });

  const mockWorkflows: WorkflowPlanItem[] = [
    {
      id: 'dashboard-overview',
      title: 'Dashboard Overview',
      priority: 1,
      steps: [
        { action: 'navigate', target: '/dashboard', description: 'Open dashboard page' },
        { action: 'click', target: 'Refresh Stats', description: 'Update real-time store metrics' },
      ],
    },
    {
      id: 'orders-management',
      title: 'Orders Management',
      priority: 2,
      steps: [
        { action: 'navigate', target: '/orders', description: 'Open orders list' },
        { action: 'click', target: 'Create Order', description: 'Create a new customer order' },
      ],
    },
  ];

  const mockEvents: InteractionEvent[] = [
    { id: 'e1', type: 'navigate', timestamp: 0, url: 'https://example.com/dashboard', elementText: 'Open dashboard page' },
    { id: 'e2', type: 'click', timestamp: 2400, url: 'https://example.com/dashboard', elementText: 'Refresh Stats', x: 200, y: 150, width: 120, height: 35 },
    { id: 'e3', type: 'navigate', timestamp: 5000, url: 'https://example.com/orders', elementText: 'Open orders list' },
    { id: 'e4', type: 'click', timestamp: 7800, url: 'https://example.com/orders', elementText: 'Create Order', x: 450, y: 180, width: 140, height: 40 },
  ];

  const narrationGenerator = new NarrationGenerator();
  const voiceGenerator = new VoiceGenerator();
  const timelineBuilder = new TimelineBuilder();

  console.log('1. Generating narration script from observed events...');
  const segments = await narrationGenerator.generateNarration('QuickShop', mockWorkflows, mockEvents);

  console.log(`   ✓ Produced ${segments.length} narration segments:`);
  segments.forEach((s, idx) => {
    console.log(`     [Segment ${idx + 1}] (Events ${s.startEventIndex}..${s.endEventIndex}): "${s.text}"`);
  });

  if (segments.length === 0) {
    throw new Error('Narration generation returned 0 segments!');
  }

  console.log('2. Generating voiceover audio files...');
  const audioSegments = await voiceGenerator.generateVoiceover(segments, mockEvents, testAudioDir);

  console.log(`   ✓ Generated ${audioSegments.length} audio files:`);
  audioSegments.forEach((a, idx) => {
    console.log(`     [Audio ${idx + 1}] ${a.audioPath} (duration: ${a.duration}s, start: ${a.startTime}s)`);
    if (!fs.existsSync(a.audioPath) || fs.statSync(a.audioPath).size === 0) {
      throw new Error(`Generated audio file missing or empty: ${a.audioPath}`);
    }
  });

  console.log('3. Building synchronized video timeline...');
  const timeline = timelineBuilder.buildTimeline(mockEvents, audioSegments);
  console.log(`   ✓ Built timeline with ${timeline.length} items:`);
  timeline.slice(0, 4).forEach((t, i) => {
    console.log(`     Item ${i + 1}: [${t.start.toFixed(1)}s - ${t.end.toFixed(1)}s] type=${t.type}, action=${t.action || 'intro'}, target="${t.target || ''}"`);
  });

  console.log('=== All Narration & Voiceover Phase 7 Tests Passed Successfully! ===');
  process.exit(0);
}

runNarrationTest().catch((err) => {
  console.error('❌ Narration test failed:', err);
  process.exit(1);
});
