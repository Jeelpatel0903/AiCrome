import Anthropic from '@anthropic-ai/sdk';
import { toolRegistry } from '../tools/registry';
import { config } from '../config';

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

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

  const messages: Anthropic.MessageParam[] = [
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

      const response = await anthropic.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: toolRegistry.toAnthropicTools() as Anthropic.Tool[],
        messages,
      });

      // Add assistant response to history
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        // Extract text response
        const textBlock = response.content.find((b) => b.type === 'text');
        if (textBlock && textBlock.type === 'text') {
          await sendProgress('message', textBlock.text);
        }
        session.status = 'completed';
        break;
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of toolUseBlocks) {
          if (block.type !== 'tool_use') continue;

          await sendProgress('tool_start', `⚙️ ${block.name}...`);

          const result = await toolRegistry.execute(
            block.name,
            block.input as Record<string, unknown>,
            toolContext,
          );

          if (result.success) {
            await sendProgress('tool_success', `✅ ${block.name} completed`);
          } else {
            await sendProgress('tool_error', `❌ ${block.name} failed: ${result.error}`);
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });

          // Stop processing tools if task was marked complete
          if (block.name === 'taskComplete') {
            session.status = 'completed';
            activeSessions.delete(sessionId);
            return;
          }
        }

        messages.push({ role: 'user', content: toolResults });
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
