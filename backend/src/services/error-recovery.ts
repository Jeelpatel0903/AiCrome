// backend/src/services/error-recovery.ts

import type { AgentErrorType, FailedAttempt } from './planner';
import type { WorldState } from './world-model';

// ─── Error classification ─────────────────────────────────────────────────────

export function classifyError(
  toolName: string,
  errorMsg: string,
  world: WorldState,
): AgentErrorType {
  const msg = errorMsg.toLowerCase();

  if (msg.includes('cannot access') || msg.includes('not allowed') || msg.includes('chrome://') || msg.includes('extension page')) {
    return 'PERMISSION_DENIED';
  }
  if (msg.includes('timed out') || msg.includes('bridge request timed out') || msg.includes('timeout')) {
    return 'NETWORK_TIMEOUT';
  }
  if (msg.includes('element not found') || msg.includes('not found: @')) {
    return 'ELEMENT_GONE';
  }
  if (msg.includes('0 elements') || (toolName === 'takeSnapshot' && msg.includes('no result'))) {
    return 'PAGE_NOT_READY';
  }
  if (world.lastAction.outcome === 'no-change' && world.pageFingerprint === world.previousFingerprint) {
    return 'STUCK_LOOP';
  }
  if (!world.predictionAccurate && world.pageType === 'error') {
    return 'UNEXPECTED_STATE';
  }

  return 'UNEXPECTED_STATE';
}

// ─── Recovery config per error type ──────────────────────────────────────────

const RECOVERY_CONFIG: Record<AgentErrorType, { maxRetries: number; strategy: string; terminal: boolean }> = {
  ELEMENT_GONE:          { maxRetries: 2, strategy: 'Re-snapshot the page to get fresh element refs, then find and use the equivalent element.', terminal: false },
  PAGE_NOT_READY:        { maxRetries: 3, strategy: 'Wait 2 seconds with waitForCondition:delay, then take a new snapshot.', terminal: false },
  STUCK_LOOP:            { maxRetries: 1, strategy: 'The page did not respond to the last action. Try scrolling down, then re-snapshot to find the target.', terminal: false },
  UNEXPECTED_STATE:      { maxRetries: 1, strategy: 'The page is in an unexpected state. Take a snapshot, understand the current state, then re-plan from here.', terminal: false },
  PERMISSION_DENIED:     { maxRetries: 0, strategy: 'This page cannot be automated. Navigate to a regular http/https web page first.', terminal: true },
  AMBIGUOUS_TARGET:      { maxRetries: 1, strategy: 'Ask the user one focused question to resolve the ambiguity, then proceed.', terminal: false },
  NETWORK_TIMEOUT:       { maxRetries: 2, strategy: 'Wait 2 seconds with waitForCondition:delay, then retry the same action.', terminal: false },
  TASK_IMPOSSIBLE:       { maxRetries: 0, strategy: 'All recovery strategies have been exhausted. Report full diagnosis to user.', terminal: true },
  CONSECUTIVE_UNRELATED: { maxRetries: 0, strategy: 'Multiple unrelated errors detected. Something systemic is wrong. Report to user.', terminal: true },
};

export function getMaxRetries(errorType: AgentErrorType): number {
  return RECOVERY_CONFIG[errorType]?.maxRetries ?? 1;
}

export function getRecoveryStrategy(errorType: AgentErrorType): string {
  return RECOVERY_CONFIG[errorType]?.strategy ?? 'Re-snapshot and retry.';
}

export function isTerminalError(errorType: AgentErrorType): boolean {
  return RECOVERY_CONFIG[errorType]?.terminal ?? false;
}

// ─── Recovery context header ──────────────────────────────────────────────────

export function buildRecoveryHeader(
  errorType: AgentErrorType,
  attempt: number,
  maxRetries: number,
  whatFailed: string,
  originalGoal: string,
  doNotTry: string[],
): string {
  return [
    `[RECOVERY — Attempt ${attempt} of ${maxRetries}]`,
    `ERROR TYPE: ${errorType}`,
    `WHAT FAILED: ${whatFailed}`,
    `STRATEGY: ${getRecoveryStrategy(errorType)}`,
    `ORIGINAL GOAL: ${originalGoal}`,
    doNotTry.length > 0 ? `DO NOT TRY AGAIN: ${doNotTry.join('; ')}` : '',
  ].filter(Boolean).join('\n');
}

// ─── Consecutive error tracking ───────────────────────────────────────────────

export function shouldBlockOnConsecutiveErrors(
  failedAttempts: FailedAttempt[],
  windowSize = 3,
): boolean {
  if (failedAttempts.length < windowSize) return false;
  const recent = failedAttempts.slice(-windowSize);
  const types = new Set(recent.map((a) => a.errorType));
  // 3 different error types in a row = systemic problem
  return types.size >= windowSize;
}
