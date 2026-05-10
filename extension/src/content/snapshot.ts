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
  cssSelector?: string;
  xpath?: string;
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


// Max interactive elements returned per snapshot (keeps token usage manageable)
const MAX_SNAPSHOT_ELEMENTS = 200;

export function buildSnapshot(): PageSnapshot {
  const candidates = Array.from(document.querySelectorAll(INTERACTIVE_SELECTORS));
  const visible = candidates.filter(isVisible);

  // Sort viewport-first: elements closer to the top of the visible area come first
  const viewportH = window.innerHeight;
  visible.sort((a, b) => {
    const aY = a.getBoundingClientRect().top;
    const bY = b.getBoundingClientRect().top;
    // In-viewport elements (0 ≤ top < viewportH) first, then below-fold
    const aInView = aY >= 0 && aY < viewportH ? 0 : 1;
    const bInView = bY >= 0 && bY < viewportH ? 0 : 1;
    if (aInView !== bInView) return aInView - bInView;
    return aY - bY;
  });

  // Cap total elements to avoid huge prompts
  const capped = visible.slice(0, MAX_SNAPSHOT_ELEMENTS);

  let counter = 1;

  const elements: ElementRef[] = capped.map((el) => {
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
    const elVisible = isVisible(el);

    const rect = el.getBoundingClientRect();
    const boundingBox = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    // Note: cssSelector and xpath are expensive to compute and not needed for
    // ref-based interactions. Skip them to keep snapshot fast.
    const ref_: ElementRef = {
      ref,
      tag,
      role,
      name,
      disabled,
      visible: elVisible,
      boundingBox,
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
  const moreBelow =
    snapshot.pageHeight > snapshot.scrollY + snapshot.viewportHeight + 50;

  const lines: string[] = [
    `Page: ${snapshot.title}`,
    `URL: ${snapshot.url}`,
    `Viewport: ${snapshot.viewportHeight}px | Scroll: ${snapshot.scrollY}/${snapshot.pageHeight}${moreBelow ? ' (more content below — scroll to see)' : ''}`,
    `Elements: ${snapshot.elements.length}${snapshot.elements.length >= MAX_SNAPSHOT_ELEMENTS ? ` (capped at ${MAX_SNAPSHOT_ELEMENTS}; scroll to reveal more)` : ''}`,
    '',
    'Interactive elements:',
  ];

  for (const el of snapshot.elements) {
    const tagStr = el.type ? `${el.tag}[${el.type}]` : el.tag;
    const valueStr = el.value !== undefined ? ` value="${el.value}"` : '';
    const disabledStr = el.disabled ? ' [disabled]' : '';
    const inView = el.boundingBox.y >= 0 && el.boundingBox.y < snapshot.viewportHeight;
    const viewStr = inView ? '' : ' [below-fold]';
    lines.push(`[@${el.ref}] ${tagStr} "${el.name}"${valueStr}${disabledStr}${viewStr}`);
  }

  return lines.join('\n');
}

export function clearRefAttributes(): void {
  const refEls = document.querySelectorAll('[data-ai-ref]');
  for (const el of refEls) {
    el.removeAttribute('data-ai-ref');
  }
}
