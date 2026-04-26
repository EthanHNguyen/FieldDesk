import { runFieldDeskAgent } from "../fielddesk-agent";
import type { AgentRunInput, FieldDeskAgentRun } from "../fielddesk-types";

export async function runMockAgent(input: AgentRunInput): Promise<FieldDeskAgentRun> {
  return runFieldDeskAgent(input);
}
