import { describe, it, expect, beforeEach } from 'vitest';

// Snapshot logic (mirrored from extension/src/content/snapshot.ts)
// We inline the core logic since the extension files are browser-only modules

function getAccessibleName(el: Element): string {
  // 1. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  // 2. aria-labelledby — resolve referenced element(s) text
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy?.trim()) {
    const parts = labelledBy
      .trim()
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }

  // 3. textContent (truncated to 80 chars)
  const text = el.textContent?.trim().replace(/\s+/g, ' ') ?? '';
  if (text) return text.slice(0, 80);

  // 4. placeholder
  const placeholder = (el as HTMLInputElement).placeholder;
  if (placeholder?.trim()) return placeholder.trim();

  // 5. title
  const title = el.getAttribute('title');
  if (title?.trim()) return title.trim();

  // 6. name attribute
  const nameAttr = el.getAttribute('name');
  if (nameAttr?.trim()) return nameAttr.trim();

  // 7. id
  const id = el.getAttribute('id');
  if (id?.trim()) return id.trim();

  return '';
}

describe('Snapshot utilities (happy-dom)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('getAccessibleName', () => {
    it('uses aria-label', () => {
      const btn = document.createElement('button');
      btn.setAttribute('aria-label', 'Close dialog');
      btn.textContent = 'X';
      expect(getAccessibleName(btn)).toBe('Close dialog');
    });

    it('uses aria-labelledby', () => {
      const label = document.createElement('span');
      label.id = 'lbl';
      label.textContent = 'Email address';
      document.body.appendChild(label);
      const input = document.createElement('input');
      input.setAttribute('aria-labelledby', 'lbl');
      expect(getAccessibleName(input)).toBe('Email address');
    });

    it('uses text content', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Submit Form';
      expect(getAccessibleName(btn)).toBe('Submit Form');
    });

    it('truncates long text content to 80 chars', () => {
      const el = document.createElement('div');
      el.textContent = 'A'.repeat(100);
      const name = getAccessibleName(el);
      expect(name.length).toBe(80);
    });

    it('uses placeholder for inputs', () => {
      const input = document.createElement('input');
      (input as HTMLInputElement).placeholder = 'Enter your email';
      expect(getAccessibleName(input)).toBe('Enter your email');
    });

    it('uses title attribute', () => {
      const el = document.createElement('a');
      el.setAttribute('title', 'Home page');
      expect(getAccessibleName(el)).toBe('Home page');
    });

    it('uses id as last resort', () => {
      const el = document.createElement('div');
      el.setAttribute('id', 'submit-btn');
      expect(getAccessibleName(el)).toBe('submit-btn');
    });

    it('returns empty string when no name source available', () => {
      const el = document.createElement('div');
      expect(getAccessibleName(el)).toBe('');
    });
  });
});
