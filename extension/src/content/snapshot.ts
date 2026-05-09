// Snapshot+Refs System — assigns data-ai-ref attributes and builds structured page snapshots

export interface ElementRef {
  ref: string;
  tag: string;
  role: string;
  name: string;
  type?: string;
  value?: string;
  disabled: boolean;
  visible: boolean;
  boundingBox: { x: number; y: number; width: number; height: number };
  cssSelector: string;
  xpath: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  timestamp: string;
  elements: ElementRef[];
  scrollY: number;
  pageHeight: number;
  viewportHeight: number;
}

const INTERACTIVE_SELECTORS =
  'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="tab"], [role="combobox"], [contenteditable="true"]';

function isVisible(el: Element): boolean {
  const htmlEl = el as HTMLElement;
  if (htmlEl.offsetParent !== null) return true;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function getAccessibleName(el: Element): string {
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

function inferRole(el: Element): string {
  // Explicit ARIA role takes precedence
  const role = el.getAttribute('role');
  if (role?.trim()) return role.trim();

  const tag = el.tagName.toUpperCase();
  switch (tag) {
    case 'BUTTON':
      return 'button';
    case 'A':
      return 'link';
    case 'INPUT': {
      const type = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      return 'textbox';
    }
    case 'SELECT':
      return 'combobox';
    case 'TEXTAREA':
      return 'textbox';
    default:
      return tag.toLowerCase();
  }
}

function buildCssSelector(el: Element): string {
  const id = el.getAttribute('id');
  if (id) return `#${CSS.escape(id)}`;

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    const node: Element = current;
    const parent: Element | null = node.parentElement;
    if (!parent) break;

    const tag = node.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      (c) => c.tagName === node.tagName,
    );

    if (siblings.length === 1) {
      parts.unshift(tag);
    } else {
      const index = siblings.indexOf(node) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
    }
    current = parent;
  }

  return parts.join(' > ');
}

function buildXPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const node: Element = current;
    const parent: Element | null = node.parentElement;
    const tag = node.tagName.toLowerCase();

    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === node.tagName,
      );
      if (siblings.length === 1) {
        parts.unshift(tag);
      } else {
        const index = siblings.indexOf(node) + 1;
        parts.unshift(`${tag}[${index}]`);
      }
    } else {
      parts.unshift(tag);
    }

    current = parent;
  }

  return '/' + parts.join('/');
}

export function buildSnapshot(): PageSnapshot {
  const candidates = Array.from(document.querySelectorAll(INTERACTIVE_SELECTORS));
  const visible = candidates.filter(isVisible);

  let counter = 1;

  const elements: ElementRef[] = visible.map((el) => {
    // Assign ref only if not already set
    if (!el.getAttribute('data-ai-ref')) {
      el.setAttribute('data-ai-ref', `e${counter}`);
    }
    counter++;

    const ref = el.getAttribute('data-ai-ref') ?? `e${counter - 1}`;
    const tag = el.tagName.toUpperCase();
    const role = inferRole(el);
    const name = getAccessibleName(el);

    const htmlInputEl = el as HTMLInputElement;
    const type = htmlInputEl.type ? htmlInputEl.type : undefined;
    const value =
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ? htmlInputEl.value ?? '' : undefined;
    const disabled = (el as HTMLInputElement).disabled ?? false;
    const visible = isVisible(el);

    const rect = el.getBoundingClientRect();
    const boundingBox = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    const cssSelector = buildCssSelector(el);
    const xpath = buildXPath(el);

    const ref_: ElementRef = {
      ref,
      tag,
      role,
      name,
      disabled,
      visible,
      boundingBox,
      cssSelector,
      xpath,
    };

    if (type !== undefined) ref_.type = type;
    if (value !== undefined) ref_.value = value;

    return ref_;
  });

  return {
    url: window.location.href,
    title: document.title,
    timestamp: new Date().toISOString(),
    elements,
    scrollY: window.scrollY,
    pageHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  };
}

export function findElementByRef(ref: string): Element | null {
  return document.querySelector(`[data-ai-ref="${ref}"]`);
}

export function buildSnapshotText(snapshot: PageSnapshot): string {
  const lines: string[] = [
    `Page: ${snapshot.title}`,
    `URL: ${snapshot.url}`,
    `Scroll: ${snapshot.scrollY}/${snapshot.pageHeight}`,
    '',
    'Interactive elements:',
  ];

  for (const el of snapshot.elements) {
    const tagStr = el.type ? `${el.tag}[${el.type}]` : el.tag;
    const valueStr = el.value !== undefined ? ` value="${el.value}"` : '';
    const disabledStr = `(disabled=${el.disabled})`;
    lines.push(`[@${el.ref}] ${tagStr} "${el.name}"${valueStr} ${disabledStr}`);
  }

  return lines.join('\n');
}

export function clearRefAttributes(): void {
  const refEls = document.querySelectorAll('[data-ai-ref]');
  for (const el of refEls) {
    el.removeAttribute('data-ai-ref');
  }
}
