import { NextResponse } from "next/server";
import { runFieldDeskAgent } from "../../../lib/fielddesk-agent";
import type { AgentRunInput, IssueId, ResolutionState } from "../../../lib/fielddesk-types";

const issueIds: IssueId[] = ["roster", "funding", "justification"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const input = validateAgentRunInput(body);

  if (!input.ok) {
    return NextResponse.json({ error: "Invalid agent run request", details: input.errors }, { status: 400 });
  }

  const mode = process.env.FIELD_DESK_AGENT_MODE ?? "mock";

  if (mode !== "mock") {
    return NextResponse.json({ error: `Unsupported FIELD_DESK_AGENT_MODE: ${mode}` }, { status: 501 });
  }

  return NextResponse.json({
    mode,
    run: runFieldDeskAgent(input.value)
  });
}

function validateAgentRunInput(value: unknown): { ok: true; value: AgentRunInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ["Request body must be an object."] };
  }

  if (typeof value.intent !== "string" || value.intent.trim().length === 0) {
    errors.push("intent must be a non-empty string.");
  }

  if (!Array.isArray(value.selectedSources) || !value.selectedSources.every((source) => typeof source === "string")) {
    errors.push("selectedSources must be an array of strings.");
  }

  const resolutions = validateResolutions(value.resolutions);
  if (!resolutions.ok) {
    errors.push(...resolutions.errors);
  }

  if (typeof value.vehicleJustification !== "string") {
    errors.push("vehicleJustification must be a string.");
  }

  if (errors.length > 0 || !resolutions.ok) {
    return { ok: false, errors };
  }

  const intent = value.intent as string;
  const selectedSources = value.selectedSources as string[];
  const vehicleJustification = value.vehicleJustification as string;

  return {
    ok: true,
    value: {
      intent,
      selectedSources,
      resolutions: resolutions.value,
      vehicleJustification
    }
  };
}

function validateResolutions(value: unknown): { ok: true; value: ResolutionState } | { ok: false; errors: string[] } {
  if (!isRecord(value)) {
    return { ok: false, errors: ["resolutions must be an object."] };
  }

  const errors = issueIds
    .filter((issueId) => typeof value[issueId] !== "boolean")
    .map((issueId) => `resolutions.${issueId} must be a boolean.`);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      roster: value.roster as boolean,
      funding: value.funding as boolean,
      justification: value.justification as boolean
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
