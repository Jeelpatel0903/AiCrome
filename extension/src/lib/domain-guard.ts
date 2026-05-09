export interface DomainRule {
  pattern: string; // "*.example.com", "example.com", "*"
  action: 'allow' | 'block';
}

export interface DomainGuardConfig {
  rules: DomainRule[];
  defaultAction: 'allow' | 'block';
}

// Default config: allow everything except known dangerous patterns
export const DEFAULT_DOMAIN_GUARD: DomainGuardConfig = {
  rules: [],
  defaultAction: 'allow',
};

function patternMatches(pattern: string, hostname: string): boolean {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith('.' + suffix);
  }
  return hostname === pattern;
}

export function isDomainAllowed(
  url: string,
  config: DomainGuardConfig = DEFAULT_DOMAIN_GUARD,
): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  // Rules are evaluated in order, first match wins
  for (const rule of config.rules) {
    if (patternMatches(rule.pattern, hostname)) {
      return rule.action === 'allow';
    }
  }
  return config.defaultAction === 'allow';
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  hostname?: string;
}

export function guardNavigation(url: string, config?: DomainGuardConfig): GuardResult {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { allowed: false, reason: 'Invalid URL' };
  }

  const allowed = isDomainAllowed(url, config);
  if (!allowed) {
    return {
      allowed: false,
      reason: `Domain '${hostname}' is blocked by domain guard`,
      hostname,
    };
  }
  return { allowed: true, hostname };
}

// Load config from chrome.storage (async)
export async function loadDomainGuardConfig(): Promise<DomainGuardConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['domainGuardConfig'], (result) => {
      resolve((result.domainGuardConfig as DomainGuardConfig) ?? DEFAULT_DOMAIN_GUARD);
    });
  });
}

export async function saveDomainGuardConfig(config: DomainGuardConfig): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ domainGuardConfig: config }, resolve);
  });
}
