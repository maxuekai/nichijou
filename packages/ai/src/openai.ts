import type { Message, ToolCall, ToolDefinition } from "@nichijou/shared";
import { LLMError } from "@nichijou/shared";
import type {
  ChatRequest,
  ChatResponse,
  LLMProvider,
  ProviderConfig,
  StreamEvent,
  Usage,
} from "./types.js";

interface OpenAIMessage {
  role: string;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function toOpenAIMessages(messages: Message[]): OpenAIMessage[] {
  return messages.map((m) => {
    const msg: OpenAIMessage = { role: m.role, content: m.content };
    if (m.name) msg.name = m.name;
    if (m.toolCallId) msg.tool_call_id = m.toolCallId;
    if (m.toolCalls && m.toolCalls.length > 0) {
      msg.tool_calls = m.toolCalls;
      if (!msg.content) msg.content = null;
    }
    return msg;
  });
}

function toOpenAITools(tools: ToolDefinition[]): OpenAITool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function fromOpenAIMessage(choice: Record<string, unknown>): Message {
  const msg = choice.message as Record<string, unknown>;
  const result: Message = {
    role: msg.role as Message["role"],
    content: (msg.content as string) ?? "",
  };
  if (msg.tool_calls) {
    result.toolCalls = msg.tool_calls as ToolCall[];
  }
  return result;
}

function extractUsage(data: Record<string, unknown>): Usage {
  const u = (data.usage ?? {}) as Record<string, number>;
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens: u.total_tokens ?? 0,
  };
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = this.buildRequestBody(request, false);
    const data = await this.fetchJSON("/chat/completions", body);

    const choices = data.choices as Record<string, unknown>[];
    if (!choices?.[0]) {
      throw new LLMError("No choices in response");
    }

    return {
      message: fromOpenAIMessage(choices[0]),
      usage: extractUsage(data),
      finishReason: (choices[0].finish_reason as string) ?? "stop",
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<StreamEvent> {
    const body = this.buildRequestBody(request, true);
    const response = await this.fetchRaw("/chat/completions", body);

    if (!response.body) {
      throw new LLMError("No response body for streaming");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const accumulated: {
      content: string;
      toolCalls: Map<number, { id: string; name: string; arguments: string }>;
    } = { content: "", toolCalls: new Map() };
    let finishReason = "stop";
    let usage: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(payload) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (parsed.usage) {
            usage = extractUsage(parsed);
          }

          const choices = parsed.choices as Record<string, unknown>[] | undefined;
          if (!choices?.[0]) continue;
          const delta = choices[0].delta as Record<string, unknown> | undefined;
          if (!delta) continue;

          if (choices[0].finish_reason) {
            finishReason = choices[0].finish_reason as string;
          }

          if (typeof delta.content === "string" && delta.content) {
            accumulated.content += delta.content;
            yield { type: "text_delta", delta: delta.content };
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls as Record<string, unknown>[]) {
              const idx = tc.index as number;
              const fn = tc.function as Record<string, string> | undefined;
              if (!accumulated.toolCalls.has(idx)) {
                accumulated.toolCalls.set(idx, {
                  id: (tc.id as string) ?? "",
                  name: fn?.name ?? "",
                  arguments: "",
                });
              }
              const entry = accumulated.toolCalls.get(idx)!;
              if (tc.id) entry.id = tc.id as string;
              if (fn?.name) entry.name = fn.name;
              if (fn?.arguments) {
                entry.arguments += fn.arguments;
                yield {
                  type: "tool_call_delta",
                  toolCallId: entry.id,
                  name: entry.name,
                  argumentsDelta: fn.arguments,
                };
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const message: Message = {
      role: "assistant",
      content: accumulated.content,
    };
    if (accumulated.toolCalls.size > 0) {
      message.toolCalls = [...accumulated.toolCalls.values()].map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }

    yield { type: "done", message, usage, finishReason };
  }

  private buildRequestBody(
    request: ChatRequest,
    stream: boolean,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model ?? this.config.model,
      messages: toOpenAIMessages(request.messages),
      stream,
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.tools && request.tools.length > 0) {
      body.tools = toOpenAITools(request.tools);
    }
    if (stream) {
      body.stream_options = { include_usage: true };
    }
    return body;
  }

  private async fetchJSON(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetchRaw(path, body);
    const data = (await response.json()) as Record<string, unknown>;
    if (data.error) {
      const err = data.error as Record<string, string>;
      throw new LLMError(err.message ?? "Unknown LLM error");
    }
    return data;
  }

  private async fetchRaw(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout ?? 120_000),
    });

    if (!response.ok) {
      let errMsg = `LLM API error: ${response.status} ${response.statusText}`;
      try {
        const errBody = (await response.json()) as Record<string, unknown>;
        if (errBody.error) {
          const e = errBody.error as Record<string, string>;
          errMsg = e.message ?? errMsg;
        }
      } catch {
        // ignore parse error
      }
      throw new LLMError(errMsg);
    }

    return response;
  }
}
