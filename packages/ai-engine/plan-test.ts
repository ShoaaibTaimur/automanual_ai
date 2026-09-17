import { PlanGenerator } from './src/plan-generator';
import { DiscoveryData } from '@automanual/shared';

async function runPlanTest() {
  console.log('=== AutoManual AI Plan Generator Test ===');

  const mockDiscovery: DiscoveryData = {
    applicationName: 'QuickShop',
    baseUrl: 'https://quickshop.example.com',
    authRequired: true,
    discoveredAt: new Date().toISOString(),
    sections: [
      {
        name: 'Dashboard',
        route: '/dashboard',
        description: 'Overview of store activity and statistics.',
        features: ['Revenue metrics', 'Refresh Analytics', 'Export Summary'],
      },
      {
        name: 'Orders',
        route: '/orders',
        description: 'Manage customer orders.',
        features: ['Create Order', 'Filter Orders', 'Table headers: Order ID, Customer, Amount, Status'],
      },
      {
        name: 'Customers',
        route: '/customers',
        description: 'Manage customer relationships.',
        features: ['Add Customer', 'Form configuration (3 fields)'],
      },
      {
        name: 'Settings',
        route: '/settings',
        description: 'Configure store parameters and billing.',
        features: ['Save Changes', 'Form configuration (1 fields)'],
      },
    ],
  };

  const planner = new PlanGenerator();

  console.log('1. Generating plan from discovery data...');
  const plan = await planner.generatePlan(mockDiscovery);

  console.log('2. Inspecting generated exploration plan:');
  console.log(`   Title: ${plan.title}`);
  console.log(`   Estimated Duration: ${plan.estimatedDuration} seconds (~${Math.round(plan.estimatedDuration / 60)} mins)`);
  console.log(`   Total Workflows: ${plan.workflows.length}`);

  plan.workflows.forEach((w) => {
    console.log(`   [Priority ${w.priority}] ${w.title} (${w.id}) - ${w.steps.length} steps:`);
    w.steps.forEach((s, idx) => {
      console.log(`     ${idx + 1}. [${s.action.toUpperCase()}] ${s.description}${s.target ? ` -> target: "${s.target}"` : ''}`);
    });
  });

  if (!plan.workflows || plan.workflows.length === 0) {
    throw new Error('Plan generation failed: no workflows returned!');
  }

  // Verify priority 1 is Dashboard
  if (plan.workflows[0].priority !== 1) {
    throw new Error('Workflow priorities are not sequenced starting from 1!');
  }

  console.log('=== All Plan Generator Tests Passed Successfully! ===');
  process.exit(0);
}

runPlanTest().catch((err) => {
  console.error('❌ Plan generator test failed:', err);
  process.exit(1);
});
