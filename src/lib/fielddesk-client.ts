import type { AgentRunInput, FieldDeskAgentRun } from "./fielddesk-types";

export async function requestFieldDeskAgentRun(input: AgentRunInput): Promise<FieldDeskAgentRun> {
  const response = await fetch("/api/agent-runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`Agent run failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { run: FieldDeskAgentRun };
  return payload.run;
}
