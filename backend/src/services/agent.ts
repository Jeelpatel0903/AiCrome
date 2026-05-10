// backend/src/services/agent.ts

import { toolRegistry } from '../tools/registry';
import { getActiveAIConfig, AIProviderFactory } from './ai-provider';
import { runIntentLock, runPlanning } from './planner';
import type { PlannedTask, FailedAttempt } from './planner';
import {
  buildInitialWorldState,
  updateWorldStateFromSnapshot,
  addCompletedStep,
  shouldCompressContext,
  compressMessages,
} from './world-model';
import type { WorldState } from './world-model';
import {
  classifyError,
  getMaxRetries,
  isTerminalError,
  buildRecoveryHeader,
  shouldBlockOnConsecutiveErrors,
} from './error-recovery';
import {
  buildSystemPrompt,
  buildVerifyingSystemPrompt,
} from './prompt-builder';

// ─── Session management ───────────────────────────────────────────────────────

export interface AgentSession {
  sessionId: string;
  userId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  cancelRequested: boolean;
}

const activeSessions = new Map<string, AgentSession>();

export function getSession(sessionId: string): AgentSession | undefined {
  return activeSessions.get(sessionId);
}

export function cancelSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.cancelRequested = true;
    return true;
  }
  return false;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runAgent(params: {
  command: string;
  sessionId: string;
  userId: string;
  currentUrl?: string;
  sendProgress: (type: string, message: string) => Promise<void>;
  sendBridgeAction: (
    action: string,
    params: Record<string, unknown>,
  ) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;
  waitForUserAnswer: (questionId: string) => Promise<string>;
}): Promise<void> {
  const { command, sessionId, userId, currentUrl, sendProgress, sendBridgeAction, waitForUserAnswer } = params;

  const session: AgentSession = {
    sessionId, userId, status: 'running', cancelRequested: false,
  };
  activeSessions.set(sessionId, session);

  const toolContext = { userId, sessionId, sendProgress, sendBridgeAction, waitForUserAnswer };

  try {
    // Resolve AI config once per run
    const aiConfig = await getActiveAIConfig(userId);
    const providerClient = AIProviderFactory.create(aiConfig);
    const tools = providerClient.getTools(toolRegistry);

    await sendProgress('message', `🚀 Starting: ${command}`);

    // ── Phase 1: Intent Lock ───────────────────────────────────────────────
    if (session.cancelRequested) { await sendProgress('complete', 'Task cancelled.'); session.status = 'cancelled'; return; }

    const intentLock = await runIntentLock(command, currentUrl, providerClient, aiConfig.model);
    await sendProgress('message', `🎯 ${intentLock.understood_as}`);

    if (!intentLock.ready_to_proceed && intentLock.clarification_needed) {
      await sendProgress('asking', JSON.stringify({
        questionId: `intent-${sessionId}`,
        question: intentLock.clarification_needed,
      }));
      // Continue with best-effort understanding after surfacing question
    }

    // ── Phase 2: Planning ─────────────────────────────────────────────────
    if (session.cancelRequested) { await sendProgress('complete', 'Task cancelled.'); session.status = 'cancelled'; return; }

    const task = await runPlanning(command, intentLock, currentUrl, providerClient, aiConfig.model);
    await sendProgress('message', `📋 Plan: ${task.steps.length} steps (${task.complexity})\n${task.steps.map((s) => `  ${s.index}. ${s.description}`).join('\n')}`);

    // ── Phase 3: Executing ────────────────────────────────────────────────
    let world: WorldState = buildInitialWorldState(currentUrl);
    const completedSteps: string[] = [];
    const allFailedAttempts: FailedAttempt[] = [];
    let lastPrediction = '';
    let lastToolName = 'none';
    let lastToolTarget = 'none';

    // Provider-agnostic message history
    const messages: unknown[] = [
      {
        role: 'user',
        content: currentUrl
          ? `Task: ${command}\n\nBrowser is currently at: ${currentUrl}`
          : `Task: ${command}`,
      },
    ];

    const MAX_EXECUTING = 25;
    let execIteration = 0;
    let taskDone = false;

    while (execIteration < MAX_EXECUTING && !taskDone) {
      execIteration++;

      if (session.cancelRequested) {
        await sendProgress('complete', 'Task cancelled.');
        session.status = 'cancelled';
        return;
      }

      // Compress context every 5 completed steps
      if (shouldCompressContext(completedSteps)) {
        const compressed = compressMessages(messages, completedSteps);
        messages.length = 0;
        messages.push(...compressed);
      }

      // Build dynamic system prompt for this turn
      const systemPrompt = buildSystemPrompt(task, world);

      const response = await providerClient.chat({
        messages,
        tools,
        systemPrompt,
        maxTokens: 2048,
        model: aiConfig.model,
      });

      messages.push(response.rawAssistantMessage);

      // Handle end_turn (model finished without calling tools)
      if (response.stopReason === 'end_turn') {
        if (response.textContent) await sendProgress('message', response.textContent);
        // Check for step completion signal
        const stepMatch = response.textContent?.match(/\[STEP:(\d+):COMPLETE\]/);
        if (stepMatch) {
          const stepNum = parseInt(stepMatch[1], 10);
          const step = task.steps.find((s) => s.index === stepNum);
          if (step) {
            step.completed = true;
            task.currentStepIndex = stepNum;
            completedSteps.push(`Step ${stepNum}: ${step.description}`);
            world = addCompletedStep(world, `Step ${stepNum}: ${step.description}`);
          }
        }
        // If all steps complete, break out
        if (task.steps.every((s) => s.completed)) { taskDone = true; break; }
        continue;
      }

      if (response.stopReason !== 'tool_calls') continue;

      // Execute tool calls
      for (const toolCall of response.toolCalls) {
        await sendProgress('tool_start', `⚙️ ${toolCall.name}...`);

        // Detect step completion signal in text before tool calls
        const stepMatch = response.textContent?.match(/\[STEP:(\d+):COMPLETE\]/);
        if (stepMatch) {
          const stepNum = parseInt(stepMatch[1], 10);
          const step = task.steps.find((s) => s.index === stepNum);
          if (step && !step.completed) {
            step.completed = true;
            task.currentStepIndex = stepNum;
            completedSteps.push(`Step ${stepNum}: ${step.description}`);
            world = addCompletedStep(world, `Step ${stepNum}: ${step.description}`);
          }
        }

        // Execute tool
        const result = await toolRegistry.execute(toolCall.name, toolCall.input, toolContext);

        // Update world state if this was a snapshot
        if (toolCall.name === 'takeSnapshot' && result.success && result.data) {
          lastToolName = toolCall.name;
          lastToolTarget = 'page';
          world = updateWorldStateFromSnapshot(
            world,
            result.data,
            lastToolName,
            lastToolTarget,
            true,
            lastPrediction,
          );
          lastPrediction = '';
        } else if (result.success) {
          lastToolName = toolCall.name;
          lastToolTarget = String(toolCall.input['ref'] ?? toolCall.input['url'] ?? toolCall.input['description'] ?? '');
          world = {
            ...world,
            lastAction: { tool: toolCall.name, target: lastToolTarget, outcome: 'success' },
            predictionAccurate: true,
          };
        }

        if (result.success) {
          await sendProgress('tool_success', `✅ ${toolCall.name} completed`);
        } else {
          await sendProgress('tool_error', `❌ ${toolCall.name} failed: ${result.error}`);

          // Classify and handle error
          const errorType = classifyError(toolCall.name, result.error ?? '', world);
          const failed: FailedAttempt = {
            step: task.currentStepIndex,
            tool: toolCall.name,
            target: lastToolTarget,
            error: result.error ?? 'unknown',
            errorType,
            timestamp: Date.now(),
          };
          allFailedAttempts.push(failed);
          world = { ...world, failedAttempts: [...world.failedAttempts, failed] };

          if (isTerminalError(errorType)) {
            await sendProgress('error', `Task stopped: ${errorType} — ${result.error ?? 'unknown'}`);
            session.status = 'failed';
            return;
          }

          if (shouldBlockOnConsecutiveErrors(allFailedAttempts)) {
            await sendProgress('error', 'Multiple unrelated failures detected. Please check the page and try again.');
            session.status = 'failed';
            return;
          }

          // Inject recovery context as next user message
          const maxRetries = getMaxRetries(errorType);
          const attemptCount = allFailedAttempts.filter((f) => f.errorType === errorType).length;
          if (attemptCount > maxRetries) {
            await sendProgress('error', `Recovery exhausted for ${errorType}. Task blocked.`);
            session.status = 'failed';
            return;
          }

          const doNotTry = allFailedAttempts.filter((f) => f.errorType === errorType).map((f) => `${f.tool}(${f.target})`);
          const recoveryHeader = buildRecoveryHeader(errorType, attemptCount, maxRetries, result.error ?? '', task.goal, doNotTry);
          messages.push(providerClient.formatToolResult(toolCall.id, result));
          messages.push({ role: 'user', content: recoveryHeader });
          continue;
        }

        messages.push(providerClient.formatToolResult(toolCall.id, result));

        // taskComplete signals done
        if (toolCall.name === 'taskComplete') {
          taskDone = true;
          session.status = 'completed';
          activeSessions.delete(sessionId);
          return;
        }
      }
    }

    if (execIteration >= MAX_EXECUTING && !taskDone) {
      await sendProgress('error', 'Maximum steps reached. Task stopped.');
      session.status = 'failed';
      return;
    }

    // ── Phase 4: Verifying ────────────────────────────────────────────────
    if (!taskDone) {
      const verifyPrompt = buildVerifyingSystemPrompt(task, world);
      const verifyResponse = await providerClient.chat({
        messages: [...messages, { role: 'user', content: 'Verify: has the goal been achieved?' }],
        tools: [],
        systemPrompt: verifyPrompt,
        maxTokens: 256,
        model: aiConfig.model,
      });

      const verdict = verifyResponse.textContent ?? '';
      if (verdict.toUpperCase().startsWith('SUCCESS')) {
        await sendProgress('complete', verdict.replace(/^SUCCESS:\s*/i, '✅ ').trim());
      } else {
        await sendProgress('complete', verdict.replace(/^INCOMPLETE:\s*/i, '⚠️ Almost done — ').trim());
      }
    } else {
      await sendProgress('complete', 'Task completed successfully.');
    }

    session.status = 'completed';

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sendProgress('error', `Agent error: ${message}`);
    session.status = 'failed';
  } finally {
    activeSessions.delete(sessionId);
  }
}
