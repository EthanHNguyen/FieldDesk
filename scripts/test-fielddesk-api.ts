import assert from "node:assert/strict";
import { runAgent } from "../src/lib/agent-adapters/run-agent";
import { parseAgentMode, validateAgentRunOutput, validateAgentRunRequest } from "../src/lib/fielddesk-schemas";
import type { AgentRunInput } from "../src/lib/fielddesk-types";

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

async function main() {
  const validRequest = validateAgentRunRequest({
    sessionId: "test-session",
    trigger: "initial_analysis",
    input
  });
  assert.equal(validRequest.ok, true);

  const invalidRequest = validateAgentRunRequest({
    trigger: "invalid",
    input: {
      ...input,
      resolutions: {
        roster: true
      }
    }
  });
  assert.equal(invalidRequest.ok, false);
  assert.match(invalidRequest.errors.join(" "), /trigger must be one of/);
  assert.match(invalidRequest.errors.join(" "), /input\.resolutions\.funding/);

  assert.equal(parseAgentMode("mock"), "mock");
  assert.equal(parseAgentMode("openai"), "openai");
  assert.equal(parseAgentMode("unsupported"), null);

  const run = await runAgent("mock", input);
  assert.equal(run.mission.destination, "Demo Training Site");
  assert.equal(run.objectOutput.mission.destination, "Demo Training Site");
  assert.ok(run.objectOutput.evidenceMap.length > 0);
  assert.ok(run.objectOutput.findings.some((finding) => finding.id === "funding" && finding.status === "Missing"));

  const validOutput = validateAgentRunOutput(run);
  assert.equal(validOutput.ok, true);

  const malformedOutput = validateAgentRunOutput({
    ...run,
    objectOutput: undefined
  });
  assert.equal(malformedOutput.ok, false);
  assert.match(malformedOutput.errors.join(" "), /objectOutput/);

  const correctedRun = await runAgent("mock", {
    ...input,
    resolutions: {
      roster: true,
      funding: true,
      justification: true
    },
    vehicleJustification:
      "Rental vehicles are required because the training site, lodging, and equipment pickup points are separated and no unit shuttle is available during the training window."
  });
  assert.equal(correctedRun.readiness.risk, "Low");
  assert.ok(correctedRun.objectOutput.generatedWorkProduct.dtsRows.some((row) => row.value.includes("Demo Training Site")));

  console.log("FieldDesk API contract tests passed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
