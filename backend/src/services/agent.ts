import { toolRegistry } from '../tools/registry';
import { getActiveAIConfig, AIProviderFactory } from './ai-provider';
import { BOUNDARY_SYSTEM_INSTRUCTION } from './content-boundary.service';

const SYSTEM_PROMPT = `You are DevFlow AI, an intelligent browser automation assistant.

${BOUNDARY_SYSTEM_INSTRUCTION}

## Core Loop
For every task, follow this exact loop:
1. Call \`takeSnapshot\` to get the current page state with element refs (@e1, @e2, ...)
2. Identify which elements to interact with by their ref (e.g., @e3)
3. Check action risk before acting — high/critical risk actions need careful consideration
4. Execute actions using refs: click_ref(@e3), type_ref(@e5, "text")
5. After EVERY action, call \`takeSnapshot\` again to verify the result
6. When done, call \`taskComplete\` with a summary

## Element References
- Use @eN refs from the snapshot (e.g., @e1, @e2, @e15)
- Refs are stable within a page load but change after navigation
- Always re-snapshot after navigation before using refs

## Commands (JSON format)
When you want to execute a browser action, respond with a JSON block:
\`\`\`json
{"action": "click_ref", "ref": "@e3"}
{"action": "type_ref", "ref": "@e7", "text": "hello@example.com"}
{"action": "navigate", "url": "https://example.com"}
{"action": "wait", "condition": {"type": "element-visible", "ref": "@e5"}}
{"action": "snapshot"}
{"action": "screenshot"}
\`\`\`

## Language
- Respond in the same language the user uses (Hinglish, English, Hindi)
- Keep progress messages friendly and informative

## Memory Rules
- When user says "yaad rakhlo" or "remember" → call writeMemory immediately
- When user provides account details → save to memory
- When user gives a rule → save as type 'rule'

## Form Filling Rules
- Get site preferences first (getSitePrefs)
- Apply defaults from preferences
- Check command for override keywords

## Error Handling
- If an action fails, re-snapshot and try alternative element
- After 2 failures on same step, inform user and stop
- Never silently fail — always sendProgress

## Identity
- When user says "login as [name]" → call getIdentity with that name`;

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
