// backend/src/services/world-model.ts

import type { FailedAttempt } from './planner';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PageElement {
  ref: string;
  tag: string;
  label: string;
  type?: string;
  disabled: boolean;
  belowFold: boolean;
}

export interface DetectedForm {
  fields: Array<{
    ref: string;
    label: string;
    type: string;
    required: boolean;
    currentValue?: string;
  }>;
  submitRef?: string;
}

export interface NavItem {
  ref: string;
  label: string;
  href?: string;
  active: boolean;
}

export interface WorldState {
  pageType: 'login' | 'dashboard' | 'form' | 'list' | 'detail' | 'modal' | 'error' | 'unknown';
  pageIntent: string;
  currentUrl: string;
  pageFingerprint: string;
  previousFingerprint: string;
  fingerprintChanged: boolean;
  lastAction: { tool: string; target: string; outcome: 'success' | 'no-change' | 'unexpected' };
  lastPrediction: string;
  predictionAccurate: boolean;
  completedStepsSummary: string;
  failedAttempts: FailedAttempt[];
  interactive: PageElement[];
  forms?: DetectedForm[];
  primaryAction?: PageElement;
}

// ─── Initial state ────────────────────────────────────────────────────────────

export function buildInitialWorldState(currentUrl?: string): WorldState {
  return {
    pageType: 'unknown',
    pageIntent: 'Unknown — call takeSnapshot first',
    currentUrl: currentUrl ?? '',
    pageFingerprint: '',
    previousFingerprint: '',
    fingerprintChanged: false,
    lastAction: { tool: 'none', target: 'none', outcome: 'success' },
    lastPrediction: '',
    predictionAccurate: true,
    completedStepsSummary: '',
    failedAttempts: [],
    interactive: [],
    forms: undefined,
    primaryAction: undefined,
  };
}

// ─── Fingerprint ──────────────────────────────────────────────────────────────

export function computeFingerprint(data: Record<string, unknown>): string {
  const title = String(data['title'] ?? '');
  const url = String(data['url'] ?? '');
  const bodyLength = String(data['bodyLength'] ?? data['elementCount'] ?? 0);
  const elementCount = String(data['elementCount'] ?? 0);
  const raw = `${title}|${url}|${bodyLength}|${elementCount}`;
  // Simple deterministic hash (djb2)
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = (h * 33) ^ raw.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ─── Snapshot data → WorldState update ───────────────────────────────────────

export function updateWorldStateFromSnapshot(
  prev: WorldState,
  snapshotData: Record<string, unknown>,
  lastTool: string,
  lastTarget: string,
  lastSuccess: boolean,
  lastPrediction: string,
): WorldState {
  const newFingerprint = computeFingerprint(snapshotData);
  const fingerprintChanged = prev.pageFingerprint !== '' && newFingerprint !== prev.pageFingerprint;

  // Determine outcome
  let outcome: WorldState['lastAction']['outcome'] = lastSuccess ? 'success' : 'unexpected';
  if (lastSuccess && !fingerprintChanged && lastTool !== 'takeSnapshot' && lastTool !== 'none') {
    const interactionTools = ['clickRef', 'typeRef', 'clickElement', 'typeText', 'pressKey', 'navigate', 'openTab'];
    if (interactionTools.includes(lastTool)) {
      outcome = 'no-change';
    }
  }

  // Detect if prediction was accurate
  const predictionAccurate = lastPrediction === '' || outcome === 'success';

  // Extract page type from snapshot data (set by enhanced _pageSnapshot)
  const rawPageType = String(snapshotData['pageType'] ?? 'unknown');
  const validTypes: WorldState['pageType'][] = ['login', 'dashboard', 'form', 'list', 'detail', 'modal', 'error', 'unknown'];
  const pageType: WorldState['pageType'] = validTypes.includes(rawPageType as WorldState['pageType'])
    ? (rawPageType as WorldState['pageType'])
    : 'unknown';

  // Build page intent
  const pageIntent = buildPageIntent(pageType, snapshotData);

  // Parse forms from snapshot data
  const rawForms = snapshotData['forms'];
  const forms: DetectedForm[] | undefined = Array.isArray(rawForms)
    ? (rawForms as DetectedForm[])
    : undefined;

  // Parse interactive elements from snapshot text
  const interactive = parseElementsFromSnapshotText(String(snapshotData['text'] ?? ''));

  // Find primary action (first non-disabled button/submit in viewport)
  const primaryAction = interactive.find(
    (el) => !el.disabled && !el.belowFold && ['BUTTON', 'A', 'INPUT[submit]', 'INPUT[button]'].includes(el.tag),
  );

  return {
    pageType,
    pageIntent,
    currentUrl: String(snapshotData['url'] ?? prev.currentUrl),
    pageFingerprint: newFingerprint,
    previousFingerprint: prev.pageFingerprint,
    fingerprintChanged,
    lastAction: { tool: lastTool, target: lastTarget, outcome },
    lastPrediction,
    predictionAccurate,
    completedStepsSummary: prev.completedStepsSummary,
    failedAttempts: prev.failedAttempts,
    interactive,
    forms,
    primaryAction,
  };
}

function buildPageIntent(pageType: WorldState['pageType'], data: Record<string, unknown>): string {
  const title = String(data['title'] ?? '');
  switch (pageType) {
    case 'login': return `Login page${title ? ` — ${title}` : ''}`;
    case 'dashboard': return `Dashboard${title ? ` — ${title}` : ''}`;
    case 'form': return `Form page${title ? ` — ${title}` : ''}`;
    case 'list': return `List/table view${title ? ` — ${title}` : ''}`;
    case 'modal': return `Modal dialog open${title ? ` on ${title}` : ''}`;
    case 'error': return `Error state${title ? ` on ${title}` : ''}`;
    default: return title || String(data['url'] ?? '') || 'Unknown page';
  }
}

function parseElementsFromSnapshotText(text: string): PageElement[] {
  const elements: PageElement[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    // Match: [@eN] TAG[type] "label" [disabled] [below-fold]
    const m = line.match(/^\[@(e\d+)\]\s+(\S+)\s+"([^"]*)"(.*)/);
    if (!m) continue;
    const ref = m[1];
    const tagFull = m[2];
    const label = m[3];
    const rest = m[4];
    const tagMatch = tagFull.match(/^([A-Z]+)(?:\[([^\]]+)\])?$/);
    const type = tagMatch?.[2];
    elements.push({
      ref: `@${ref}`,
      tag: tagFull,
      label,
      type,
      disabled: rest.includes('[disabled]'),
      belowFold: rest.includes('[below-fold]'),
    });
  }
  return elements;
}

// ─── Context compression ──────────────────────────────────────────────────────

export function shouldCompressContext(completedSteps: string[]): boolean {
  return completedSteps.length > 0 && completedSteps.length % 5 === 0;
}

export function compressMessages(
  messages: unknown[],
  completedSteps: string[],
  keepLastN = 6,
): unknown[] {
  if (messages.length <= keepLastN) return messages;

  const summary = [
    `[CONTEXT SUMMARY — ${completedSteps.length} steps completed]`,
    ...completedSteps.map((s) => `- ${s}`),
    '[Full message history for these steps removed to save context]',
  ].join('\n');

  const summaryMsg = { role: 'user', content: summary };
  const recent = messages.slice(-keepLastN);
  return [summaryMsg, ...recent];
}

// ─── Update completed steps summary ──────────────────────────────────────────

export function addCompletedStep(world: WorldState, stepSummary: string): WorldState {
  const prev = world.completedStepsSummary;
  return {
    ...world,
    completedStepsSummary: prev ? `${prev}\n${stepSummary}` : stepSummary,
  };
}
