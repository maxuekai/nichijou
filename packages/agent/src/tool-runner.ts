import type { ToolDefinition, ToolResult, ToolCall } from "@nichijou/shared";

export class ToolRunner {
  private tools: Map<string, ToolDefinition>;

  constructor(tools: ToolDefinition[]) {
    this.tools = new Map(tools.map((t) => [t.name, t]));
  }

  setTools(tools: ToolDefinition[]): void {
    this.tools = new Map(tools.map((t) => [t.name, t]));
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.function.name);
    if (!tool) {
      return {
        content: `Unknown tool: ${toolCall.function.name}`,
        isError: true,
      };
    }

    let params: Record<string, unknown>;
    try {
      params = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      return {
        content: `Failed to parse tool arguments: ${toolCall.function.arguments}`,
        isError: true,
      };
    }

    try {
      return await tool.execute(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Tool execution error: ${message}`, isError: true };
    }
  }
}
