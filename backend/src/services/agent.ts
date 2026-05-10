import { toolRegistry } from '../tools/registry';
import { getActiveAIConfig, AIProviderFactory } from './ai-provider';
import { BOUNDARY_SYSTEM_INSTRUCTION } from './content-boundary.service';

const SYSTEM_PROMPT = `You are DevFlow AI, a fast and accurate browser automation assistant.

${BOUNDARY_SYSTEM_INSTRUCTION}

## Core Loop (follow exactly)
1. Call takeSnapshot → get page state with element refs (@e1, @e2, …)
2. Plan 2-3 actions at once when safe (reduces round-trips)
3. Execute: clickRef, typeRef, navigate, openTab, scroll, pressKey, waitForCondition
4. Re-snapshot ONLY when you need updated refs (after navigation or dynamic changes)
5. Call taskComplete when done — include a short summary

## Speed Rules
- Batch independent actions in one turn (fill multiple fields before snapshotting again)
- Skip re-snapshot after simple clicks unless you expect a page change
- For simple Q&A tasks (no browser interaction needed), answer directly and call taskComplete
- Use openTab when user says "open in new tab"; use navigate to change the current tab

## Element References
- Refs (@eN) come from the most recent snapshot; they reset after navigation
- [below-fold] elements exist but aren't visible; scroll first if needed
- [disabled] elements cannot be interacted with

## Language
- Match the user's language (English, Hindi, Hinglish)
- Keep progress messages concise

## Memory
- "yaad rakhlo" / "remember" → writeMemory immediately
- Account details, rules, preferences → save to memory

## Form Filling
- getSitePrefs first, then apply defaults, then fill

## Error Handling
- On failure: re-snapshot once, try alternative element
- After 2 failures on same step: tell user and stop
- Never silently fail

## Identity
- "login as [name]" → getIdentity(name)`;

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
}): Promise<void> {
  const { command, sessionId, userId, currentUrl, sendProgress, sendBridgeAction } = params;

  const session: AgentSession = {
    sessionId,
    userId,
    status: 'running',
    cancelRequested: false,
  };
  activeSessions.set(sessionId, session);

  const toolContext = {
    userId,
    sessionId,
    sendProgress,
    sendBridgeAction,
  };

  // Resolve AI provider config once per agent run (avoids per-iteration DB reads)
  const aiConfig = await getActiveAIConfig(userId);
  const providerClient = AIProviderFactory.create(aiConfig);
  const tools = providerClient.getTools(toolRegistry);

  // Provider-agnostic message history
  const messages: unknown[] = [
    {
      role: 'user',
      content: currentUrl
        ? `Task: ${command}\n\nBrowser is currently at: ${currentUrl}\n\nStart by calling takeSnapshot to see the current page state.`
        : `Task: ${command}\n\nStart by calling takeSnapshot to see the current page state.`,
    },
  ];

  const MAX_ITERATIONS = 30;
  // Abort if the same tool fails this many times in a row (e.g. snapshot timeout loop)
  const MAX_CONSECUTIVE_ERRORS = 3;
  let iteration = 0;
  let consecutiveErrors = 0;

  try {
    await sendProgress('message', `Starting task: ${command}`);

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      if (session.cancelRequested) {
        await sendProgress('complete', 'Task cancelled.');
        session.status = 'cancelled';
        break;
      }

      const response = await providerClient.chat({
        messages,
        tools,
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 2048,
        model: aiConfig.model,
      });

      // Add assistant response to history (provider-specific format)
      messages.push(response.rawAssistantMessage);

      if (response.stopReason === 'end_turn') {
        if (response.textContent) {
          await sendProgress('message', response.textContent);
        }
        await sendProgress('complete', response.textContent ?? 'Done.');
        session.status = 'completed';
        break;
      }

      if (response.stopReason === 'tool_calls') {
        for (const toolCall of response.toolCalls) {
          await sendProgress('tool_start', `⚙️ ${toolCall.name}...`);

          const result = await toolRegistry.execute(toolCall.name, toolCall.input, toolContext);

          if (result.success) {
            await sendProgress('tool_success', `✅ ${toolCall.name} completed`);
            consecutiveErrors = 0; // reset on success
          } else {
            await sendProgress('tool_error', `❌ ${toolCall.name} failed: ${result.error}`);
            consecutiveErrors++;

            // Safety valve: if tools keep failing (e.g. snapshot timeout loop), abort
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              await sendProgress(
                'error',
                `Task stopped: ${consecutiveErrors} consecutive tool failures. Last error: ${result.error ?? 'unknown'}. Make sure you are on a regular web page (not chrome:// or a new tab).`,
              );
              session.status = 'failed';
              return;
            }
          }

          // Push tool result in the format this provider expects
          messages.push(providerClient.formatToolResult(toolCall.id, result));

          // Stop processing if task was marked complete
          if (toolCall.name === 'taskComplete') {
            session.status = 'completed';
            activeSessions.delete(sessionId);
            return;
          }
        }
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      await sendProgress('error', 'Maximum steps reached. Task stopped.');
      session.status = 'failed';
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sendProgress('error', `Agent error: ${message}`);
    session.status = 'failed';
  } finally {
    activeSessions.delete(sessionId);
  }
}
