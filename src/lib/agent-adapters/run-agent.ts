import { validateAgentRunOutput } from "../fielddesk-schemas";
import type { AgentMode, AgentRunInput, FieldDeskAgentRun } from "../fielddesk-types";
import { runMockAgent } from "./mock-agent";
import { runOpenAIAgent } from "./openai-agent";
import { runToolLoopAgent } from "./tool-loop-agent";

export class AgentOutputValidationError extends Error {
  constructor(readonly details: string[]) {
    super("Agent output failed validation.");
  }
}

export async function runAgent(mode: AgentMode, input: AgentRunInput): Promise<FieldDeskAgentRun> {
  const output = mode === "mock" ? await runMockAgent(input) : mode === "tool-loop" ? await runToolLoopAgent(input) : await runOpenAIAgent(input);
  const validation = validateAgentRunOutput(output);

  if (!validation.ok) {
    throw new AgentOutputValidationError(validation.errors);
  }

  return output;
}
