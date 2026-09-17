import OpenAI from 'openai';
import { DiscoveryData, ApplicationSection } from '@automanual/shared';

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
  private openai: OpenAI | null = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (key && key.trim().length > 0 && !key.includes('your-openai-api-key')) {
      this.openai = new OpenAI({ apiKey: key });
    }
  }

  async synthesize(
    appName: string,
    baseUrl: string,
    rawSections: RawSectionInput[],
    authRequired: boolean = false
  ): Promise<DiscoveryData> {
    if (this.openai && rawSections.length > 0) {
      try {
        return await this.synthesizeWithOpenAI(appName, baseUrl, rawSections, authRequired);
      } catch (err: any) {
        console.warn(`OpenAI feature synthesis failed (${err.message}). Using rule-based synthesizer.`);
      }
    }

    return this.synthesizeRuleBased(appName, baseUrl, rawSections, authRequired);
  }

  private async synthesizeWithOpenAI(
    appName: string,
    baseUrl: string,
    rawSections: RawSectionInput[],
    authRequired: boolean
  ): Promise<DiscoveryData> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    const prompt = `You are an expert SaaS technical writer and software analyst.
Analyze the following discovered web application sections, headings, and interactive elements.
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

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You convert raw web discovery data into structured software feature maps.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');

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

      // Default feature fallback if empty
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
