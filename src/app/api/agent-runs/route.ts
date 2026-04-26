import { NextResponse } from "next/server";
import { AgentOutputValidationError, runAgent } from "../../../lib/agent-adapters/run-agent";
import { parseAgentMode, validateAgentRunRequest } from "../../../lib/fielddesk-schemas";
import type { AgentRunApiResponse, AgentRunEnvelope } from "../../../lib/fielddesk-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedRequest = validateAgentRunRequest(body);

  if (!parsedRequest.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_request",
          message: "Invalid agent run request.",
          details: parsedRequest.errors
        }
      } satisfies AgentRunApiResponse,
      { status: 400 }
    );
  }

  const mode = parseAgentMode(process.env.FIELD_DESK_AGENT_MODE);

  if (!mode) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "unsupported_agent_mode",
          message: `Unsupported FIELD_DESK_AGENT_MODE: ${process.env.FIELD_DESK_AGENT_MODE}`
        }
      } satisfies AgentRunApiResponse,
      { status: 501 }
    );
  }

  try {
    const run = await runAgent(mode, parsedRequest.value.input);
    const envelope: AgentRunEnvelope = {
      sessionId: parsedRequest.value.sessionId ?? "demo-tdy-session",
      runId: crypto.randomUUID(),
      previousRunId: parsedRequest.value.previousRunId,
      mode,
      trigger: parsedRequest.value.trigger ?? "initial_analysis",
      status: "completed",
      createdAt: new Date().toISOString(),
      input: parsedRequest.value.input,
      output: run,
      events: run.activityTrail
    };

    return NextResponse.json({
      ok: true,
      envelope,
      run
    } satisfies AgentRunApiResponse);
  } catch (error) {
    if (error instanceof AgentOutputValidationError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "invalid_agent_output",
            message: "Agent output failed validation.",
            details: error.details
          }
        } satisfies AgentRunApiResponse,
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "agent_run_failed",
          message: error instanceof Error ? error.message : "Agent run failed."
        }
      } satisfies AgentRunApiResponse,
      { status: 500 }
    );
  }
}
