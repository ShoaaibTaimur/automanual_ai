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
    const condensedSections = rawSections.map((sec) => ({
      name: sec.name,
      route: sec.route,
      title: sec.title,
      headings: sec.headings.slice(0, 3),
      keyElements: sec.elements.slice(0, 6).map((e) => `${e.type}: ${e.text || ''}`.trim()),
    }));

    const prompt = `You are an expert SaaS technical writer and software analyst.
Analyze the following discovered web application sections, page titles, headings, and interactive elements.
Produce a structured application map with clean business titles, summaries, and key features for user onboarding.

Application: ${appName}
Base URL: ${baseUrl}
Discovered Sections:
${JSON.stringify(condensedSections, null, 2)}

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

    // Merge LLM enhancements with raw discovered sections so all real routes are preserved
    const sections: ApplicationSection[] = rawSections.map((raw) => {
      const match = (parsed.sections || []).find(
        (s: any) =>
          s.route === raw.route ||
          s.name?.toLowerCase() === raw.name.toLowerCase() ||
          s.route === raw.url
      );

      return {
        id: raw.route.replace(/[^a-z0-9]/gi, '-').replace(/^-|-$/g, '') || 'overview',
        name: match?.name || raw.name || raw.title || 'Overview',
        route: raw.route,
        description: match?.description || `Explore and manage features in the ${raw.name} section.`,
        features:
          match?.features && match.features.length > 0
            ? match.features
            : raw.elements
                .slice(0, 4)
                .map((e) => e.actionHint || e.text || 'Interface component')
                .filter(Boolean),
      };
    });

    return {
      applicationName: parsed.applicationName || appName,
      baseUrl: parsed.baseUrl || baseUrl,
      sections: sections.length > 0 ? sections : (parsed.sections || []),
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
