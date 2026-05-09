import { describe, it, expect } from 'vitest';

// Mirror the pure functions from content-boundary.service.ts for testing
const BOUNDARY_OPEN = '<<<UNTRUSTED_PAGE_CONTENT_BEGIN>>>';
const BOUNDARY_CLOSE = '<<<UNTRUSTED_PAGE_CONTENT_END>>>';

function wrapPageContent(content: string): string {
  return `${BOUNDARY_OPEN}\n${content}\n${BOUNDARY_CLOSE}`;
}

function wrapSnapshot(snapshotText: string, url: string): string {
  return `Current page (${url}):\n${wrapPageContent(snapshotText)}`;
}

function extractPageContent(wrapped: string): string {
  const start = wrapped.indexOf(BOUNDARY_OPEN);
  const end = wrapped.indexOf(BOUNDARY_CLOSE);
  if (start === -1 || end === -1) return wrapped;
  return wrapped.slice(start + BOUNDARY_OPEN.length, end).trim();
}

describe('Content Boundary Service', () => {
  describe('wrapPageContent', () => {
    it('wraps content with boundary markers', () => {
      const result = wrapPageContent('Hello World');
      expect(result).toContain(BOUNDARY_OPEN);
      expect(result).toContain(BOUNDARY_CLOSE);
      expect(result).toContain('Hello World');
    });

    it('places content between markers', () => {
      const content = 'Sensitive page data';
      const result = wrapPageContent(content);
      const openIdx = result.indexOf(BOUNDARY_OPEN);
      const closeIdx = result.indexOf(BOUNDARY_CLOSE);
      expect(openIdx).toBeLessThan(closeIdx);
      expect(result.slice(openIdx, closeIdx)).toContain(content);
    });

    it('handles empty content', () => {
      const result = wrapPageContent('');
      expect(result).toContain(BOUNDARY_OPEN);
      expect(result).toContain(BOUNDARY_CLOSE);
    });

    it('handles multi-line content', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const result = wrapPageContent(content);
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 3');
    });
  });

  describe('wrapSnapshot', () => {
    it('includes URL in wrapper', () => {
      const result = wrapSnapshot('snapshot text', 'https://example.com');
      expect(result).toContain('https://example.com');
    });

    it('wraps snapshot content in boundaries', () => {
      const result = wrapSnapshot('[@e1] BUTTON "Submit"', 'https://example.com');
      expect(result).toContain(BOUNDARY_OPEN);
      expect(result).toContain('[@e1] BUTTON "Submit"');
    });
  });

  describe('extractPageContent', () => {
    it('extracts content from wrapped string', () => {
      const wrapped = wrapPageContent('Original Content');
      const extracted = extractPageContent(wrapped);
      expect(extracted).toBe('Original Content');
    });

    it('returns original string if no markers', () => {
      const plain = 'No markers here';
      expect(extractPageContent(plain)).toBe(plain);
    });

    it('trims whitespace from extracted content', () => {
      const wrapped = `${BOUNDARY_OPEN}\n  content  \n${BOUNDARY_CLOSE}`;
      expect(extractPageContent(wrapped)).toBe('content');
    });
  });
});
