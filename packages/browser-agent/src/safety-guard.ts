export interface SafetyCheckResult {
  isSafe: boolean;
  reason?: string;
}

export class SafetyGuard {
  private destructiveKeywords = [
    'delete',
    'remove',
    'destroy',
    'drop',
    'purge',
    'truncate',
    'cancel account',
    'close account',
    'wipe data',
    'terminate',
    'charge card',
    'pay now',
    'submit payment',
    'send payment',
    'purchase',
    'buy now',
  ];

  checkAction(action: string, target?: string, text?: string): SafetyCheckResult {
    const combined = `${action} ${target || ''} ${text || ''}`.toLowerCase();

    for (const keyword of this.destructiveKeywords) {
      if (combined.includes(keyword)) {
        return {
          isSafe: false,
          reason: `Skipped potentially destructive action containing keyword: "${keyword}"`,
        };
      }
    }

    return { isSafe: true };
  }
}
