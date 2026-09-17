import OpenAI from 'openai';
import { InteractionEvent, WorkflowPlanItem, NarrationSegment } from '@automanual/shared';

export interface RawNarrationResponse {
  segments: {
    workflowId: string;
    startEventIndex: number;
    endEventIndex: number;
    text: string;
  }[];
}

export class NarrationGenerator {
  private openai: OpenAI | null = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (key && key.trim().length > 0 && !key.includes('your-openai-api-key')) {
      this.openai = new OpenAI({ apiKey: key });
    }
  }

  async generateNarration(
    appName: string,
    workflows: WorkflowPlanItem[],
    events: InteractionEvent[]
  ): Promise<NarrationSegment[]> {
    if (this.openai && events.length > 0) {
      try {
        return await this.generateWithOpenAI(appName, workflows, events);
      } catch (err: any) {
        console.warn(`OpenAI narration generation failed (${err.message}). Using rule-based fallback.`);
      }
    }

    return this.generateRuleBased(appName, workflows, events);
  }

  private async generateWithOpenAI(
    appName: string,
    workflows: WorkflowPlanItem[],
    events: InteractionEvent[]
  ): Promise<NarrationSegment[]> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    const prompt = `You are a professional voiceover scriptwriter creating narration for an automated software tutorial video.
Correlate the following observed browser interaction events with the planned workflows.

Application: ${appName}
Workflows:
${JSON.stringify(workflows, null, 2)}

Recorded Interaction Events:
${JSON.stringify(events.map((e, idx) => ({ index: idx, type: e.type, elementText: e.elementText, url: e.url })), null, 2)}

Requirements:
1. Tone: Professional, clear, friendly, and instructive.
2. Focus on explaining what the user sees and accomplishes.
3. For each workflow, create 1 or 2 concise narration segments.
4. Reference accurate event indices (startEventIndex and endEventIndex).

Return a valid JSON object matching:
{
  "segments": [
    {
      "workflowId": "string (matching workflow id)",
      "startEventIndex": number,
      "endEventIndex": number,
      "text": "string (narration speech)"
    }
  ]
}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You produce synchronized tutorial voiceover narration scripts from browser interaction logs.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    const parsed: RawNarrationResponse = JSON.parse(response.choices[0]?.message?.content || '{}');

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

      // Concise narration matched to visual action duration (~10-14 words, ~4-5s speech)
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
