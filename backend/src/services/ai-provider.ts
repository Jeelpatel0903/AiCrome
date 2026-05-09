/**
 * AI Provider abstraction layer.
 *
 * Implements the Strategy pattern so the agent can switch between
 * Anthropic, OpenAI, and DeepSeek without any changes to business logic.
 *
 * Adding a new provider:
 *   1. Implement `AIProviderClient`
 *   2. Add a case to `AIProviderFactory.create()`
 *   3. Add the provider + models to PROVIDER_MODELS in shared/src/types.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { AIConfig, AIProvider } from '@devflow/shared';
import { PROVIDER_MODELS } from '@devflow/shared';
import { db } from './firebase';
import { decrypt } from './encryption';
import { config } from '../config';
import { ToolRegistry } from '../tools/registry';

// ---------------------------------------------------------------------------
// Normalized types — provider-agnostic contract between agent.ts and providers
// ---------------------------------------------------------------------------

export interface NormalizedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface NormalizedResponse {
  stopReason: 'end_turn' | 'tool_calls';
  textContent: string | null;
  toolCalls: NormalizedToolCall[];
  /** Provider-specific message object pushed back into messages[] for next turn */
  rawAssistantMessage: unknown;
}

// ---------------------------------------------------------------------------
// Provider client interface
// ---------------------------------------------------------------------------

export interface AIProviderClient {
  chat(params: {
    messages: unknown[];
    tools: unknown[];
    systemPrompt: string;
    maxTokens: number;
    model: string;
  }): Promise<NormalizedResponse>;

  /** Wraps a tool execution result in the format the provider expects */
  formatToolResult(toolCallId: string, result: unknown): unknown;

  /** Returns tools in the format this provider expects */
  getTools(registry: ToolRegistry): unknown[];
}

// ---------------------------------------------------------------------------
// Anthropic implementation
// ---------------------------------------------------------------------------

class AnthropicProviderClient implements AIProviderClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  getTools(registry: ToolRegistry): unknown[] {
    return registry.toAnthropicTools();
  }

  async chat(params: {
    messages: unknown[];
    tools: unknown[];
    systemPrompt: string;
    maxTokens: number;
    model: string;
  }): Promise<NormalizedResponse> {
    const response = await this.client.messages.create({
      model: params.model as Anthropic.Model,
      max_tokens: params.maxTokens,
      system: params.systemPrompt,
      tools: params.tools as Anthropic.Tool[],
      messages: params.messages as Anthropic.MessageParam[],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

    const stopReason: NormalizedResponse['stopReason'] =
      response.stop_reason === 'tool_use' ? 'tool_calls' : 'end_turn';

    return {
      stopReason,
      textContent: textBlock?.type === 'text' ? textBlock.text : null,
      toolCalls: toolUseBlocks
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> })),
      rawAssistantMessage: { role: 'assistant', content: response.content },
    };
  }

  formatToolResult(toolCallId: string, result: unknown): unknown {
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolCallId,
          content: JSON.stringify(result),
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// OpenAI implementation (also used as base for DeepSeek)
// ---------------------------------------------------------------------------

class OpenAIProviderClient implements AIProviderClient {
  protected client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  getTools(registry: ToolRegistry): unknown[] {
    return registry.toOpenAITools();
  }

  async chat(params: {
    messages: unknown[];
    tools: unknown[];
    systemPrompt: string;
    maxTokens: number;
    model: string;
  }): Promise<NormalizedResponse> {
    const messagesWithSystem = [
      { role: 'system', content: params.systemPrompt },
      ...params.messages,
    ] as OpenAI.ChatCompletionMessageParam[];

    const response = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens,
      tools: params.tools as OpenAI.ChatCompletionTool[],
      messages: messagesWithSystem,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error('OpenAI returned no choices');

    const finishReason = choice.finish_reason;
    const stopReason: NormalizedResponse['stopReason'] =
      finishReason === 'tool_calls' ? 'tool_calls' : 'end_turn';

    type FunctionToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
    const toolCalls: NormalizedToolCall[] = (choice.message.tool_calls ?? [])
      .filter((tc): tc is FunctionToolCall => tc.type === 'function')
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

    return {
      stopReason,
      textContent: choice.message.content ?? null,
      toolCalls,
      rawAssistantMessage: { role: 'assistant', content: choice.message.content, tool_calls: choice.message.tool_calls },
    };
  }

  formatToolResult(toolCallId: string, result: unknown): unknown {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify(result),
    };
  }
}

// ---------------------------------------------------------------------------
// DeepSeek implementation — OpenAI-compatible API, different base URL
// ---------------------------------------------------------------------------

class DeepSeekProviderClient extends OpenAIProviderClient {
  constructor(apiKey: string) {
    super(apiKey, 'https://api.deepseek.com');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export class AIProviderFactory {
  static create(config: AIConfig): AIProviderClient {
    switch (config.provider) {
      case 'anthropic':
        return new AnthropicProviderClient(config.apiKey);
      case 'openai':
        return new OpenAIProviderClient(config.apiKey);
      case 'deepseek':
        return new DeepSeekProviderClient(config.apiKey);
      default: {
        const _exhaustive: never = config.provider;
        throw new Error(`Unsupported AI provider: ${String(_exhaustive)}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Config resolver — reads from Firestore, falls back to env vars
// ---------------------------------------------------------------------------

interface AIConfigDocument {
  provider: AIProvider;
  model: string;
  encryptedApiKey: string;
  enabled: boolean;
}

export async function getActiveAIConfig(userId: string): Promise<AIConfig> {
  try {
    const docRef = db
      .collection('aiConfig')
      .doc(userId)
      .collection('settings')
      .doc('active');

    const snap = await docRef.get();

    if (snap.exists) {
      const data = snap.data() as AIConfigDocument;
      if (data.enabled && data.encryptedApiKey) {
        const apiKey = decrypt(data.encryptedApiKey);
        return {
          provider: data.provider,
          model: data.model,
          apiKey,
          source: 'db',
        };
      }
    }
  } catch (err) {
    // Log but don't crash — fall through to env var
    console.error('[ai-provider] Failed to read Firestore config, falling back to env:', err);
  }

  // Env var fallback
  const envKey = config.ANTHROPIC_API_KEY;
  if (!envKey) {
    throw new Error(
      'No AI provider configured. Add an API key in Settings or set ANTHROPIC_API_KEY in .env',
    );
  }

  return {
    provider: 'anthropic',
    model: process.env.AGENT_MODEL ?? 'claude-sonnet-4-5',
    apiKey: envKey,
    source: 'env',
  };
}

// ---------------------------------------------------------------------------
// Validate that a given provider/model combination is known
// ---------------------------------------------------------------------------

export function validateProviderModel(provider: AIProvider, model: string): boolean {
  const providerConfig = PROVIDER_MODELS[provider];
  if (!providerConfig) return false;
  return providerConfig.models.some((m) => m.id === model);
}
