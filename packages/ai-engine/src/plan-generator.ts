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
Discovered Sections (${discovery.sections.length} total):
${JSON.stringify(discovery.sections, null, 2)}

Requirements:
1. Thoroughly showcase and explore ALL discovered sections (${discovery.sections.length} sections). Create a comprehensive, in-depth tutorial with 4 to 16 distinct workflows covering every single section.
2. Workflows must be logical and sequential (e.g. Dashboard Overview first, Core functional sections second, Settings/Configuration last).
3. Every workflow MUST begin with an action "navigate" where "target" is that section's exact route (e.g. "${discovery.sections[0]?.route || '/'}"), guaranteeing the browser visits and records every page.
4. Each workflow should have 3 to 6 concrete, sequential steps (using "navigate", "scroll", "click", "input", "explain").
5. When presenting a section, use "scroll" to demonstrate the page contents in full view, and "click" on key buttons, tabs, or data tables.
6. NEVER perform destructive actions (no deletions, no live payments, no account resets).
7. Provide a realistic total estimatedDuration in seconds (around 45-60 seconds per workflow).

Return a valid JSON object strictly matching this schema:
{
  "title": "string (e.g. '${discovery.applicationName} Complete User Manual')",
  "estimatedDuration": number (total seconds, e.g. 300),
  "workflows": [
    {
      "id": "string (kebab-case identifier)",
      "title": "string (human-readable title)",
      "priority": number (1 = highest, sequential),
      "steps": [
        {
          "action": "navigate" | "click" | "input" | "scroll" | "explain" | "hover",
          "target": "string (exact route for navigate, selector or button name for click/scroll)",
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

    // Post-process workflows to ensure EVERY workflow starts with a guaranteed navigate step to its section
    const finalizedWorkflows: WorkflowPlanItem[] = parsed.workflows.map((w, idx) => {
      // Find matching discovered section
      const matchedSection = discovery.sections.find(
        (s) =>
          w.id.toLowerCase().includes(s.name.toLowerCase().replace(/[^a-z0-9]/g, '')) ||
          w.title.toLowerCase().includes(s.name.toLowerCase()) ||
          w.steps.some((st) => st.action === 'navigate' && st.target === s.route)
      ) || discovery.sections[idx % discovery.sections.length];

      const steps = [...(w.steps || [])];
      const hasNavigateFirst = steps.length > 0 && steps[0].action === 'navigate' && steps[0].target;

      if (!hasNavigateFirst) {
        // Prepend guaranteed navigation step
        steps.unshift({
          action: 'navigate',
          target: matchedSection?.route || '/',
          description: `Navigate to ${matchedSection?.name || w.title}`,
        });
      } else if (
        steps[0]?.action === 'navigate' &&
        matchedSection?.route &&
        (!steps[0]?.target || (!steps[0].target.startsWith('http') && !steps[0].target.startsWith('/')))
      ) {
        // Fix target to be exact section route
        steps[0].target = matchedSection.route;
      }

      return {
        id: w.id || `workflow-${idx + 1}`,
        title: w.title || matchedSection?.name || `Workflow ${idx + 1}`,
        priority: w.priority || idx + 1,
        steps,
      };
    });

    // Check if any discovered section was completely missed by LLM, and append workflows for them
    const coveredRoutes = new Set(
      finalizedWorkflows.flatMap((w) => w.steps.filter((s) => s.action === 'navigate').map((s) => s.target))
    );

    discovery.sections.forEach((sec, idx) => {
      if (!coveredRoutes.has(sec.route)) {
        const slug = sec.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        finalizedWorkflows.push({
          id: `${slug}-section-workflow`,
          title: `${sec.name} Walkthrough`,
          priority: finalizedWorkflows.length + 1,
          steps: [
            {
              action: 'navigate',
              target: sec.route,
              description: `Navigate to ${sec.name} section`,
            },
            {
              action: 'scroll',
              description: `Explore ${sec.name} features and layout`,
            },
            {
              action: 'explain',
              description: `Overview of capabilities in ${sec.name}`,
            },
          ],
        });
      }
    });

    // If authRequired is true, ensure an initial login-authentication workflow exists so login is recorded
    if (discovery.authRequired && !finalizedWorkflows.some((w) => /login|auth|sign-in/i.test(w.id))) {
      finalizedWorkflows.unshift({
        id: 'login-authentication',
        title: 'Sign In & Authentication',
        priority: 1,
        steps: [
          {
            action: 'navigate',
            target: discovery.baseUrl,
            description: 'Navigate to application login page',
          },
          {
            action: 'input',
            description: 'Enter account email and password credentials',
            value: 'credentials',
          },
          {
            action: 'click',
            target: 'Sign In',
            description: 'Submit authentication and enter workspace',
          },
        ],
      });
      finalizedWorkflows.forEach((w, i) => {
        w.priority = i + 1;
      });
    }

    return {
      title: parsed.title || `${discovery.applicationName} User Manual`,
      estimatedDuration: parsed.estimatedDuration || finalizedWorkflows.length * 60,
      workflows: finalizedWorkflows,
    };
  }

  private generateRuleBased(discovery: DiscoveryData): ExplorationPlan {
    const workflows: WorkflowPlanItem[] = [];

    if (discovery.authRequired) {
      workflows.push({
        id: 'login-authentication',
        title: 'Sign In & Authentication',
        priority: 1,
        steps: [
          {
            action: 'navigate',
            target: discovery.baseUrl,
            description: 'Navigate to application login page',
          },
          {
            action: 'input',
            description: 'Enter account email and password credentials',
            value: 'credentials',
          },
          {
            action: 'click',
            target: 'Sign In',
            description: 'Submit authentication and enter workspace',
          },
        ],
      });
    }

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
