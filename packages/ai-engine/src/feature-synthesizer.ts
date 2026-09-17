import { DiscoveryData, ApplicationSection } from '@automanual/shared';
import { resilientLLM } from './llm-provider';

export interface RawSectionInput {
  name: string;
  route: string;
  url: string;
  title: string;
  headings: string[];
  elements: { type: string; text?: string; actionHint?: string }[];
  screenshotPath?: string;
}

export class FeatureSynthesizer {
  constructor() {}

  async synthesize(
    appName: string,
    baseUrl: string,
    rawSections: RawSectionInput[],
    authRequired: boolean = false
  ): Promise<DiscoveryData> {
    if (resilientLLM.hasAvailableProvider() && rawSections.length > 0) {
      try {
        return await this.synthesizeWithLLM(appName, baseUrl, rawSections, authRequired);
      } catch (err: any) {
        console.warn(`[FeatureSynthesizer] Multi-LLM synthesis failed (${err.message}). Falling back to rule-based parser.`);
      }
    }

    return this.synthesizeRuleBased(appName, baseUrl, rawSections, authRequired);
  }

  private async synthesizeWithLLM(
    appName: string,
    baseUrl: string,
    rawSections: RawSectionInput[],
    authRequired: boolean
  ): Promise<DiscoveryData> {
    const prompt = `You are an expert SaaS technical writer and software analyst.
Analyze the following discovered web application sections, page titles, headings, and interactive elements.
Produce a structured application map with clean business titles, summaries, and key features for user onboarding.

Application: ${appName}
Base URL: ${baseUrl}
Raw Discovered Data:
${JSON.stringify(rawSections, null, 2)}

Return a valid JSON object matching this schema:
{
  "applicationName": "${appName}",
  "baseUrl": "${baseUrl}",
  "sections": [
    {
      "name": "string (clean section title)",
      "route": "string (URL route)",
      "description": "string (plain English summary of section purpose)",
      "features": ["string (concrete action or feature in this section)"]
    }
  ]
}`;

    const parsed = await resilientLLM.completeJSON<any>(
      prompt,
      'You convert raw web discovery data into structured software feature maps.'
    );

    return {
      applicationName: parsed.applicationName || appName,
      baseUrl: parsed.baseUrl || baseUrl,
      sections: parsed.sections || [],
      authRequired,
      discoveredAt: new Date().toISOString(),
    };
  }

  private synthesizeRuleBased(
    appName: string,
    baseUrl: string,
    rawSections: RawSectionInput[],
    authRequired: boolean
  ): DiscoveryData {
    const sections: ApplicationSection[] = rawSections.map((sec) => {
      const mainHeading = sec.headings[0] || sec.title || sec.name;
      const features: string[] = [];

      // Extract features from buttons
      sec.elements
        .filter(e => e.type === 'button' && e.text)
        .slice(0, 4)
        .forEach(b => features.push(b.text!));

      // Extract features from inputs / forms
      const inputCount = sec.elements.filter(e => e.type === 'input').length;
      if (inputCount > 0) {
        features.push(`Form configuration (${inputCount} fields)`);
      }

      // Extract features from tables
      const table = sec.elements.find(e => e.type === 'table');
      if (table && table.text) {
        features.push(table.text);
      }

      if (features.length === 0) {
        features.push(`View and manage ${sec.name.toLowerCase()}`);
      }

      return {
        name: sec.name.trim() || mainHeading.trim() || 'Overview',
        route: sec.route,
        description: `Manage and interact with ${sec.name.toLowerCase()} in ${appName}.`,
        features: Array.from(new Set(features)),
      };
    });

    return {
      applicationName: appName,
      baseUrl,
      sections: sections.length > 0 ? sections : [
        {
          name: 'Dashboard',
          route: '/',
          description: `Main dashboard for ${appName}.`,
          features: ['Overview metrics', 'System navigation'],
        },
      ],
      authRequired,
      discoveredAt: new Date().toISOString(),
    };
  }
}
