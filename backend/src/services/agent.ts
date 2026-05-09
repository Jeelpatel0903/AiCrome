import { toolRegistry } from '../tools/registry';
import { getActiveAIConfig, AIProviderFactory } from './ai-provider';

const SYSTEM_PROMPT = `You are DevFlow AI, an intelligent browser automation assistant. You help users automate repetitive tasks in their web browsers.

## Core Behavior
1. ALWAYS start by calling readMemory with the current URL and task description to load relevant context
2. ALWAYS call getSitePrefs before filling any form
3. After EVERY browser action (click, type, navigate), call takeScreenshot to verify the result
4. Send progress updates frequently using sendProgress so the user knows what you're doing
5. When a task is complete, call taskComplete with a clear summary

## Language
- Respond in the same language the user uses (Hinglish, English, Hindi)
- Keep messages friendly and informative
- Use simple, clear language

## Memory Rules
- When user says "yaad rakhlo" or "remember" → call writeMemory immediately
- When user provides account details or preferences → save to memory
- When user gives a rule → save as type 'rule'

## Form Filling Rules
- Get site preferences first (getSitePrefs)
- Apply defaults from preferences
- Check command for override keywords matching overrideRules
- Use addFormRow for dynamic forms that need multiple rows

## Error Handling
- If an action fails, try once more with a different approach
- After 2 failures, inform the user with sendProgress and stop
- Never silently fail

## Identity Rules
- When user says "login as [name]" → call getIdentity with that name
- Use returned credentials to fill login form`;

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
      content: currentUrl ? `Current URL: ${currentUrl}\n\nTask: ${command}` : command,
    },
  ];

  const MAX_ITERATIONS = 50;
  let iteration = 0;

  try {
    await sendProgress('message', `Starting task: ${command}`);

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      if (session.cancelRequested) {
        await sendProgress('message', 'Task cancelled by user.');
        session.status = 'cancelled';
        break;
      }

      const response = await providerClient.chat({
        messages,
        tools,
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 4096,
        model: aiConfig.model,
      });

      // Add assistant response to history (provider-specific format)
      messages.push(response.rawAssistantMessage);

      if (response.stopReason === 'end_turn') {
        if (response.textContent) {
          await sendProgress('message', response.textContent);
        }
        session.status = 'completed';
        break;
      }

      if (response.stopReason === 'tool_calls') {
        for (const toolCall of response.toolCalls) {
          await sendProgress('tool_start', `⚙️ ${toolCall.name}...`);

          const result = await toolRegistry.execute(toolCall.name, toolCall.input, toolContext);

          if (result.success) {
            await sendProgress('tool_success', `✅ ${toolCall.name} completed`);
          } else {
            await sendProgress('tool_error', `❌ ${toolCall.name} failed: ${result.error}`);
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
