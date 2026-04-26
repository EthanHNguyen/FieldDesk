import type { AgentMode, AgentRunInput, AgentRunRequest, AgentRunTrigger, IssueId, ResolutionState } from "./fielddesk-types";

const issueIds: IssueId[] = ["roster", "funding", "justification"];
const triggers: AgentRunTrigger[] = ["initial_analysis", "correction_staged", "source_changed", "justification_edited"];
const expectedSourceRows = ["Outlook", "SharePoint", "GSA", "JTR", "Unit Checklist", "Local SOP"];

export function parseAgentMode(value: string | undefined): AgentMode | null {
  if (value === undefined || value === "mock") return "mock";
  if (value === "openai") return "openai";
  return null;
}

export function validateAgentRunRequest(value: unknown): { ok: true; value: AgentRunRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ["Request body must be an object."] };
  }

  if (value.sessionId !== undefined && typeof value.sessionId !== "string") {
    errors.push("sessionId must be a string when provided.");
  }

  if (value.previousRunId !== undefined && typeof value.previousRunId !== "string") {
    errors.push("previousRunId must be a string when provided.");
  }

  if (value.trigger !== undefined && (typeof value.trigger !== "string" || !triggers.includes(value.trigger as AgentRunTrigger))) {
    errors.push(`trigger must be one of: ${triggers.join(", ")}.`);
  }

  const input = validateAgentRunInput(value.input);
  if (!input.ok) {
    errors.push(...input.errors);
  }

  if (errors.length > 0 || !input.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      sessionId: value.sessionId as string | undefined,
      previousRunId: value.previousRunId as string | undefined,
      trigger: (value.trigger as AgentRunTrigger | undefined) ?? "initial_analysis",
      input: input.value
    }
  };
}

export function validateAgentRunOutput(value: unknown): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ["Agent output must be an object."] };
  }

  if (!isRecord(value.mission)) {
    errors.push("mission must be an object.");
  } else if (!value.mission.workflow || !value.mission.destination || !value.mission.dates || !value.mission.travelers) {
    errors.push("mission must include workflow, destination, dates, and travelers.");
  }

  if (!Array.isArray(value.evidenceMap) || value.evidenceMap.length === 0) {
    errors.push("evidenceMap must contain at least one item.");
  }

  if (!Array.isArray(value.sourceSearchResults) || !hasExpectedSourceRows(value.sourceSearchResults)) {
    errors.push(`sourceSearchResults must include: ${expectedSourceRows.join(", ")}.`);
  }

  if (!isRecord(value.readiness)) {
    errors.push("readiness must be an object.");
  } else if (typeof value.readiness.score !== "number" || value.readiness.score < 0 || value.readiness.score > 100) {
    errors.push("readiness.score must be between 0 and 100.");
  }

  if (!isRecord(value.readiness) || typeof value.readiness.risk !== "string" || !["High", "Low"].includes(value.readiness.risk)) {
    errors.push("readiness.risk must be High or Low.");
  }

  if (!Array.isArray(value.issues) || value.issues.length === 0) {
    errors.push("issues must contain at least one item.");
  }

  if (!isRecord(value.objectOutput)) {
    errors.push("objectOutput must be an object-native agent result.");
  } else {
    if (!Array.isArray(value.objectOutput.evidenceMap) || value.objectOutput.evidenceMap.length === 0) {
      errors.push("objectOutput.evidenceMap must contain at least one item.");
    }
    if (!Array.isArray(value.objectOutput.sourceSearchResults) || !hasExpectedObjectSourceRows(value.objectOutput.sourceSearchResults)) {
      errors.push(`objectOutput.sourceSearchResults must include: ${expectedSourceRows.join(", ")}.`);
    }
    if (!Array.isArray(value.objectOutput.findings) || value.objectOutput.findings.length === 0) {
      errors.push("objectOutput.findings must contain at least one item.");
    }
    if (!isRecord(value.objectOutput.generatedWorkProduct)) {
      errors.push("objectOutput.generatedWorkProduct must be an object.");
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

function validateAgentRunInput(value: unknown): { ok: true; value: AgentRunInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ["input must be an object."] };
  }

  if (typeof value.intent !== "string" || value.intent.trim().length === 0) {
    errors.push("input.intent must be a non-empty string.");
  }

  if (!Array.isArray(value.selectedSources) || !value.selectedSources.every((source) => typeof source === "string")) {
    errors.push("input.selectedSources must be an array of strings.");
  }

  const resolutions = validateResolutions(value.resolutions);
  if (!resolutions.ok) {
    errors.push(...resolutions.errors);
  }

  if (typeof value.vehicleJustification !== "string") {
    errors.push("input.vehicleJustification must be a string.");
  }

  if (errors.length > 0 || !resolutions.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      intent: value.intent as string,
      selectedSources: value.selectedSources as string[],
      resolutions: resolutions.value,
      vehicleJustification: value.vehicleJustification as string
    }
  };
}

function validateResolutions(value: unknown): { ok: true; value: ResolutionState } | { ok: false; errors: string[] } {
  if (!isRecord(value)) {
    return { ok: false, errors: ["input.resolutions must be an object."] };
  }

  const errors = issueIds
    .filter((issueId) => typeof value[issueId] !== "boolean")
    .map((issueId) => `input.resolutions.${issueId} must be a boolean.`);

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

function hasExpectedSourceRows(rows: unknown[]) {
  const sources = rows.map((row) => Array.isArray(row) ? row[0] : undefined);
  return expectedSourceRows.every((source) => sources.includes(source));
}

function hasExpectedObjectSourceRows(rows: unknown[]) {
  const sources = rows.map((row) => isRecord(row) ? row.source : undefined);
  return expectedSourceRows.every((source) => sources.includes(source));
}
