import type { AgentRunApiResponse, AgentRunInput, AgentRunTrigger, FieldDeskAgentRun } from "./fielddesk-types";

let sessionId = "demo-tdy-session";
let previousRunId: string | undefined;

export class FieldDeskApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details: string[] = []
  ) {
    super(message);
  }
}

export async function requestFieldDeskAgentRun(input: AgentRunInput, trigger: AgentRunTrigger = "initial_analysis"): Promise<FieldDeskAgentRun> {
  const response = await fetch("/api/agent-runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sessionId,
      previousRunId,
      trigger,
      input
    })
  });

  const payload = (await response.json()) as AgentRunApiResponse;

  if (!response.ok) {
    throw new FieldDeskApiError(payload.ok ? `Agent run failed with status ${response.status}` : payload.error.message, payload.ok ? "unknown_error" : payload.error.code, payload.ok ? [] : payload.error.details ?? []);
  }

  if (!payload.ok) {
    throw new FieldDeskApiError(payload.error.message, payload.error.code, payload.error.details ?? []);
  }

  sessionId = payload.envelope.sessionId;
  previousRunId = payload.envelope.runId;
  return payload.run;
}
