import { DiscoveryData, ExplorationPlan, WorkflowPlanItem, WorkflowStep } from '@automanual/shared';
import { resilientLLM } from './llm-provider';

export class PlanGenerator {
  constructor() {}

  async generatePlan(discovery: DiscoveryData): Promise<ExplorationPlan> {
    if (resilientLLM.hasAvailableProvider() && discovery.sections && discovery.sections.length > 0) {
      try {
        return await this.generateWithLLM(discovery);
      } catch (err: any) {
        console.warn(`[PlanGenerator] Multi-LLM plan generation failed (${err.message}). Falling back to rule-based planner.`);
      }
    }

    return this.generateRuleBased(discovery);
  }

  private async generateWithLLM(discovery: DiscoveryData): Promise<ExplorationPlan> {
    const prompt = `You are a video tutorial director creating an automated user manual for a web application.
Based on the following discovered sections and features, design an optimal, step-by-step exploration plan.

Application Name: ${discovery.applicationName}
Base URL: ${discovery.baseUrl}
Discovered Sections:
${JSON.stringify(discovery.sections, null, 2)}

Requirements:
1. Workflows must be logical and sequential (e.g. Dashboard Overview first, Core features second, Settings/Configuration last).
2. Each workflow should have 2 to 5 clear, concrete steps.
3. Allowed actions: "navigate", "click", "input", "scroll", "explain", "hover".
4. NEVER perform destructive actions (no deletions, no live payments, no account resets).
5. Provide a realistic total estimatedDuration in seconds (e.g., 40-75 seconds per workflow).

Return a valid JSON object strictly matching this schema:
{
  "title": "string (e.g. 'QuickShop Complete User Manual')",
  "estimatedDuration": number (total seconds, e.g. 300),
  "workflows": [
    {
      "id": "string (kebab-case identifier)",
      "title": "string (human-readable title)",
      "priority": number (1 = highest, sequential),
      "steps": [
        {
          "action": "navigate" | "click" | "input" | "scroll" | "explain" | "hover",
          "target": "string (optional selector, route, or button name)",
          "description": "string (plain English explanation of what happens)",
          "value": "string (optional sample input value)"
        }
      ]
    }
  ]
}`;

    const parsed = await resilientLLM.completeJSON<ExplorationPlan>(
      prompt,
      'You are an autonomous tutorial planner producing structured JSON user manual plans.'
    );

    if (!parsed.workflows || parsed.workflows.length === 0) {
      return this.generateRuleBased(discovery);
    }

    return {
      title: parsed.title || `${discovery.applicationName} User Manual`,
      estimatedDuration: parsed.estimatedDuration || parsed.workflows.length * 75,
      workflows: parsed.workflows.map((w, idx) => ({
        id: w.id || `workflow-${idx + 1}`,
        title: w.title || `Workflow ${idx + 1}`,
        priority: w.priority || idx + 1,
        steps: w.steps || [],
      })),
    };
  }

  private generateRuleBased(discovery: DiscoveryData): ExplorationPlan {
    const workflows: WorkflowPlanItem[] = [];

    discovery.sections.forEach((section, idx) => {
      const isDashboard = /dashboard|home|overview/i.test(section.name);
      const isSettings = /setting|config|profile|account/i.test(section.name);

      const steps: WorkflowStep[] = [
        {
          action: 'navigate',
          target: section.route,
          description: `Navigate to the ${section.name} section.`,
        },
      ];

      // Add steps for discovered features
      section.features.slice(0, 3).forEach((feat) => {
        if (/click|button|export|refresh|create|add|filter|save/i.test(feat)) {
          steps.push({
            action: 'click',
            target: feat,
            description: `Demonstrate "${feat}" interaction.`,
          });
        } else if (/form|input/i.test(feat)) {
          steps.push({
            action: 'input',
            description: 'Demonstrate filling sample parameters safely.',
            value: 'Sample demonstration data',
          });
        } else {
          steps.push({
            action: 'explain',
            description: `Highlight and explain ${feat}.`,
          });
        }
      });

      // Concluding explanation step
      steps.push({
        action: 'explain',
        description: `Summary of capabilities available in ${section.name}.`,
      });

      // Priority ordering: Dashboard first (priority 1), regular sections middle, settings last
      let priority = idx + 2;
      if (isDashboard) priority = 1;
      if (isSettings) priority = discovery.sections.length + 10;

      const slug = section.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

      workflows.push({
        id: `${slug}-workflow`,
        title: `${section.name} Walkthrough`,
        priority,
        steps,
      });
    });

    // Sort by priority
    workflows.sort((a, b) => a.priority - b.priority);
    workflows.forEach((w, i) => { w.priority = i + 1; });

    const totalSeconds = workflows.length * 75;

    return {
      title: `${discovery.applicationName} User Manual`,
      estimatedDuration: totalSeconds,
      workflows,
    };
  }
}
