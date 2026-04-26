import assert from "node:assert/strict";
import { AgentOutputValidationError, runAgent } from "../src/lib/agent-adapters/run-agent";
import { validateAgentRunOutput } from "../src/lib/fielddesk-schemas";
import type { AgentRunInput, TripFacts } from "../src/lib/fielddesk-types";

const input: AgentRunInput = {
  intent: "Send 10 soldiers to Demo Training Site for training from June 10-14. Lodging and rental vehicles required.",
  selectedSources: ["Outlook", "SharePoint", "GSA", "JTR", "Unit Checklist", "Local SOP"],
  resolutions: {
    roster: false,
    funding: false,
    justification: false
  },
  vehicleJustification: ""
};

const tripFacts: TripFacts = {
  destination: "Demo Training Site",
  locality: "Demo Training Site, GA",
  startDate: "2026-06-10",
  endDate: "2026-06-14",
  travelers: 10,
  evidenceArtifactIds: ["sp-001"],
  confidence: 0.95,
  rationale: "Training order states Demo Training Site, GA, June 10-14, 2026, for 10 soldiers."
};

async function main() {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalDecisions = process.env.FIELD_DESK_TEST_TOOL_LOOP_DECISIONS;
  const originalFinal = process.env.FIELD_DESK_TEST_TOOL_LOOP_FINAL;

  try {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.FIELD_DESK_TEST_TOOL_LOOP_FINAL = "mock";
    process.env.FIELD_DESK_TEST_TOOL_LOOP_DECISIONS = JSON.stringify([
      { kind: "finish", rationale: "Trying to finish too early." },
      { kind: "tool_call", toolName: "readArtifact", args: { artifactId: "sp-004" } },
      { kind: "tool_call", toolName: "searchSource", args: { source: "SharePoint", query: "training order roster" } },
      { kind: "tool_call", toolName: "readArtifact", args: { artifactId: "sp-001" } },
      { kind: "tool_call", toolName: "searchSource", args: { source: "Outlook", query: "approval reviewer funding" } },
      { kind: "tool_call", toolName: "readArtifact", args: { artifactId: "outlook-001" } },
      { kind: "tool_call", toolName: "searchSource", args: { source: "GSA", query: "Demo Training Site per diem" } },
      { kind: "tool_call", toolName: "calculatePerDiem", args: { tripFacts } },
      { kind: "tool_call", toolName: "retrievePolicyReference", args: { topic: "TDY packet funding and transportation justification" } },
      { kind: "finish", rationale: "Required evidence has been collected." }
    ]);

    const run = await runAgent("tool-loop", input);
    const validation = validateAgentRunOutput(run);
    assert.equal(validation.ok, true);

    const traceText = run.agentTrace.map((step) => `${step.label} ${step.observationSummary ?? ""}`).join(" ");
    assert.match(traceText, /Finish rejected/);
    assert.match(traceText, /not available until its correction is staged/);
    assert.match(traceText, /Verified per diem total \$7,340/);
    assert.match(traceText, /Finish evidence collection/);
    assert.ok(run.agentTrace.length <= 18);
    assert.equal(run.objectOutput.evidenceMap.find((item) => item.requirement === "Per diem estimate")?.mathVerified, true);

    console.log("FieldDesk tool-loop agent tests passed.");
  } finally {
    restoreEnv("OPENROUTER_API_KEY", originalKey);
    restoreEnv("FIELD_DESK_TEST_TOOL_LOOP_DECISIONS", originalDecisions);
    restoreEnv("FIELD_DESK_TEST_TOOL_LOOP_FINAL", originalFinal);
  }
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

main().catch((error: unknown) => {
  if (error instanceof AgentOutputValidationError) {
    console.error("Agent output failed validation:");
    for (const detail of error.details) console.error(`- ${detail}`);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
