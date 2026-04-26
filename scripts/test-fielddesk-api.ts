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
  assert.equal(parseAgentMode("tool-loop"), "tool-loop");
  assert.equal(parseAgentMode("unsupported"), null);

  const run = await runAgent("mock", input);
  assert.equal(run.mission.destination, "Demo Training Site");
  assert.equal(run.objectOutput.mission.destination, "Demo Training Site");
  assert.ok(run.objectOutput.evidenceMap.length > 0);
  assert.deepEqual(run.objectOutput.evidenceMap.map((item) => item.requirement), [
    "Mission purpose",
    "Travel dates",
    "Destination",
    "Traveler roster",
    "Approval",
    "Per diem estimate",
    "Policy reference",
    "Unit checklist",
    "Rental vehicle justification",
    "Funding source"
  ]);
  assert.ok(run.objectOutput.findings.some((finding) => finding.id === "funding" && finding.status === "Missing"));
  assert.deepEqual(run.sourceSearchResults.map(([source]) => source), ["Outlook", "SharePoint", "GSA", "JTR", "Unit Checklist", "Local SOP"]);
  assert.deepEqual(run.objectOutput.sourceSearchResults.map((row) => row.source), ["Outlook", "SharePoint", "GSA", "JTR", "Unit Checklist", "Local SOP"]);
  assert.ok(run.agentTrace && run.agentTrace.length > 0);
  assert.ok(run.objectOutput.agentTrace && run.objectOutput.agentTrace.length > 0);
  assert.equal(run.objectOutput.tripFacts?.startDate, "2026-06-10");
  assert.equal(run.objectOutput.tripFacts?.endDate, "2026-06-14");
  assert.equal(run.objectOutput.tripFacts?.travelers, 10);
  assert.equal(run.objectOutput.evidenceMap.find((item) => item.requirement === "Per diem estimate")?.mathVerified, true);
  assert.match(run.objectOutput.evidenceMap.find((item) => item.requirement === "Per diem estimate")?.evidenceSummary ?? "", /total \$7,340/);
  assert.ok(run.dtsRows.some(([field, value]) => field === "Per Diem" && value.includes("$7,340")));
  assert.equal(run.objectOutput.evidenceMap.find((item) => item.requirement === "Rental vehicle justification")?.policyReference?.source, "Local SOP");

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

  const noGsaRun = await runAgent("mock", {
    ...input,
    selectedSources: input.selectedSources.filter((source) => source !== "GSA")
  });
  const noGsaPerDiem = noGsaRun.objectOutput.evidenceMap.find((item) => item.requirement === "Per diem estimate");
  assert.equal(noGsaPerDiem?.status, "Missing");
  assert.equal(noGsaPerDiem?.mathVerified, undefined);
  assert.match(noGsaRun.dtsRows.find(([field]) => field === "Per Diem")?.[1] ?? "", /Missing GSA source/);

  const noSharePointRun = await runAgent("mock", {
    ...input,
    selectedSources: input.selectedSources.filter((source) => source !== "SharePoint")
  });
  const noSharePointRoster = noSharePointRun.objectOutput.evidenceMap.find((item) => item.requirement === "Traveler roster");
  assert.equal(noSharePointRoster?.status, "Missing");
  assert.deepEqual(noSharePointRoster?.evidenceArtifactIds, []);

  console.log("FieldDesk API contract tests passed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
