// backend/src/services/planner.ts

import type { AIProviderClient } from './ai-provider';

// ─── Shared types used across all APEX services ───────────────────────────────

export type AgentErrorType =
  | 'ELEMENT_GONE'
  | 'PAGE_NOT_READY'
  | 'STUCK_LOOP'
  | 'UNEXPECTED_STATE'
  | 'PERMISSION_DENIED'
  | 'AMBIGUOUS_TARGET'
  | 'NETWORK_TIMEOUT'
  | 'TASK_IMPOSSIBLE'
  | 'CONSECUTIVE_UNRELATED';

export interface FailedAttempt {
  step: number;
  tool: string;
  target: string;
  error: string;
  errorType: AgentErrorType;
  timestamp: number;
}

// ─── Intent Lock ─────────────────────────────────────────────────────────────

export interface IntentLock {
  understood_as: string;
  scope: string;
  will_not_do: string[];
  ready_to_proceed: boolean;
  clarification_needed?: string;
}

// ─── Planned Task ─────────────────────────────────────────────────────────────

export interface PlannedStep {
  index: number;
  description: string;
  type: 'navigate' | 'observe' | 'interact' | 'verify' | 'ask';
  completed: boolean;
  attempts: number;
  failedAttempts: FailedAttempt[];
}

export interface PlannedTask {
  goal: string;
  scope: string;
  willNotDo: string[];
  steps: PlannedStep[];
  currentStepIndex: number;
  complexity: 'simple' | 'medium' | 'complex';
  createdAt: number;
}

// ─── JSON parsing helper ──────────────────────────────────────────────────────

export function parseJsonResponse(text: string | null): unknown {
  if (!text) return null;
  // Try direct parse
  try { return JSON.parse(text); } catch { /* fall through */ }
  // Try extracting from ```json ... ``` block
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1]); } catch { /* fall through */ }
  }
  // Try finding first { ... } block
  const brace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (brace !== -1 && lastBrace > brace) {
    try { return JSON.parse(text.slice(brace, lastBrace + 1)); } catch { /* fall through */ }
  }
  return null;
}

// ─── Intent Lock prompt ───────────────────────────────────────────────────────

const INTENT_LOCK_SYSTEM = `You are DevFlow AI, an enterprise browser automation agent.

The user has given you a task. Before doing anything, output ONLY a JSON object with this exact structure:

{
  "understood_as": "one clear sentence describing what you understand the task to be",
  "scope": "brief description of what pages/sites/actions this involves",
  "will_not_do": ["list", "of", "things", "outside", "this", "task"],
  "ready_to_proceed": true
}

Rules:
- Set ready_to_proceed to false AND add "clarification_needed" ONLY if the task is genuinely impossible to interpret without more information.
- Do NOT set ready_to_proceed to false for complex tasks — complexity is fine, ambiguity is not.
- Keep understood_as short and action-oriented (starts with a verb).
- Output ONLY valid JSON. No markdown, no explanation, no code fences.`;

// ─── Planning prompt ──────────────────────────────────────────────────────────

const PLANNING_SYSTEM = `You are DevFlow AI, an enterprise browser automation agent.

You have confirmed your understanding of the task. Now output ONLY a JSON object with this exact structure:

{
  "goal": "clear one-sentence goal starting with a verb",
  "scope": "what pages/sites/data this involves",
  "will_not_do": ["things", "outside", "scope"],
  "complexity": "simple",
  "ambiguities": [],
  "steps": [
    { "index": 1, "description": "Take a snapshot to see the current page", "type": "observe" },
    { "index": 2, "description": "Click the Login button", "type": "interact" }
  ]
}

Step types: navigate (go to URL) | observe (snapshot/screenshot) | interact (click/type/form) | verify (check result) | ask (user input needed)
Complexity: "simple" = 1-3 steps | "medium" = 4-8 steps | "complex" = 9+ steps or multi-site

Rules:
- ambiguities = [] unless it is LITERALLY IMPOSSIBLE to proceed without user input
- Always start with an observe step (takeSnapshot) unless currently on the correct page
- Output ONLY valid JSON. No markdown, no explanation, no code fences.`;

// ─── Exported functions ───────────────────────────────────────────────────────

export async function runIntentLock(
  command: string,
  currentUrl: string | undefined,
  providerClient: AIProviderClient,
  model: string,
): Promise<IntentLock> {
  const userMsg = currentUrl
    ? `Task: ${command}\n\nBrowser is currently at: ${currentUrl}`
    : `Task: ${command}`;

  try {
    const response = await providerClient.chat({
      messages: [{ role: 'user', content: userMsg }],
      tools: [],
      systemPrompt: INTENT_LOCK_SYSTEM,
      maxTokens: 512,
      model,
    });

    const parsed = parseJsonResponse(response.textContent) as Record<string, unknown> | null;
    if (parsed && typeof parsed['understood_as'] === 'string') {
      const willNotDo = Array.isArray(parsed['will_not_do'])
        ? (parsed['will_not_do'] as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];
      return {
        understood_as: parsed['understood_as'],
        scope: typeof parsed['scope'] === 'string' ? parsed['scope'] : 'current browser tab',
        will_not_do: willNotDo,
        ready_to_proceed: parsed['ready_to_proceed'] !== false,
        clarification_needed: typeof parsed['clarification_needed'] === 'string' ? parsed['clarification_needed'] : undefined,
      };
    }
  } catch (err) {
    console.warn('[planner] AI call failed, using fallback:', err instanceof Error ? err.message : String(err));
  }

  // Fallback: proceed with the raw command as-is
  return {
    understood_as: command,
    scope: 'current browser tab',
    will_not_do: [],
    ready_to_proceed: true,
  };
}

export async function runPlanning(
  command: string,
  intentLock: IntentLock,
  currentUrl: string | undefined,
  providerClient: AIProviderClient,
  model: string,
): Promise<PlannedTask> {
  const userMsg = [
    `Task: ${command}`,
    `Understood as: ${intentLock.understood_as}`,
    currentUrl ? `Browser currently at: ${currentUrl}` : null,
  ].filter(Boolean).join('\n');

  try {
    const response = await providerClient.chat({
      messages: [{ role: 'user', content: userMsg }],
      tools: [],
      systemPrompt: PLANNING_SYSTEM,
      maxTokens: 1024,
      model,
    });

    const parsed = parseJsonResponse(response.textContent) as {
      goal?: string;
      scope?: string;
      will_not_do?: string[];
      complexity?: string;
      steps?: Array<{ index: number; description: string; type: string }>;
    } | null;

    if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
      return {
        goal: parsed.goal ?? intentLock.understood_as,
        scope: parsed.scope ?? intentLock.scope,
        willNotDo: Array.isArray(parsed.will_not_do)
          ? (parsed.will_not_do as unknown[]).filter((x): x is string => typeof x === 'string')
          : intentLock.will_not_do,
        steps: parsed.steps.map((s, i) => ({
          index: s.index ?? i + 1,
          description: s.description ?? `Step ${i + 1}`,
          type: (['navigate', 'observe', 'interact', 'verify', 'ask'].includes(s.type)
            ? s.type
            : 'interact') as PlannedStep['type'],
          completed: false,
          attempts: 0,
          failedAttempts: [],
        })),
        currentStepIndex: 0,
        complexity: (['simple', 'medium', 'complex'].includes(parsed.complexity ?? '') && parsed.complexity
          ? parsed.complexity as PlannedTask['complexity']
          : 'medium'),
        createdAt: Date.now(),
      };
    }
  } catch (err) {
    console.warn('[planner] AI call failed, using fallback:', err instanceof Error ? err.message : String(err));
  }

  // Fallback: two-step plan (observe + interact)
  return {
    goal: intentLock.understood_as,
    scope: intentLock.scope,
    willNotDo: intentLock.will_not_do,
    steps: [
      { index: 1, description: 'Take snapshot to assess current page', type: 'observe', completed: false, attempts: 0, failedAttempts: [] },
      { index: 2, description: `Complete task: ${command.slice(0, 100)}`, type: 'interact', completed: false, attempts: 0, failedAttempts: [] },
    ],
    currentStepIndex: 0,
    complexity: 'medium',
    createdAt: Date.now(),
  };
}
