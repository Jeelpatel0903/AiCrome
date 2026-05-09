// Semantic element locator — find elements by semantic attributes without fragile CSS selectors

import { getAccessibleName } from './snapshot';

export interface SemanticLocator {
  role?: string;
  name?: string;        // accessible name substring (case-insensitive)
  text?: string;        // text content substring
  placeholder?: string;
  label?: string;       // associated <label> text
  testId?: string;      // data-testid attribute
  type?: string;        // input type
  nth?: number;         // 0-based index among matches
}

export interface SemanticResult {
  element: Element | null;
  ref?: string;
  score: number;
}

const CANDIDATE_SELECTORS =
  'a[href], button, input, select, textarea, [role], [data-testid], [contenteditable="true"]';

function getAriaRole(el: Element): string {
  const role = el.getAttribute('role');
  if (role?.trim()) return role.trim().toLowerCase();

  const tag = el.tagName.toUpperCase();
  switch (tag) {
    case 'BUTTON': return 'button';
    case 'A': return 'link';
    case 'INPUT': {
      const type = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      return 'textbox';
    }
    case 'SELECT': return 'combobox';
    case 'TEXTAREA': return 'textbox';
    default: return tag.toLowerCase();
  }
}

function getAssociatedLabelText(el: Element): string {
  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) return label.textContent?.trim() ?? '';
  }

  // Check if element is wrapped in a <label>
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // Return label text minus the input's own text
    return parentLabel.textContent?.trim() ?? '';
  }

  return '';
}

function scoreElement(el: Element, locator: SemanticLocator): number {
  let score = 0;

  // role match: +30
  if (locator.role !== undefined) {
    const elRole = getAriaRole(el);
    if (elRole === locator.role.toLowerCase()) score += 30;
  }

  // accessible name match: +25
  if (locator.name !== undefined) {
    const elName = getAccessibleName(el).toLowerCase();
    if (elName.includes(locator.name.toLowerCase())) score += 25;
  }

  // text content match: +25
  if (locator.text !== undefined) {
    const elText = (el.textContent?.trim().replace(/\s+/g, ' ') ?? '').toLowerCase();
    if (elText.includes(locator.text.toLowerCase())) score += 25;
  }

  // placeholder match: +20
  if (locator.placeholder !== undefined) {
    const elPlaceholder = ((el as HTMLInputElement).placeholder ?? '').toLowerCase();
    if (elPlaceholder.includes(locator.placeholder.toLowerCase())) score += 20;
  }

  // associated label text match: +20
  if (locator.label !== undefined) {
    const elLabel = getAssociatedLabelText(el).toLowerCase();
    if (elLabel.includes(locator.label.toLowerCase())) score += 20;
  }

  // testId match: +40 (most specific)
  if (locator.testId !== undefined) {
    const elTestId = el.getAttribute('data-testid') ?? '';
    if (elTestId === locator.testId) score += 40;
  }

  // type match: +10
  if (locator.type !== undefined) {
    const elType = ((el as HTMLInputElement).type ?? '').toLowerCase();
    if (elType === locator.type.toLowerCase()) score += 10;
  }

  return score;
}

export function findAllBySemanticLocator(locator: SemanticLocator): SemanticResult[] {
  const candidates = Array.from(document.querySelectorAll(CANDIDATE_SELECTORS));

  const results: SemanticResult[] = candidates
    .map((el) => {
      const score = scoreElement(el, locator);
      const ref = el.getAttribute('data-ai-ref') ?? undefined;
      return { element: el, ref, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return results;
}

export function findElementBySemanticLocator(locator: SemanticLocator): SemanticResult {
  const results = findAllBySemanticLocator(locator);

  if (results.length === 0) {
    return { element: null, score: 0 };
  }

  const nth = locator.nth ?? 0;
  const chosen = results[nth] ?? results[0];

  return chosen;
}
