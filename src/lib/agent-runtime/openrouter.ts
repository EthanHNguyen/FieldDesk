import type { AgentContext, AgentLoopResult, AgentMessage, AgentRuntimeOptions, AgentToolCall, AgentToolDefinition } from "./types";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

type OpenRouterCompletion = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
};

type OpenRouterToolCall = NonNullable<NonNullable<NonNullable<OpenRouterCompletion["choices"]>[number]["message"]>["tool_calls"]>[number];

export async function runOpenRouterAgentLoop<TContext>(
  context: AgentContext<TContext>,
  options: AgentRuntimeOptions
): Promise<AgentLoopResult> {
  const startedAt = Date.now();

  for (let turn = 1; turn <= options.maxTurns; turn += 1) {
    const turnStartedAt = Date.now();
    options.emit?.({ type: "turn_start", data: { turn, messages: context.messages.length } });

    const messages = options.transformContext ? options.transformContext(context.messages) : context.messages;
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: openRouterHeaders(options.apiKey, options.title),
      body: JSON.stringify({
        model: options.model,
        messages: toOpenRouterMessages(context.systemPrompt, messages),
        tools: context.tools.map((tool) => toOpenRouterTool(tool)),
        tool_choice: "auto"
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenRouter agent loop failed with status ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const completion = await response.json() as OpenRouterCompletion;
    const message = completion.choices?.[0]?.message;
    const assistantMessage: AgentMessage = {
      role: "assistant",
      content: message?.content ?? undefined,
      toolCalls: normalizeToolCalls(message?.tool_calls)
    };
    context.messages.push(assistantMessage);
    options.emit?.({
      type: "model_response_end",
      elapsedMs: Date.now() - turnStartedAt,
      data: {
        turn,
        finishReason: completion.choices?.[0]?.finish_reason,
        toolCalls: assistantMessage.toolCalls?.map((toolCall) => toolCall.name) ?? []
      }
    });

    if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
      return {
        messages: context.messages,
        stopReason: assistantMessage.content?.trim() || "Model returned without tool calls.",
        turns: turn
      };
    }

    const results = await Promise.all(
      assistantMessage.toolCalls.map(async (toolCall) => executeToolCall(toolCall, context.tools, context.toolContext, options))
    );
    context.messages.push(...results);
  }

  options.emit?.({
    type: "agent_max_turns",
    elapsedMs: Date.now() - startedAt,
    data: { maxTurns: options.maxTurns, messages: context.messages.length }
  });
  return {
    messages: context.messages,
    stopReason: "Max agent turns reached.",
    turns: options.maxTurns
  };
}

function toOpenRouterMessages(systemPrompt: string, messages: AgentMessage[]): OpenRouterMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map((message): OpenRouterMessage => {
      if (message.role === "tool") {
        return {
          role: "tool",
          tool_call_id: message.toolCallId,
          name: message.toolName,
          content: message.content
        };
      }
      if (message.role === "assistant") {
        return {
          role: "assistant",
          content: message.content ?? null,
          tool_calls: message.toolCalls?.map((toolCall) => ({
            id: toolCall.id,
            type: "function",
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.args)
            }
          }))
        };
      }
      return message;
    })
  ];
}

function toOpenRouterTool<TContext>(tool: AgentToolDefinition<TContext>) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  };
}

async function executeToolCall<TContext>(
  toolCall: AgentToolCall,
  tools: AgentToolDefinition<TContext>[],
  toolContext: TContext,
  options: AgentRuntimeOptions
): Promise<AgentMessage> {
  const startedAt = Date.now();
  const tool = tools.find((candidate) => candidate.name === toolCall.name);
  options.emit?.({ type: "tool_execution_start", data: { toolName: toolCall.name, args: toolCall.args } });

  const result = tool
    ? await Promise.resolve(tool.execute(toolCall.args, toolContext))
    : { ok: false, error: `Unknown tool: ${toolCall.name}` };

  options.emit?.({
    type: "tool_execution_end",
    elapsedMs: Date.now() - startedAt,
    data: { toolName: toolCall.name, summary: summarizeResult(result) }
  });

  return {
    role: "tool",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: JSON.stringify(result)
  };
}

function normalizeToolCalls(toolCalls: OpenRouterToolCall[] | undefined): AgentToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;

  return toolCalls.map((toolCall, index) => ({
    id: toolCall.id ?? `tool-${Date.now()}-${index}`,
    name: toolCall.function?.name ?? "",
    args: parseArgs(toolCall.function?.arguments)
  }));
}

function parseArgs(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function summarizeResult(result: unknown) {
  if (isRecord(result) && result.ok === false && typeof result.error === "string") return result.error;
  if (isRecord(result) && result.ok === true) return "Tool completed.";
  return "Tool returned a result.";
}

export function openRouterHeaders(apiKey: string, title: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": title
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
