import { describe, it, expect } from 'vitest';

// Test the tool registry pattern inline — mirrors backend/src/tools/registry.ts
interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  execute(params: Record<string, unknown>, context: unknown): Promise<ToolResult>;
}

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, params: Record<string, unknown>, context: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { success: false, error: `Unknown tool: ${name}` };
    try {
      return await tool.execute(params, context);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  toAnthropicTools(): Array<{ name: string; description: string; input_schema: ToolDefinition['inputSchema'] }> {
    return this.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }
}

describe('Tool Registry', () => {
  it('registers and retrieves tools', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'echo',
      description: 'Echo a message',
      category: 'test',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string', description: 'Message to echo' } },
        required: ['message'],
      },
      async execute(params) {
        return { success: true, data: { echo: params['message'] } };
      },
    });
    expect(registry.getNames()).toContain('echo');
  });

  it('executes registered tool', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'add',
      description: 'Add two numbers',
      category: 'math',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' },
        },
        required: ['a', 'b'],
      },
      async execute(params) {
        const result = (params['a'] as number) + (params['b'] as number);
        return { success: true, data: { result } };
      },
    });
    const result = await registry.execute('add', { a: 2, b: 3 }, {});
    expect(result.success).toBe(true);
    expect(result.data?.result).toBe(5);
  });

  it('returns error for unknown tool', async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute('nonexistent', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('nonexistent');
  });

  it('converts to Anthropic tool format', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'myTool',
      description: 'A test tool',
      category: 'test',
      inputSchema: { type: 'object', properties: {}, required: [] },
      async execute() { return { success: true }; },
    });
    const tools = registry.toAnthropicTools();
    expect(tools[0].name).toBe('myTool');
    expect(tools[0].description).toBe('A test tool');
    expect(tools[0].input_schema).toBeDefined();
  });

  it('get returns undefined for unknown tool', () => {
    const registry = new ToolRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('catches and wraps tool execution errors', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'faulty',
      description: 'A faulty tool',
      category: 'test',
      inputSchema: { type: 'object', properties: {}, required: [] },
      async execute() { throw new Error('Tool exploded'); },
    });
    const result = await registry.execute('faulty', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool exploded');
  });
});
