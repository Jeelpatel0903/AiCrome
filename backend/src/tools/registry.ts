export type ToolCategory =
  | 'navigation'
  | 'observation'
  | 'interaction'
  | 'form'
  | 'memory'
  | 'identity'
  | 'communication'
  | 'workflow';

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
  execute: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  userId: string;
  sessionId: string;
  sendProgress: (type: string, message: string) => Promise<void>;
  // Bridge: send action to Chrome extension and wait for result
  sendBridgeAction: (action: string, params: Record<string, unknown>) => Promise<BridgeResult>;
}

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface BridgeResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: ToolDefinition['inputSchema'];
}

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  // Convert to Anthropic API tools format
  toAnthropicTools(): AnthropicTool[] {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  async execute(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }
    try {
      return await Promise.race([
        tool.execute(params, context),
        new Promise<ToolResult>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool ${name} timed out after 30s`)), 30000),
        ),
      ]);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const toolRegistry = new ToolRegistry();
