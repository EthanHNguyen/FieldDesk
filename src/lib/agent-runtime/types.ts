export type AgentMessage =
  | {
      role: "user";
      content: string;
    }
  | {
      role: "assistant";
      content?: string;
      toolCalls?: AgentToolCall[];
    }
  | {
      role: "tool";
      toolCallId: string;
      toolName: string;
      content: string;
    };

export type AgentToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type AgentToolDefinition<TContext = unknown> = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, context: TContext) => Promise<unknown> | unknown;
};

export type AgentRuntimeEvent = {
  type: string;
  elapsedMs?: number;
  data?: Record<string, unknown>;
};

export type AgentContext<TContext = unknown> = {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: AgentToolDefinition<TContext>[];
  toolContext: TContext;
};

export type AgentRuntimeOptions = {
  model: string;
  apiKey: string;
  title: string;
  maxTurns: number;
  transformContext?: (messages: AgentMessage[]) => AgentMessage[];
  emit?: (event: AgentRuntimeEvent) => void;
};

export type AgentLoopResult = {
  messages: AgentMessage[];
  stopReason: string;
  turns: number;
};
