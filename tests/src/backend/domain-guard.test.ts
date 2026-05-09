import { describe, it, expect } from 'vitest';

// Mirror domain-guard logic
interface DomainRule { pattern: string; action: 'allow' | 'block' }
interface DomainGuardConfig { rules: DomainRule[]; defaultAction: 'allow' | 'block' }

function patternMatches(pattern: string, hostname: string): boolean {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith('.' + suffix);
  }
  return hostname === pattern;
}

function isDomainAllowed(url: string, config: DomainGuardConfig): boolean {
  let hostname: string;
  try { hostname = new URL(url).hostname; } catch { return false; }
  for (const rule of config.rules) {
    if (patternMatches(rule.pattern, hostname)) return rule.action === 'allow';
  }
  return config.defaultAction === 'allow';
}

describe('Domain Guard', () => {
  const allowAll: DomainGuardConfig = { rules: [], defaultAction: 'allow' };
  const blockAll: DomainGuardConfig = { rules: [], defaultAction: 'block' };

  describe('patternMatches', () => {
    it('matches wildcard *', () => {
      expect(patternMatches('*', 'anything.com')).toBe(true);
    });

    it('matches exact hostname', () => {
      expect(patternMatches('example.com', 'example.com')).toBe(true);
      expect(patternMatches('example.com', 'other.com')).toBe(false);
    });

    it('matches *.example.com for subdomain', () => {
      expect(patternMatches('*.example.com', 'api.example.com')).toBe(true);
    });

    it('matches *.example.com for root domain', () => {
      expect(patternMatches('*.example.com', 'example.com')).toBe(true);
    });

    it('does not match unrelated domain with *.example.com', () => {
      expect(patternMatches('*.example.com', 'evil.com')).toBe(false);
    });

    it('does not match partial hostnames', () => {
      expect(patternMatches('example.com', 'notexample.com')).toBe(false);
    });
  });

  describe('isDomainAllowed', () => {
    it('allows all with default allow', () => {
      expect(isDomainAllowed('https://anything.com', allowAll)).toBe(true);
    });

    it('blocks all with default block', () => {
      expect(isDomainAllowed('https://anything.com', blockAll)).toBe(false);
    });

    it('block rule overrides default allow', () => {
      const config: DomainGuardConfig = {
        rules: [{ pattern: 'evil.com', action: 'block' }],
        defaultAction: 'allow',
      };
      expect(isDomainAllowed('https://evil.com/page', config)).toBe(false);
      expect(isDomainAllowed('https://good.com/page', config)).toBe(true);
    });

    it('allow rule overrides default block', () => {
      const config: DomainGuardConfig = {
        rules: [{ pattern: 'safe.com', action: 'allow' }],
        defaultAction: 'block',
      };
      expect(isDomainAllowed('https://safe.com/page', config)).toBe(true);
      expect(isDomainAllowed('https://other.com/page', config)).toBe(false);
    });

    it('first matching rule wins', () => {
      const config: DomainGuardConfig = {
        rules: [
          { pattern: '*.example.com', action: 'allow' },
          { pattern: 'api.example.com', action: 'block' },
        ],
        defaultAction: 'block',
      };
      // First rule (*.example.com allow) matches first → allowed
      expect(isDomainAllowed('https://api.example.com', config)).toBe(true);
    });

    it('returns false for invalid URL', () => {
      expect(isDomainAllowed('not-a-url', allowAll)).toBe(false);
    });
  });
});
