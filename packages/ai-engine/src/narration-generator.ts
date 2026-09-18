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
    events: InteractionEvent[],
    sections?: any[]
  ): Promise<NarrationSegment[]> {
    const providers = resilientLLM.getActiveProviders();
    console.log(`[NarrationGenerator] Active providers: ${providers.join(', ') || 'NONE'}`);

    if (resilientLLM.hasAvailableProvider() && events.length > 0) {
      try {
        console.log(`[NarrationGenerator] Generating AI narration for ${workflows.length} workflows, ${events.length} events...`);
        const result = await this.generateWithLLM(appName, workflows, events, sections);
        console.log(`[NarrationGenerator] AI narration generated: ${result.length} segments.`);
        return result;
      } catch (err: any) {
        console.error(`[NarrationGenerator] AI narration failed: ${err.message}. Using rule-based fallback.`);
      }
    } else if (events.length === 0) {
      console.warn('[NarrationGenerator] No events recorded — narration will be generic.');
    }

    return this.generateRuleBased(appName, workflows, events, sections);
  }

  private async generateWithLLM(
    appName: string,
    workflows: WorkflowPlanItem[],
    events: InteractionEvent[],
    sections?: any[]
  ): Promise<NarrationSegment[]> {
    const sectionsSummary = (sections || []).map((s) => ({
      name: s.name,
      route: s.route,
      description: s.description,
      features: (s.features || []).slice(0, 3),
    }));

    const workflowsSummary = workflows.map((w) => ({
      id: w.id,
      title: w.title,
      steps: (w.steps || []).map((s) => `${s.action}: ${s.description || s.target || ''}`),
    }));

    const eventsSummary = events.slice(0, 60).map((e, idx) => ({
      index: idx,
      type: e.type,
      elementText: e.elementText,
      workflowId: e.workflowId,
    }));

    const prompt = `You are an expert product specialist and software tutorial narrator creating a high-end, engaging user manual video walkthrough.
Write comprehensive, insightful, and professional voiceover narration for each section of the application.

Application: ${appName}

Application Sections & Purpose:
${JSON.stringify(sectionsSummary, null, 2)}

Planned Workflows:
${JSON.stringify(workflowsSummary, null, 2)}

Recorded Browser Events:
${JSON.stringify(eventsSummary, null, 2)}

CRITICAL NARRATION REQUIREMENTS:
1. NEVER REPEAT "Click Get Started" or generic phrases like "let's get started". Each section must have distinct, customized, meaningful explanations.
2. EXPLAIN WHAT EACH PAGE REALLY MEANS:
   - For every section/workflow, explain what the page is for, its core business purpose, and the value it delivers to the user.
   - Mention the specific tools, metrics, settings, or capabilities visible on that page.
   - Explain what users can accomplish here and how to take action.
   - For sign-in/authentication workflows, explain how credentials grant secure access to the main dashboard.
3. SEGMENT LENGTH: Write 2 to 4 rich, informative sentences per workflow (~35-65 words, about 12-20 seconds of natural, polished speech). Do NOT write just a single 1-line sentence.
4. TONE: Confident, articulate, professional, and educational — like an Apple product tour or senior product manager demo.
5. Create exactly 1 high-quality narration segment per workflow, matching the workflowId.

Return a valid JSON object matching:
{
  "segments": [
    {
      "workflowId": "string (matching workflow id)",
      "startEventIndex": number,
      "endEventIndex": number,
      "text": "string (2-4 rich sentences explaining what this page means and what users accomplish here)"
    }
  ]
}`;

    const parsed = await resilientLLM.completeJSON<RawNarrationResponse>(
      prompt,
      'You produce synchronized tutorial voiceover narration scripts from browser interaction logs.'
    );

    if (!parsed.segments || parsed.segments.length === 0) {
      return this.generateRuleBased(appName, workflows, events, sections);
    }

    // Guarantee that each workflow's narration segment strictly matches its real start/end event indices
    return workflows.map((wf, idx) => {
      const matchedSegment =
        (parsed.segments || []).find((s) => s.workflowId === wf.id) ||
        (parsed.segments || [])[idx];

      const matchingIndices = events
        .map((e, i) => (e.workflowId === wf.id ? i : -1))
        .filter((i) => i !== -1);

      const eventsPerWf = Math.max(1, Math.floor(events.length / Math.max(1, workflows.length)));
      const startIndex =
        matchingIndices.length > 0
          ? matchingIndices[0]
          : Math.min(Math.max(0, events.length - 1), idx * eventsPerWf);
      const endIndex =
        matchingIndices.length > 0
          ? matchingIndices[matchingIndices.length - 1]
          : Math.min(Math.max(0, events.length - 1), (idx + 1) * eventsPerWf - 1);

      return {
        workflowId: wf.id,
        startEventIndex: startIndex,
        endEventIndex: Math.max(startIndex, endIndex),
        text:
          matchedSegment?.text ||
          `Welcome to ${wf.title}. This dedicated area gives you comprehensive visibility and control over your daily operations, allowing you to review active records and configure relevant settings.`,
      };
    });
  }

  private generateRuleBased(
    appName: string,
    workflows: WorkflowPlanItem[],
    events: InteractionEvent[],
    sections?: any[]
  ): NarrationSegment[] {
    const segments: NarrationSegment[] = [];
    const eventCount = events.length;
    const workflowCount = Math.max(1, workflows.length);
    const eventsPerWorkflow = Math.max(1, Math.floor(eventCount / workflowCount));

    workflows.forEach((wf, idx) => {
      // Find matching events specifically tagged with this workflowId
      const matchingIndices = events
        .map((e, i) => (e.workflowId === wf.id ? i : -1))
        .filter((i) => i !== -1);

      const startIndex = matchingIndices.length > 0 ? matchingIndices[0] : idx * eventsPerWorkflow;
      const endIndex =
        matchingIndices.length > 0
          ? matchingIndices[matchingIndices.length - 1]
          : Math.min(eventCount - 1, (idx + 1) * eventsPerWorkflow - 1);

      const matchedSection = (sections || []).find(
        (s) =>
          s.name?.toLowerCase() === wf.title?.toLowerCase() ||
          wf.id?.toLowerCase().includes(s.name?.toLowerCase().replace(/[^a-z0-9]/g, ''))
      );

      const isLogin = /login|auth|sign-in/i.test(wf.id) || /login|auth|sign in/i.test(wf.title);

      let speech = '';
      if (isLogin) {
        speech = `To access your workspace, navigate to the sign-in portal and enter your authorized credentials. Once authenticated, the system securely verifies your account and redirects you to the main dashboard.`;
      } else if (matchedSection?.description) {
        speech = `Welcome to ${wf.title}. ${matchedSection.description} Here you can review live records, configure operational parameters, and manage day-to-day execution.`;
      } else {
        speech = `Welcome to ${wf.title}. This dedicated section gives you full visibility and operational control over your daily workflows, allowing you to inspect active records and configure relevant settings.`;
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
