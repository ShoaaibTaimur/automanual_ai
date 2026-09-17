import { InteractionEvent, WorkflowPlanItem, NarrationSegment } from '@automanual/shared';
import { resilientLLM } from './llm-provider';

export interface RawNarrationResponse {
  segments: {
    workflowId: string;
    startEventIndex: number;
    endEventIndex: number;
    text: string;
  }[];
}

export class NarrationGenerator {
  constructor() {}

  async generateNarration(
    appName: string,
    workflows: WorkflowPlanItem[],
    events: InteractionEvent[]
  ): Promise<NarrationSegment[]> {
    const providers = resilientLLM.getActiveProviders();
    console.log(`[NarrationGenerator] Active providers: ${providers.join(', ') || 'NONE'}`);

    if (resilientLLM.hasAvailableProvider() && events.length > 0) {
      try {
        console.log(`[NarrationGenerator] Generating AI narration for ${workflows.length} workflows, ${events.length} events...`);
        const result = await this.generateWithLLM(appName, workflows, events);
        console.log(`[NarrationGenerator] AI narration generated: ${result.length} segments.`);
        return result;
      } catch (err: any) {
        console.error(`[NarrationGenerator] AI narration failed: ${err.message}. Using rule-based fallback.`);
      }
    } else if (events.length === 0) {
      console.warn('[NarrationGenerator] No events recorded — narration will be generic.');
    }

    return this.generateRuleBased(appName, workflows, events);
  }

  private async generateWithLLM(
    appName: string,
    workflows: WorkflowPlanItem[],
    events: InteractionEvent[]
  ): Promise<NarrationSegment[]> {
    const prompt = `You are a professional software tutorial narrator and onboarding coach.
Write natural, engaging, professional voiceover narration for an automated video manual.

Application: ${appName}
Planned Workflows:
${JSON.stringify(workflows, null, 2)}

Recorded Browser Interaction Events:
${JSON.stringify(events.map((e, idx) => ({ index: idx, type: e.type, elementText: e.elementText, url: e.url, workflowId: e.workflowId })), null, 2)}

Requirements:
1. Tone: Warm, helpful, clear, and instructive like a top-tier product specialist.
2. Keep each segment concise (around 12-20 words, ~4-6 seconds of natural speech).
3. Directly describe the real action taking place (e.g. "To get started with your account, let's navigate to the main dashboard.").
4. For each workflow, create 1 clear narration segment matching its start and end event indices.

Return a valid JSON object matching:
{
  "segments": [
    {
      "workflowId": "string (matching workflow id)",
      "startEventIndex": number,
      "endEventIndex": number,
      "text": "string (voiceover speech)"
    }
  ]
}`;

    const parsed = await resilientLLM.completeJSON<RawNarrationResponse>(
      prompt,
      'You produce synchronized tutorial voiceover narration scripts from browser interaction logs.'
    );

    if (!parsed.segments || parsed.segments.length === 0) {
      return this.generateRuleBased(appName, workflows, events);
    }

    return parsed.segments.map(s => ({
      workflowId: s.workflowId,
      startEventIndex: s.startEventIndex ?? 0,
      endEventIndex: s.endEventIndex ?? Math.max(0, events.length - 1),
      text: s.text,
    }));
  }

  private generateRuleBased(
    appName: string,
    workflows: WorkflowPlanItem[],
    events: InteractionEvent[]
  ): NarrationSegment[] {
    const segments: NarrationSegment[] = [];
    const eventCount = events.length;
    const workflowCount = Math.max(1, workflows.length);
    const eventsPerWorkflow = Math.max(1, Math.floor(eventCount / workflowCount));

    workflows.forEach((wf, idx) => {
      // Find matching events specifically tagged with this workflowId
      const matchingIndices = events
        .map((e, i) => (e.workflowId === wf.id ? i : -1))
        .filter(i => i !== -1);

      const startIndex = matchingIndices.length > 0 ? matchingIndices[0] : idx * eventsPerWorkflow;
      const endIndex = matchingIndices.length > 0
        ? matchingIndices[matchingIndices.length - 1]
        : Math.min(eventCount - 1, (idx + 1) * eventsPerWorkflow - 1);

      const relevantEvents = events.slice(startIndex, endIndex + 1);

      const actionSummaries = relevantEvents
        .filter(e => e.elementText && e.elementText.length > 2 && e.elementText.length < 40 && !e.elementText.includes('Simulated'))
        .map(e => e.elementText)
        .slice(0, 2);

      let speech = `In ${wf.title},`;
      if (actionSummaries.length > 0) {
        speech += ` notice how you can view ${actionSummaries[0]} and navigate features smoothly.`;
      } else {
        speech += ` explore key application tools and configure options tailored to your needs.`;
      }

      segments.push({
        workflowId: wf.id,
        startEventIndex: startIndex,
        endEventIndex: Math.max(startIndex, endIndex),
        text: speech,
      });
    });

    return segments;
  }
}
