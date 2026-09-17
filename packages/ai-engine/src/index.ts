export * from './feature-synthesizer';
export * from './plan-generator';
export * from './narration-generator';
export * from './voice-generator';
export * from './timeline-builder';

import OpenAI from 'openai';
import { DiscoveryData, ExplorationPlan, NarrationSegment, InteractionEvent, VideoTimelineItem } from '@automanual/shared';
import { PlanGenerator } from './plan-generator';
import { NarrationGenerator } from './narration-generator';
import { VoiceGenerator, GeneratedAudioSegment } from './voice-generator';
import { TimelineBuilder } from './timeline-builder';

export interface AiEngineConfig {
  apiKey?: string;
}

export class AiEngine {
  private planGenerator: PlanGenerator;
  private narrationGenerator: NarrationGenerator;
  private voiceGenerator: VoiceGenerator;
  private timelineBuilder: TimelineBuilder;

  constructor(config?: AiEngineConfig) {
    this.planGenerator = new PlanGenerator(config?.apiKey);
    this.narrationGenerator = new NarrationGenerator(config?.apiKey);
    this.voiceGenerator = new VoiceGenerator(config?.apiKey);
    this.timelineBuilder = new TimelineBuilder();
  }

  async generateExplorationPlan(discovery: DiscoveryData): Promise<ExplorationPlan> {
    return this.planGenerator.generatePlan(discovery);
  }

  async generateNarration(
    appName: string,
    workflows: any[],
    events: InteractionEvent[]
  ): Promise<NarrationSegment[]> {
    return this.narrationGenerator.generateNarration(appName, workflows, events);
  }

  async generateVoiceover(
    segments: NarrationSegment[],
    events: InteractionEvent[],
    outputDir: string
  ): Promise<GeneratedAudioSegment[]> {
    return this.voiceGenerator.generateVoiceover(segments, events, outputDir);
  }

  buildTimeline(
    events: InteractionEvent[],
    audioSegments: GeneratedAudioSegment[]
  ): VideoTimelineItem[] {
    return this.timelineBuilder.buildTimeline(events, audioSegments);
  }
}
